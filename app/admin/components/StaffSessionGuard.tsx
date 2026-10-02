'use client'

import { useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../../lib/supabase-browser'

const STAFF_ROLES = new Set([
  'staff',
  'manager',
  'cashier',
  'production',
])

const SESSION_STARTED_KEY = 'netvyl_staff_session_started_at'
const STAFF_ROLE_KEY = 'netvyl_staff_role'
const STAFF_ID_KEY = 'netvyl_staff_id'
const STAFF_ORG_KEY = 'netvyl_staff_organization_id'

export default function StaffSessionGuard() {
  const router = useRouter()

  const checkStaffSession = useCallback(async () => {
    if (typeof window === 'undefined') return

    const staffRole = (
      sessionStorage.getItem(STAFF_ROLE_KEY) || ''
    ).toLowerCase()

    const staffId =
      sessionStorage.getItem(STAFF_ID_KEY) || ''

    const organizationId =
      sessionStorage.getItem(STAFF_ORG_KEY) || ''

    if (!staffRole || !staffId || !organizationId) {
      return
    }

    if (!STAFF_ROLES.has(staffRole)) {
      return
    }

    const supabase = supabaseBrowser()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return
    }

    let sessionStartedAt = Number(
      sessionStorage.getItem(SESSION_STARTED_KEY) || 0
    )

    if (!sessionStartedAt) {
      sessionStartedAt = Date.now()
      sessionStorage.setItem(
        SESSION_STARTED_KEY,
        String(sessionStartedAt)
      )
    }

    const { data: membership, error } = await supabase
      .from('organization_members')
      .select(
        'organization_id,user_id,staff_id,role,active,force_logout_at'
      )
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (error || !membership) {
      await supabase.auth.signOut()
      sessionStorage.clear()
      router.replace('/login?reason=removed')
      return
    }

    const actualRole = String(
      membership.role || ''
    ).toLowerCase()

    if (
      membership.user_id !== user.id ||
      membership.organization_id !== organizationId
    ) {
      await supabase.auth.signOut()
      sessionStorage.clear()
      router.replace('/login?reason=organization')
      return
    }

    if (!membership.active) {
      await supabase.auth.signOut()
      sessionStorage.clear()
      router.replace('/login?reason=suspended')
      return
    }

    if (!STAFF_ROLES.has(actualRole)) {
      await supabase.auth.signOut()
      sessionStorage.clear()
      router.replace('/login?reason=role')
      return
    }

    if (
      membership.force_logout_at &&
      new Date(membership.force_logout_at).getTime() >
        sessionStartedAt
    ) {
      await supabase.auth.signOut()
      sessionStorage.clear()
      router.replace('/login?reason=force_logout')
      return
    }

    sessionStorage.setItem(
      STAFF_ROLE_KEY,
      actualRole
    )

    if (membership.staff_id) {
      sessionStorage.setItem(
        STAFF_ID_KEY,
        membership.staff_id
      )
    }

    sessionStorage.setItem(
      STAFF_ORG_KEY,
      membership.organization_id
    )
  }, [router])

  useEffect(() => {
    void checkStaffSession()

    const interval = window.setInterval(
      () => void checkStaffSession(),
      5000
    )

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkStaffSession()
      }
    }

    document.addEventListener(
      'visibilitychange',
      onVisibilityChange
    )

    return () => {
      window.clearInterval(interval)
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange
      )
    }
  }, [checkStaffSession])

  return null
}
