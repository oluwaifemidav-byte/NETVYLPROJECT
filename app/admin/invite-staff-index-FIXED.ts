// @ts-ignore: allow importing from CDN in environments without type support
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'

// Provide a minimal Deno declaration for non-Deno TypeScript environments
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
  return String(value || '').trim().replace(/\s+/g, ' ')
}

function cleanRole(value: unknown) {
  return String(value || 'staff').trim().toLowerCase()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Staff service is not configured on the server.' }, 500)
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token)
    if (callerError || !caller) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const organizationId = String(body?.organization_id || '').trim()
    const fullName = cleanName(body?.full_name)
    const role = cleanRole(body?.role)

    if (!organizationId || !fullName) {
      return json({ error: 'Organization and full name are required.' }, 400)
    }

    const allowedRoles = ['staff', 'manager', 'cashier', 'production']
    if (!allowedRoles.includes(role)) {
      return json({ error: 'Staff role must be staff, manager, cashier or production.' }, 400)
    }

    // Resolve the caller's platform role and tenant membership separately.
    // This preserves company isolation while allowing Master Admin to operate
    // on the organization selected in the current support session.
    const { data: platformRows, error: platformError } = await admin
      .from('organization_members')
      .select('user_id,role,active')
      .eq('user_id', caller.id)
      .eq('role', 'super_admin')
      .eq('active', true)
      .limit(1)

    if (platformError) {
      return json({ error: `Unable to verify platform authorization: ${platformError.message}` }, 500)
    }

    const isPlatformAdmin = (platformRows || []).length > 0

    const { data: callerMember, error: callerMemberError } = await admin
      .from('organization_members')
      .select('role,active,organization_id')
      .eq('organization_id', organizationId)
      .eq('user_id', caller.id)
      .maybeSingle()

    if (callerMemberError) {
      return json({ error: `Unable to verify company access: ${callerMemberError.message}` }, 500)
    }

    let supportAccess = false
    if (isPlatformAdmin) {
      const { data: supportRows, error: supportError } = await admin
        .from('platform_support_sessions')
        .select('id')
        .eq('master_user_id', caller.id)
        .eq('organization_id', organizationId)
        .eq('active', true)
        .is('ended_at', null)
        .limit(1)

      if (supportError) {
        return json({ error: `Unable to verify support session: ${supportError.message}` }, 500)
      }
      supportAccess = (supportRows || []).length > 0
    }

    if (!isPlatformAdmin) {
      if (!callerMember?.active || callerMember.organization_id !== organizationId) {
        return json({ error: 'Your access to this company is disabled.' }, 403)
      }
      if (String(callerMember.role || '').toLowerCase() !== 'administrator') {
        return json({ error: 'Administrator authorization required.' }, 403)
      }
    } else if (!supportAccess && callerMember?.organization_id !== organizationId) {
      return json({ error: 'Start a Master Admin support session for this company before adding staff.' }, 403)
    }

    const { data: subscriptionRows, error: subscriptionError } = await admin.rpc(
      'netvyl_get_org_subscription',
      { p_org_id: organizationId },
    )

    if (subscriptionError) {
      return json({ error: `Unable to verify subscription: ${subscriptionError.message}` }, 500)
    }

    const subscription = subscriptionRows?.[0]
    if (!subscription || subscription.access_status !== 'active') {
      return json({ error: 'This organization does not have an active NETVYL license.' }, 403)
    }

    if (
      subscription.max_users !== null &&
      Number(subscription.active_users) >= Number(subscription.max_users)
    ) {
      return json({
        error: `User limit reached. This license allows ${subscription.max_users} active users.`,
      }, 403)
    }

    const { data: staffIdData, error: staffIdError } = await admin.rpc(
      'netvyl_generate_staff_id',
      { p_organization_id: organizationId },
    )

    if (staffIdError || !staffIdData) {
      return json({ error: staffIdError?.message || 'Unable to generate Staff ID.' }, 500)
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
      return json({ error: createUserError?.message || 'Unable to create staff account.' }, 400)
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
      return json({ error: memberError.message }, 400)
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
      login_email: loginEmail,
    })
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 400)
  }
})
