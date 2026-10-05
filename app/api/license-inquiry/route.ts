import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type InquiryPayload = {
  name?: string
  business?: string
  email?: string
  seats?: string | number
  packageCode?: string
  packageName?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const toCleanString = (value: unknown, maxLength: number) => String(value ?? '').trim().slice(0, maxLength)

async function readPaymentContact() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  if (!url || !key) return null

  try {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data } = await supabase.rpc('get_netvyl_payment_account')
    return data?.[0] || null
  } catch {
    return null
  }
}

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function saveLicenseRequest(record: {
  name: string
  business_name: string
  email: string
  seats: number
  package_code: string
  package_name: string
  source: string
}) {
  const admin = getServiceRoleClient()
  if (!admin) return { saved: false, reason: 'missing_service_role_key' }

  const payload = {
    name: record.name,
    business_name: record.business_name,
    email: record.email,
    seats: record.seats,
    package_code: record.package_code,
    package_name: record.package_name,
    source: record.source,
    status: 'new',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await admin.from('license_requests').insert([payload])
  if (error) {
    return {
      saved: false,
      reason: error.message,
      code: error.code,
    }
  }

  return { saved: true }
}

export async function GET() {
  const contact = await readPaymentContact()
  const recipient = String(contact?.payment_email || '').trim() || toCleanString(
    process.env.NETVYL_SUPPORT_EMAIL || process.env.NETVYL_REPLY_TO_EMAIL,
    254,
  )

  return NextResponse.json({
    payment_email: emailPattern.test(recipient) ? recipient : '',
    payment_phone: contact?.payment_phone || '',
  })
}

function getSenderAddress() {
  const senderName = toCleanString(process.env.NETVYL_FROM_NAME || 'NETVYL Digital Resources', 120)
  const senderEmail = toCleanString(process.env.NETVYL_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev', 254)
  const safeEmail = emailPattern.test(senderEmail) ? senderEmail : 'onboarding@resend.dev'
  return `${senderName} <${safeEmail}>`
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as InquiryPayload

    const name = toCleanString(body.name, 120)
    const business = toCleanString(body.business, 160)
    const email = toCleanString(body.email, 254)
    const seats = toCleanString(body.seats, 30)
    const packageCode = toCleanString(body.packageCode, 60)
    const packageName = toCleanString(body.packageName, 120)

    if (!name || !business || !email || !seats || !packageCode) {
      return NextResponse.json({ error: 'Missing required inquiry details.' }, { status: 400 })
    }

    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Please provide a valid business email address.' }, { status: 400 })
    }

    const numericSeats = Number(seats)
    if (!Number.isFinite(numericSeats) || numericSeats < 1 || numericSeats > 500) {
      return NextResponse.json({ error: 'Expected users must be between 1 and 500.' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY is not configured on the server.' }, { status: 500 })
    }

    const contact = await readPaymentContact()
    const recipient = String(contact?.payment_email || '').trim() || toCleanString(process.env.NETVYL_SUPPORT_EMAIL || process.env.NETVYL_REPLY_TO_EMAIL, 254)
    if (!emailPattern.test(recipient)) {
      return NextResponse.json({ error: 'Sales contact email is not configured on the server.' }, { status: 500 })
    }

    const from = getSenderAddress()
    const replyTo = toCleanString(process.env.NETVYL_REPLY_TO_EMAIL, 254)
    const resolvedPackageName = packageName || packageCode

    const persisted = await saveLicenseRequest({
      name,
      business_name: business,
      email,
      seats: numericSeats,
      package_code: packageCode,
      package_name: resolvedPackageName,
      source: 'register_page',
    })

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:28px;color:#20222a">
        <h2 style="margin:0 0 8px">New NETVYL License Inquiry</h2>
        <p style="color:#666">A customer submitted a license inquiry from the register page.</p>
        <div style="background:#f6f6f8;border-radius:12px;padding:18px;margin:20px 0">
          <p><strong>Package</strong><br>${esc(resolvedPackageName)} (${esc(packageCode)})</p>
          <p><strong>Contact name</strong><br>${esc(name)}</p>
          <p><strong>Business name</strong><br>${esc(business)}</p>
          <p><strong>Business email</strong><br>${esc(email)}</p>
          <p><strong>Expected users</strong><br>${esc(numericSeats)}</p>
        </div>
      </div>`

    const sendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        reply_to: emailPattern.test(replyTo) ? replyTo : undefined,
        subject: `NETVYL license inquiry - ${business}`,
        html,
      }),
    })

    if (!persisted.saved) {
      console.warn('License inquiry saved without pending review row:', persisted.reason || 'unknown')
    }

    const sendResult = await sendResponse.json().catch(() => ({}))
    if (!sendResponse.ok) {
      const providerMessage = String(sendResult?.message || sendResult?.error || `Email provider returned HTTP ${sendResponse.status}`)
      const isTestModeRecipientLimit = providerMessage.toLowerCase().includes('you can only send testing emails to your own email address')

      if (isTestModeRecipientLimit) {
        const allowedRecipient = providerMessage.match(/\(([^)]+)\)/)?.[1] || 'your Resend account email'
        return NextResponse.json({
          error: `Resend is in test mode. For now, send only to ${allowedRecipient}, or verify a domain at resend.com/domains to send to other recipients.`,
        }, { status: 502 })
      }

      return NextResponse.json({ error: providerMessage }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: 'Your inquiry was submitted. NETVYL will contact you shortly.' })
  } catch (error) {
    return NextResponse.json({ error: String((error as Error)?.message || error) }, { status: 500 })
  }
}
