'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'

function deviceId() {
  if (typeof window === 'undefined') return ''
  const key = 'netvyl-device-id'
  let value = localStorage.getItem(key)
  if (!value) {
    value = crypto.randomUUID()
    localStorage.setItem(key, value)
  }
  return value
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export default function Activate() {
  const supabase = useMemo(() => supabaseBrowser(), [])
  const router = useRouter()

  const [form, setForm] = useState({
    licenseKey: '',
    buyerEmail: '',
    adminName: '',
    adminEmail: '',
    password: '',
    confirmPassword: '',
    deviceName: '',
    platform: 'web',
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const passwordMismatch =
    form.password.length > 0 &&
    form.confirmPassword.length > 0 &&
    form.password !== form.confirmPassword

  const isFormValid =
    form.licenseKey.trim().length > 0 &&
    isValidEmail(form.buyerEmail) &&
    form.adminName.trim().length > 0 &&
    isValidEmail(form.adminEmail) &&
    form.password.length >= 8 &&
    form.confirmPassword.length >= 8 &&
    form.deviceName.trim().length > 0 &&
    form.platform.trim().length > 0 &&
    !passwordMismatch

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setError('')
    setMessage('')
  }

  async function activate(e: React.FormEvent) {
    e.preventDefault()

    if (!isFormValid) {
      setError('Please complete all required fields with valid values and make sure your passwords match.')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const adminEmail = form.adminEmail.trim()
      const adminPassword = form.password
      const fullName = form.adminName.trim()

      const signUpResult = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPassword,
        options: { data: { full_name: fullName } },
      })

      if (signUpResult.error) {
        const message = signUpResult.error.message.toLowerCase()
        const isExistingUser = message.includes('already registered') || message.includes('user already') || message.includes('already exists')

        if (!isExistingUser) {
          throw new Error(signUpResult.error.message)
        }

        const signInResult = await supabase.auth.signInWithPassword({
          email: adminEmail,
          password: adminPassword,
        })

        if (signInResult.error || !signInResult.data.user) {
          throw new Error(signInResult.error?.message || 'This account already exists and could not be signed in.')
        }
      }

      const payload = {
        p_license_key: form.licenseKey.trim(),
        p_buyer_email: form.buyerEmail.trim(),
        p_admin_name: fullName,
        p_admin_email: adminEmail,
        p_device_id: deviceId(),
        p_device_name: form.deviceName.trim(),
        p_platform: form.platform,
        p_password: adminPassword,
      }

      const { data: activation, error: rpcError } = await supabase.rpc('activate_netvyl_license', payload)

      if (rpcError) {
        throw new Error(rpcError.message)
      }

      const result = Array.isArray(activation) ? activation[0] : activation
      if (result?.success !== true) {
        throw new Error(result?.message || 'The license could not be activated. Check the license, buyer email, and device limit.')
      }

      setMessage('License activated successfully. Sign in with the Administrator Email and password you created above.')
      setTimeout(() => router.push('/login'), 900)
    } catch (caught: any) {
      setError(caught?.message || 'Unable to activate the license. Please check your details and try again.')
    } finally {
      setBusy(false)
    }
  }

  const closePage = () => {
    router.push('/login')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <section className="card" style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button
            type="button"
            aria-label="Close page"
            title="Close page"
            onClick={closePage}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              border: '1px solid #ddd9de',
              background: '#fff',
              color: '#4a4349',
              fontSize: 28,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div className="brand-block" style={{ marginBottom: 20 }}>
          <div className="brand-mark large">N</div>
          <div>
            <div className="brand-name">NETVYL</div>
            <div className="brand-sub">LICENSE ACTIVATION</div>
          </div>
        </div>

        <form onSubmit={activate} style={{ display: 'grid', gap: 14 }}>
          <label>
            License Key
            <input
              value={form.licenseKey}
              onChange={(e) => updateField('licenseKey', e.target.value)}
              placeholder="Enter your license key"
              required
            />
          </label>

          <label>
            Buyer Email
            <input
              type="email"
              value={form.buyerEmail}
              onChange={(e) => updateField('buyerEmail', e.target.value)}
              placeholder="buyer@example.com"
              required
            />
          </label>

          <label>
            Administrator Full Name
            <input
              value={form.adminName}
              onChange={(e) => updateField('adminName', e.target.value)}
              placeholder="Enter full name"
              required
            />
          </label>

          <label>
            Administrator Email
            <input
              type="email"
              value={form.adminEmail}
              onChange={(e) => updateField('adminEmail', e.target.value)}
              placeholder="admin@example.com"
              required
            />
          </label>

          <small style={{ display: 'block', marginTop: -8 }}>
            This is the login email for the organization administrator. Buyer Email is only used to verify the license.
          </small>

          <label>
            Create Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>

          <label>
            Confirm Password
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => updateField('confirmPassword', e.target.value)}
              placeholder="Re-enter your password"
              minLength={8}
              required
              aria-invalid={passwordMismatch}
            />
            {passwordMismatch && (
              <small style={{ display: 'block', color: '#dc2626', marginTop: 6 }}>
                Passwords do not match.
              </small>
            )}
          </label>

          <label>
            Device Name
            <input
              value={form.deviceName}
              onChange={(e) => updateField('deviceName', e.target.value)}
              placeholder="e.g. Office Desktop"
              required
            />
          </label>

          <label>
            Platform
            <select value={form.platform} onChange={(e) => updateField('platform', e.target.value)} required>
              <option value="web">Web</option>
              <option value="desktop">Desktop</option>
              <option value="android">Android</option>
              <option value="ios">iOS</option>
            </select>
          </label>

          {error && <div className="notice error">{error}</div>}
          {message && <div className="notice">{message}</div>}

          <p className="cell-sub">By activating and using NETVYL, you agree to the <a href="/terms">Terms &amp; Conditions</a>. Please also read the <a href="/disclaimer">Disclaimer</a>.</p>

          <button
            type="submit"
            className="btn primary wide"
            disabled={busy || !isFormValid}
            style={{ opacity: busy || !isFormValid ? 0.6 : 1 }}
          >
            {busy ? 'Activating…' : 'Activate License'}
          </button>
        </form>
      </section>
    </main>
  )
}
