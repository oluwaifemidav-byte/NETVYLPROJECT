export function whatsappLink(phone: string | null | undefined, message: string) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.startsWith('0')) digits = `234${digits.slice(1)}`
  if (!digits || digits.length < 8) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
