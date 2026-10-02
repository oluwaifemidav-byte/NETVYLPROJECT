import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders })

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const getSenderAddress = () => {
  const senderName = (Deno.env.get('NETVYL_FROM_NAME') || 'NETVYL Digital Resources').trim()
  const senderEmail = (Deno.env.get('NETVYL_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev').trim()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderEmail)
  const fallbackEmail = 'onboarding@resend.dev'
  const email = validEmail ? senderEmail : fallbackEmail
  return `${senderName} <${email}>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST is required' }, 405)

  try {
    const auth = req.headers.get('Authorization') || ''
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: auth } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    let isAdmin = false
    try {
      const { data, error } = await supabase.rpc('netvyl_is_platform_super_admin')
      if (!error) isAdmin = data === true
    } catch {
      isAdmin = false
    }

    if (!isAdmin) {
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .eq('active', true)
        .ilike('role', 'super_admin')
        .limit(1)
        .maybeSingle()
      if (memberError) return json({ error: `Master Admin check failed: ${memberError.message}` }, 403)
      if (!member) return json({ error: 'Platform administrator authorization required' }, 403)
      isAdmin = true
    }

    const body = await req.json().catch(() => ({}))
    const licenseId = String(body?.licenseId || body?.license_id || '').trim()
    if (!licenseId) return json({ error: 'License ID is required' }, 400)

    const { data: license, error: licenseError } = await supabase
      .from('licenses')
      .select('id,organization_id,license_key,plan,max_devices,buyer_email,payment_reference,expires_at,status,organizations(name)')
      .eq('id', licenseId)
      .single()

    if (licenseError || !license) return json({ error: licenseError?.message || 'License not found' }, 404)
    if (!license.buyer_email) return json({ error: 'This license has no buyer email address.' }, 400)

    const { data: paymentAccount, error: paymentError } = await supabase.rpc('get_netvyl_payment_account')
    if (paymentError) return json({ error: `Payment account lookup failed: ${paymentError.message}` }, 400)
    const account = paymentAccount?.[0] || {}

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return json({ error: 'RESEND_API_KEY is not configured for the Edge Function.' }, 500)

    const from = getSenderAddress()
    const replyTo = Deno.env.get('NETVYL_REPLY_TO_EMAIL') || Deno.env.get('NETVYL_SUPPORT_EMAIL') || undefined
    const organizationName = (license as any)?.organizations?.name || 'NETVYL Business Management Platform'
    const expiry = license.expires_at ? new Date(license.expires_at).toLocaleDateString('en-NG') : 'No expiry'

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:28px;color:#20222a">
        <h2 style="margin:0 0 8px">Your NETVYL License</h2>
        <p style="color:#666">Commercial access information for <strong>${esc(organizationName)}</strong>.</p>
        <div style="background:#f6f6f8;border-radius:12px;padding:18px;margin:20px 0">
          <p><strong>License key</strong><br><span style="font-size:20px;letter-spacing:1px">${esc(license.license_key)}</span></p>
          <p><strong>Plan:</strong> ${esc(license.plan)}</p>
          <p><strong>Maximum devices:</strong> ${esc(license.max_devices)}</p>
          <p><strong>Expiry:</strong> ${esc(expiry)}</p>
          <p><strong>Status:</strong> ${esc(license.status)}</p>
        </div>
        <h3>Payment information</h3>
        <p>Payment must be verified by NETVYL before access is activated.</p>
        <p><strong>Bank:</strong> ${esc(account.bank_name)}<br><strong>Account Name:</strong> ${esc(account.account_name)}<br><strong>Account Number:</strong> ${esc(account.account_number)}</p>
        <p><strong>Payment reference:</strong> ${esc(license.payment_reference || license.id)}</p>
        <p>After payment, submit your transfer reference through the NETVYL payment/renewal process.</p>
        <hr style="border:0;border-top:1px solid #ddd;margin:24px 0">
        <p style="font-size:12px;color:#777">Software designed &amp; developed by NETVYL Digital Resources Global Ltd.</p>
      </div>`

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [license.buyer_email],
        reply_to: replyTo,
        subject: `NETVYL License — ${organizationName}`,
        html,
      }),
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) return json({ error: result?.message || result?.error || `Email provider returned HTTP ${response.status}` }, 502)

    try {
      await supabase.from('audit_logs').insert({
        organization_id: license.organization_id,
        actor_user_id: user.id,
        action: 'email_license_key',
        entity_type: 'license',
        entity_id: license.id,
        details: { buyer_email: license.buyer_email, provider: 'resend' },
      })
    } catch {
      // Intentionally ignore audit log failures so the mail send result remains authoritative.
    }

    return json({ success: true, message: `License key emailed to ${license.buyer_email}.` })
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})
