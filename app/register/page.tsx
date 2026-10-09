'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'

type Contact = { payment_email?: string | null; payment_phone?: string | null }
type Package = { code: string; name: string; description: string; monthly_price: number; yearly_price: number; max_users: number | null }

const defaultPackages: Package[] = [
  { code: 'professional', name: 'Professional', description: 'Full print-shop operations for growing businesses', monthly_price: 15000, yearly_price: 150000, max_users: 10 },
  { code: 'enterprise', name: 'Enterprise', description: 'Expanded workspace with higher limits and priority support', monthly_price: 50000, yearly_price: 500000, max_users: 50 },
]

const naira = (amount: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount)

export default function LicenseContactPage() {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactLoading, setContactLoading] = useState(true)
  const [contactError, setContactError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [submitFailed, setSubmitFailed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [business, setBusiness] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [seats, setSeats] = useState('')
  const [packages, setPackages] = useState<Package[]>(defaultPackages)
  const [selectedPackage, setSelectedPackage] = useState('professional')

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const response = await fetch('/api/license-inquiry')
        const data = await response.json().catch(() => ({}))
        if (!mounted) return
        if (!response.ok) throw new Error(data?.error || 'Unable to load sales contact details.')
        setContact({ payment_email: data?.payment_email || '', payment_phone: data?.payment_phone || '' })
      } catch (error: any) {
        if (!mounted) return
        setContact(null)
        setContactError(error?.message || 'Unable to load sales contact details.')
      } finally {
        if (mounted) setContactLoading(false)
      }
    })()

    supabase.from('subscription_plans')
      .select('code,name,description,monthly_price,yearly_price,max_users')
      .eq('active', true)
      .neq('code', 'trial')
      .order('monthly_price')
      .then(({ data }) => {
        if (data?.length) {
          const available = data as Package[]
          setPackages(available)
          setSelectedPackage(available[0].code)
        }
      })

    return () => {
      mounted = false
    }
  }, [supabase])

  const packageName = packages.find(item => item.code === selectedPackage)?.name || selectedPackage
  const recipient = contact?.payment_email?.trim() || ''

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setSubmitMessage('')
    setSubmitFailed(false)

    try {
      const response = await fetch('/api/license-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          business,
          email,
          seats,
          packageCode: selectedPackage,
          packageName,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setSubmitFailed(true)
        setSubmitMessage(String(result?.error || 'Unable to submit inquiry right now. Please try again.'))
        return
      }

      setSubmitMessage(String(result?.message || 'Your inquiry was submitted successfully.'))
    } catch (error: any) {
      setSubmitFailed(true)
      setSubmitMessage(error?.message || 'Unable to submit inquiry right now. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
    <section className="card" style={{ maxWidth: 620, width: '100%' }}>
      <div className="brand-block" style={{ marginBottom: 20 }}>
        <div className="brand-mark large">N</div>
        <div><div className="brand-name">NETVYL</div><div className="brand-sub">LICENSE SALES</div></div>
      </div>
      <h2>Purchase a NETVYL license</h2>
      <p className="cell-sub">Tell us about your business and we’ll contact you with the right plan, current pricing, and payment details.</p>

      <h3 style={{ marginTop: 24 }}>Choose a package</h3>
      <div className="workspace-grid" style={{ marginTop: 12 }}>
        {packages.map(item => <article key={item.code} className="card" style={{ borderColor: selectedPackage === item.code ? 'var(--brand-accent)' : undefined }}>
          <div className="ma-row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <h3 style={{ margin: 0 }}>{item.name}</h3>
            {selectedPackage === item.code && <span className="badge">Selected</span>}
          </div>
          <p className="cell-sub">{item.description || 'NETVYL business workspace license'}</p>
          <p><strong>{naira(Number(item.monthly_price || 0))}</strong> / month</p>
          <p><strong>{naira(Number(item.yearly_price || 0))}</strong> / year</p>
          <p>{item.max_users ? `Up to ${item.max_users} users` : 'Unlimited users'}</p>
          <button type="button" className={`btn ${selectedPackage === item.code ? 'primary' : ''}`} onClick={() => setSelectedPackage(item.code)}>
            {selectedPackage === item.code ? 'Package selected' : 'Choose this package'}
          </button>
        </article>)}
      </div>

      {contactLoading ? <div className="notice" style={{ marginTop: 16 }}>
        Loading sales contact details…
      </div> : contactError ? <div className="notice error" style={{ marginTop: 16 }}>
        Unable to load sales contact details right now: {contactError}
      </div> : recipient ? <div className="notice" style={{ marginTop: 16 }}>
        Contact NETVYL directly at <a href={`mailto:${recipient}`}>{recipient}</a>
        {contact?.payment_phone && <> or call <a href={`tel:${contact.payment_phone}`}>{contact.payment_phone}</a></>}.
      </div> : <div className="notice" style={{ marginTop: 16 }}>
        The sales contact email is not configured yet. Set “Support / payment email” in Master Admin → Global Controls → Payment instructions to receive license inquiries here.
      </div>}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label>Your name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Business name<input required maxLength={160} value={business} onChange={e => setBusiness(e.target.value)} /></label>
        <label>Business email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Expected number of users<input required type="number" min={1} max={500} value={seats} onChange={e => setSeats(e.target.value)} /></label>
        <p className="cell-sub">By continuing, you acknowledge the <a href="/terms">Terms &amp; Conditions</a> and <a href="/disclaimer">Disclaimer</a>.</p>
        <button className="btn primary wide" type="submit" disabled={contactLoading || submitting}>{submitting ? 'Submitting…' : 'Email NETVYL about a license'}</button>
        {submitMessage && <div className={`notice ${submitFailed ? 'error' : ''}`} role="status">{submitMessage}</div>}
        <div style={{ textAlign: 'center' }}><a href="/login">Back to sign in</a></div>
      </form>
    </section>
  </main>
}
