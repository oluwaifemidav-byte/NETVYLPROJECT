// @ts-ignore: allow importing the CDN bundle in non-Deno TypeScript environments
import { createClient } from "npm:@supabase/supabase-js@2"

// Minimal Deno declarations for TypeScript editors that do not include the Deno runtime types.
declare const Deno: {
  serve: (handler: (req: Request) => Promise<Response> | Response) => void
  env: {
    get: (key: string) => string | undefined
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanName(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function cleanRole(value: unknown) {
  return String(value ?? 'staff').trim().toLowerCase()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Staff service is not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !caller) return json({ error: `Unauthorized: ${callerError?.message || 'No authenticated user.'}` }, 401)

    const body = await req.json().catch(() => ({}))
    const organizationId = String(body?.organization_id ?? '').trim()
    const fullName = cleanName(body?.full_name)
    const role = cleanRole(body?.role)

    if (!organizationId) return json({ error: 'Organization ID is missing.' }, 400)
    if (!fullName) return json({ error: 'Full name is required.' }, 400)
    if (!['staff', 'manager', 'cashier', 'production'].includes(role)) {
      return json({ error: 'Invalid staff role.' }, 400)
    }

    // Exact organization authorization.
    const { data: callerMember, error: callerMemberError } = await admin
      .from('organization_members')
      .select('organization_id,role,active')
      .eq('organization_id', organizationId)
      .eq('user_id', caller.id)
      .maybeSingle()

    if (callerMemberError) {
      return json({ error: `Unable to verify your company access: ${callerMemberError.message}` }, 500)
    }

    const { data: supportSession, error: supportError } = await admin
      .from('platform_support_sessions')
      .select('id')
      .eq('master_user_id', caller.id)
      .eq('organization_id', organizationId)
      .eq('active', true)
      .is('ended_at', null)
      .limit(1)
      .maybeSingle()

    if (supportError) {
      return json({ error: `Unable to verify Master Admin support access: ${supportError.message}` }, 500)
    }

    const isSupport = !!supportSession
    const isAdministrator = callerMember?.active === true && String(callerMember.role).toLowerCase() === 'administrator'

    if (!isAdministrator && !isSupport) {
      return json({ error: 'Administrator authorization required for this organization.' }, 403)
    }

    // Verify the organization exists.
    const { data: organization, error: organizationError } = await admin
      .from('organizations')
      .select('id,status')
      .eq('id', organizationId)
      .maybeSingle()

    if (organizationError) return json({ error: `Unable to verify organization: ${organizationError.message}` }, 500)
    if (!organization) return json({ error: 'Organization not found.' }, 404)

    // Read the active license directly. This avoids a dependency on a possibly stale subscription RPC.
    const { data: license, error: licenseError } = await admin
      .from('licenses')
      .select('id,status,active,expires_at,max_users,plan,plan_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .eq('active', true)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (licenseError) {
      return json({ error: `Unable to verify the organization license: ${licenseError.message}` }, 500)
    }

    if (!license) {
      return json({ error: 'This organization does not have an active license.' }, 403)
    }

    if (license.expires_at && new Date(license.expires_at).getTime() < Date.now()) {
      return json({ error: 'This organization license has expired.' }, 403)
    }

    let maxUsers = license.max_users == null ? null : Number(license.max_users)

    if (maxUsers == null && license.plan_id) {
      const { data: plan } = await admin
        .from('subscription_plans')
        .select('max_users')
        .eq('id', license.plan_id)
        .maybeSingle()
      if (plan?.max_users != null) maxUsers = Number(plan.max_users)
    }

    if (maxUsers == null && license.plan) {
      const { data: plan } = await admin
        .from('subscription_plans')
        .select('max_users')
        .eq('code', String(license.plan).toLowerCase())
        .maybeSingle()
      if (plan?.max_users != null) maxUsers = Number(plan.max_users)
    }

    const { count: activeUsers, error: countError } = await admin
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('active', true)

    if (countError) return json({ error: `Unable to count active users: ${countError.message}` }, 500)

    if (maxUsers != null && Number(activeUsers ?? 0) >= maxUsers) {
      return json({ error: `User limit reached. This license allows ${maxUsers} active users.` }, 403)
    }

    const { data: staffIdData, error: staffIdError } = await admin.rpc('netvyl_generate_staff_id', {
      p_organization_id: organizationId,
    })

    if (staffIdError || !staffIdData) {
      return json({ error: `Unable to generate Staff ID: ${staffIdError?.message || 'No Staff ID was returned.'}` }, 500)
    }

    const staffId = String(staffIdData).trim().toUpperCase()
    const loginEmail = `${staffId.toLowerCase()}@staff.netvyl.local`

    const { data: created, error: createUserError } = await admin.auth.admin.createUser({
      email: loginEmail,
      password: staffId,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        organization_id: organizationId,
        staff_id: staffId,
        role,
        netvyl_staff: true,
      },
    })

    if (createUserError || !created.user) {
      return json({ error: `Unable to create the Auth account: ${createUserError?.message || 'No user was created.'}` }, 400)
    }

    const { error: memberError } = await admin
      .from('organization_members')
      .insert({
        organization_id: organizationId,
        user_id: created.user.id,
        full_name: fullName,
        staff_id: staffId,
        login_email: loginEmail,
        role,
        active: true,
        force_logout_at: null,
        updated_at: new Date().toISOString(),
      })

    if (memberError) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: `Auth account was created but staff membership failed: ${memberError.message}` }, 400)
    }

    await admin.from('audit_logs').insert({
      organization_id: organizationId,
      actor_user_id: caller.id,
      action: 'create_staff_login',
      entity_type: 'organization_member',
      entity_id: created.user.id,
      details: { staff_id: staffId, full_name: fullName, role },
    })

    return json({
      ok: true,
      user_id: created.user.id,
      staff_id: staffId,
      full_name: fullName,
      role,
      organization_id: organizationId,
    }, 200)
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500)
  }
})
