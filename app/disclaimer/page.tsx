import Link from 'next/link'

export const metadata = { title: 'Disclaimer | NETVYL' }

export default function DisclaimerPage() {
  return <main style={{ minHeight: '100vh', padding: '32px 20px', background: '#0b1220', color: '#e5eef7' }}>
    <article className="card" style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}><div><h1>NETVYL Disclaimer</h1><p className="cell-sub">Last updated: 9 October 2026</p></div><Link href="/" className="btn">NETVYL home</Link></div>
      <div className="notice" style={{ margin: '20px 0' }}><strong>Review before publication:</strong> This is a general working draft, not legal advice. Have a qualified lawyer review it alongside the Terms &amp; Conditions and a separate privacy notice.</div>
      <section><h2>Business tools, not professional advice</h2><p>NETVYL is software for managing business operations. It is not an accounting, tax, legal, financial, employment, safety or other professional advisory service. Reports and calculations are provided as operational aids and should be checked by a suitably qualified person before being used for accounting, tax, regulatory or other important decisions.</p></section>
      <section><h2>Check calculations and records</h2><p>Prices, quantities, estimates, profit figures, stock levels, balances, job details and other outputs depend on the information entered, the configuration selected and the data available at the time. Users and organizations are responsible for checking entries, settings and results, and for keeping their records accurate and current. NETVYL does not guarantee that an estimate or report will match a final transaction.</p></section>
      <section><h2>Backups and connectivity</h2><p>NETVYL may provide offline drafts, synchronization, exports or backup tools, but these features are not a substitute for an organization’s own backup and continuity procedures. Keep independent copies of important information and verify that they can be accessed. Internet, device, hosting or third-party service interruptions may delay synchronization or access.</p></section>
      <section><h2>Third-party services and links</h2><p>NETVYL may rely on or link to third-party services. Those services are governed by their own terms and privacy practices. NETVYL does not control and is not responsible for third-party services, content, availability or security.</p></section>
      <section><h2>No guarantee of results</h2><p>Use of NETVYL does not guarantee sales, profit, productivity, compliance or business growth. Organizations remain responsible for their business decisions, customer commitments, staff actions, legal obligations and use of the Service.</p></section>
      <section><h2>Contact</h2><p>Questions about this disclaimer can be sent to <a href="mailto:netvylresources@gmail.com">netvylresources@gmail.com</a>.</p></section>
      <p style={{ marginTop: 28 }}><Link href="/terms">Read the NETVYL Terms &amp; Conditions</Link></p>
    </article>
  </main>
}
