// Lightweight, dependency-free PDF generator for NETVYL reports.
// It intentionally generates simple text/table PDFs so exports work in web,
// Electron and Capacitor without an external PDF library.

// The report PDF uses the built-in Helvetica font with no custom /Encoding,
// so only plain ASCII (0x20-0x7E) is guaranteed to render correctly. Any
// other character (₦, →, —, curly quotes, accents, etc.) must be mapped to
// a safe ASCII fallback first, or it will come out as garbled bytes/boxes
// in the exported PDF.
const PDF_CHAR_MAP: Record<string,string> = {
  '₦':'NGN ', '→':'->', '←':'<-', '—':'-', '–':'-', '×':'x',
  '’':"'", '‘':"'", '“':'"', '”':'"', '…':'...', '•':'-', '≈':'~',
}

function toPdfSafeText(value: unknown) {
  const raw = String(value ?? '')
  let out = ''
  for (const ch of raw) {
    if (PDF_CHAR_MAP[ch]) { out += PDF_CHAR_MAP[ch]; continue }
    const code = ch.codePointAt(0) || 0
    out += (code >= 0x20 && code <= 0x7E) ? ch : '?'
  }
  return out
}

function escPdf(value: unknown) {
  return toPdfSafeText(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
}

function wrap(text: string, width = 92) {
  const words = String(text).split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line)
      line = word
    } else line = (line + ' ' + word).trim()
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function downloadTextPdf(filename: string, title: string, lines: string[]) {
  const content: string[] = ['BT', '/F1 9 Tf', '40 800 Td']
  let y = 800
  const addLine = (line: string, size = 9, gap = 14) => {
    content.push(`/F1 ${size} Tf`)
    content.push(`0 -${gap} Td`)
    content.push(`(${escPdf(line)}) Tj`)
    y -= gap
  }
  content.push(`/F1 16 Tf`, `(${escPdf(title)}) Tj`)
  y -= 24
  for (const raw of lines) {
    for (const line of wrap(raw)) {
      if (y < 45) {
        content.push('ET')
        content.push('BT','/F1 9 Tf','40 800 Td')
        y = 800
      }
      addLine(line)
    }
  }
  content.push('ET')
  const stream = content.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (let i=0;i<objects.length;i++) {
    offsets.push(new TextEncoder().encode(pdf).length)
    pdf += `${i+1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xref = new TextEncoder().encode(pdf).length
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`
  for (let i=1;i<offsets.length;i++) pdf += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  const blob = new Blob([pdf],{type:'application/pdf'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click()
  setTimeout(()=>URL.revokeObjectURL(url),1000)
}

export function money(value: unknown, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value||0))
}
