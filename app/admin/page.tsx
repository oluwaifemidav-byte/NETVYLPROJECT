'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { getActiveOrganizationId } from '../../lib/organization-context'
import { PageHead, Badge, StatCard } from '../../components/ui'
import {
  isAdminUnlocked,
  lockAdminActions,
  unlockAdminActions,
} from './admin-protection'

type Member = {
id: string
full_name: string
role: string
active: boolean
user_id: string
staff_id: string | null
force_logout_at?: string | null
}

type StaffDraft = {
full_name: string
role: string
}

const STAFF_ROLES = [
'staff',
'manager',
'cashier',
'production',
]

const emptyStaff: StaffDraft = {
full_name: '',
role: 'staff',
}

export default function Admin() {
const ORG = getActiveOrganizationId()

const s = useMemo(
() => supabaseBrowser(),
[]
)

const [org, setOrg] = useState<any>({})
const [members, setMembers] = useState<Member[]>([])
const [myRole, setMyRole] = useState('')
const [supportMode, setSupportMode] = useState(false)

const [msg, setMsg] = useState('')
const [error, setError] = useState('')
const [busy, setBusy] = useState(false)

const [resetOpen, setResetOpen] = useState(false)
const [resetText, setResetText] = useState('')
const [resetBusy, setResetBusy] = useState(false)

const [inventoryUnlockCode, setInventoryUnlockCode] = useState('')
const [inventoryUnlocked, setInventoryUnlocked] = useState(false)

const [staffOpen, setStaffOpen] = useState(false)
const [staff, setStaff] = useState<StaffDraft>(emptyStaff)

const [deleteStaff, setDeleteStaff] =
useState<Member | null>(null)

/*

* Only a real company administrator or approved
* Master Admin, company Administrator, or an approved Master Admin support session can administer the selected organization.
  */
  const canAdmin =
  myRole === 'administrator' ||
  myRole === 'super_admin' ||
  supportMode

/*

* LOAD ADMIN DATA
*
* IMPORTANT:
* Staff list is deliberately restricted to staff-level roles.
* administrator and super_admin will NEVER appear here.
  */
  const load = useCallback(async () => {
  if (!ORG) {
  setError('No active organization was found.')
  return
  }

setError('')

setMsg('')

const [
  organizationResult,
  membersResult,
  supportResult,
  platformAdminResult,
  currentUserResult,
] = await Promise.all([
  s
    .from('organizations')
    .select('*')
    .eq('id', ORG)
    .single(),

  s
    .from('organization_members')
    .select(
      'id,full_name,role,active,user_id,staff_id,force_logout_at'
    )
    .eq('organization_id', ORG)
    .in(
      'role',
      [
        'staff',
        'manager',
        'cashier',
        'production',
      ]
    )
    .order('full_name'),

  s.rpc(
    'netvyl_has_support_access',
    {
      p_org_id: ORG,
    }
  ),

  s.rpc(
    'netvyl_is_platform_super_admin'
  ),

  s.auth.getUser(),
])

setSupportMode(
  supportResult.data === true
)

let isAdministrator =
  platformAdminResult.data === true

const currentUser =
  currentUserResult.data?.user || null

if (currentUser) {
  const selfMembershipResult =
    await s
      .from('organization_members')
      .select('role,active')
      .eq('organization_id', ORG)
      .eq('user_id', currentUser.id)
      .maybeSingle()

  if (
    !selfMembershipResult.error &&
    selfMembershipResult.data?.active === true &&
    String(selfMembershipResult.data.role || '').toLowerCase() === 'administrator'
  ) {
    isAdministrator = true
  }
}

setMyRole(
  isAdministrator
    ? (platformAdminResult.data === true ? 'super_admin' : 'administrator')
    : ''
)

/*
 * COMPANY
 */
if (organizationResult.error) {
  setError(
    `Company profile: ${organizationResult.error.message}`
  )
} else {
  const base =
    organizationResult.data || {}

  const subscriptionResult =
    await s.rpc(
      'netvyl_get_org_subscription',
      {
        p_org_id: ORG,
      }
    )

  const subscription =
    subscriptionResult.data?.[0]

  setOrg({
    ...base,
    subscription_plan_name:
      subscription?.plan_name,
    subscription_expires_at:
      subscription?.expires_at,
    subscription_max_users:
      subscription?.max_users,
    subscription_access_status:
      subscription?.access_status,
  })
}

/*
 * STAFF
 */
if (membersResult.error) {
  setError(
    previous =>
      previous
        ? `${previous} Staff: ${membersResult.error.message}`
        : `Staff: ${membersResult.error.message}`
  )

  setMembers([])
} else {
  const rows =
    (membersResult.data || []) as Member[]

  setMembers(rows)


}

}, [s, ORG])

useEffect(() => {
  load()
  setInventoryUnlocked(isAdminUnlocked())

  const syncInventoryLock = () => {
    setInventoryUnlocked(isAdminUnlocked())
  }

  window.addEventListener('netvyl:admin-unlocked', syncInventoryLock)
  window.addEventListener('netvyl:admin-locked', syncInventoryLock)

  return () => {
    window.removeEventListener('netvyl:admin-unlocked', syncInventoryLock)
    window.removeEventListener('netvyl:admin-locked', syncInventoryLock)
  }
}, [load])

const inventoryUnlockPassword =
  process.env.NEXT_PUBLIC_ADMIN_UNLOCK_PASSWORD || ''

async function unlockInventory() {
  if (!canAdmin) {
    setError('Only the company administrator can unlock inventory edits.')
    return
  }

  const trimmedPassword = inventoryUnlockCode.trim()

  if (!trimmedPassword) {
    setError('Enter the administrator password to unlock inventory.')
    return
  }

  if (
    inventoryUnlockPassword &&
    trimmedPassword === inventoryUnlockPassword
  ) {
    unlockAdminActions()
    setInventoryUnlocked(true)
    setError('')
    setMsg('Inventory editing is unlocked for this browser session.')
    setInventoryUnlockCode('')
    return
  }

  const { data: currentUserResult, error: userError } =
    await s.auth.getUser()

  if (userError || !currentUserResult.user?.email) {
    setError(
      'Your administrator account could not be verified. Please sign in again and try the current password.'
    )
    return
  }

  const { error: signInError } = await s.auth.signInWithPassword({
    email: currentUserResult.user.email,
    password: trimmedPassword,
  })

  if (signInError) {
    setError('Incorrect administrator password. Use your current login password.')
    return
  }

  unlockAdminActions()
  setInventoryUnlocked(true)
  setError('')
  setMsg('Inventory editing is unlocked for this browser session.')
  setInventoryUnlockCode('')
}

function lockInventory() {
  if (!canAdmin) {
    setError('Only the company administrator can lock inventory edits.')
    return
  }

  lockAdminActions()
  setInventoryUnlocked(false)
  setError('')
  setMsg('Inventory editing is locked again.')
  setInventoryUnlockCode('')
}

/*

* SAVE COMPANY PROFILE
  */
  async function save() {
  if (!canAdmin) {
  setError(
  'Only the company administrator can change company settings.'
  )
  return
  }

if (!ORG) {

  setError(
    'No active organization was found.'
  )
  return
}

setBusy(true)
setError('')
setMsg('')

const { error: saveError } =
  await s
    .from('organizations')
    .update({
      name: org.name,
      phone: org.phone,
      email: org.email,
      website: org.website,
      address: org.address,
      currency:
        org.currency || 'NGN',

      job_prefix:
        org.job_prefix || 'JOB-',

      order_prefix:
        org.order_prefix || 'ORD-',

      quote_prefix:
        org.quote_prefix || 'QT-',

      receipt_prefix:
        org.receipt_prefix || 'RCT-',

      tax_rate:
        Number(org.tax_rate) || 0,

      default_payment_method:
        org.default_payment_method ||
        'Transfer',

      receipt_footer:
        org.receipt_footer ||
        'Thank you for your patronage.',

      updated_at:
        new Date().toISOString(),
    })
    .eq('id', ORG)

if (saveError) {
  setError(saveError.message)
} else {
  setMsg(
    'Company profile saved successfully.'
  )

  window.dispatchEvent(
    new Event(
      'netvyl:organization-updated'
    )
  )

  await load()
}

setBusy(false)

}

/*

* ADD STAFF
*
* The Edge Function generates the Staff ID.
  */
  async function addStaff() {
  if (!canAdmin) {
  setError(
  'Company administrator authorization required.'
  )
  return
  }

if (!staff.full_name.trim()) {

  setError(
    'Full name is required.'
  )
  return
}

if (
  !STAFF_ROLES.includes(
    staff.role
  )
) {
  setError(
    'Select a valid staff role.'
  )
  return
}

setBusy(true)
setError('')
setMsg('')

const {
  data: payload,
  error: invokeError,
} =
  await s.functions.invoke(
    'invite-staff',
    {
      body: {
        organization_id: ORG,
        full_name:
          staff.full_name
            .trim()
            .replace(/\s+/g, ' '),
        role: staff.role,
      },
    }
  )

if (invokeError) {
  setError(
    `Staff service error: ${invokeError.message}`
  )
} else if (payload?.error) {
  setError(
    payload.error
  )
} else {
  setMsg(
    `Staff account created successfully. Staff ID: ${
      payload?.staff_id || 'generated'
    }.`
  )

  setStaff(
    { ...emptyStaff }
  )

  setStaffOpen(false)

  await load()
}

setBusy(false)

}

/*

* CHANGE STAFF ROLE
*
* Only staff-level roles are permitted.
* Administrator and super_admin cannot be assigned
* from this screen.
  */
  async function updateMemberRole(
  member: Member,
  newRole: string
  ) {
  if (!canAdmin) {
  setError(
  'Company administrator authorization required.'
  )
  return
  }

if (

  !STAFF_ROLES.includes(
    newRole
  )
) {
  setError(
    'Invalid staff role.'
  )
  return
}

if (
  !STAFF_ROLES.includes(
    member.role
  )
) {
  setError(
    'Protected account cannot be changed from Staff & Roles.'
  )
  return
}

setBusy(true)
setError('')
setMsg('')

const { error: updateError } =
  await s
    .from('organization_members')
    .update({
      role: newRole,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'id',
      member.id
    )
    .eq(
      'organization_id',
      ORG
    )

if (updateError) {
  setError(
    updateError.message
  )
} else {
  setMsg(
    `${member.full_name}'s role was updated.`
  )

  await load()
}

setBusy(false)

}

/*

* SUSPEND / ACTIVATE STAFF
*
* Uses the security RPC instead of directly modifying
* the active field.
*
* When suspended, the database trigger updates
* force_logout_at so an already logged-in staff
* member is forced out by StaffSessionGuard.
  */
  async function setStaffStatus(
  member: Member,
  active: boolean
  ) {
  if (!canAdmin) {
  setError(
  'Company administrator authorization required.'
  )
  return
  }

setBusy(true)

setError('')
setMsg('')

const { error: rpcError } =
  await s.rpc(
    'netvyl_set_staff_status',
    {
      p_membership_id:
        member.id,
      p_active:
        active,
    }
  )

if (rpcError) {
  setError(
    rpcError.message
  )
} else {
  setMsg(
    active
      ? `${member.full_name} has been activated and can log in again.`
      : `${member.full_name} has been suspended and their active session will be revoked.`
  )

  await load()
}

setBusy(false)

}

/*

* FORCE LOGOUT
*
* Suspending the account is the secure logout mechanism.
* This immediately marks the membership inactive.
  */
  async function forceLogout(
  member: Member
  ) {
  if (!canAdmin) {
  setError(
  'Company administrator authorization required.'
  )
  return
  }

setBusy(true)

setError('')
setMsg('')

const { error: rpcError } =
  await s.rpc(
    'netvyl_set_staff_status',
    {
      p_membership_id:
        member.id,
      p_active: false,
    }
  )

if (rpcError) {
  setError(
    rpcError.message
  )
} else {
  setMsg(
    `Remote logout requested for ${member.full_name}.`
  )

  await load()
}

setBusy(false)

}

/*

* DELETE STAFF MEMBERSHIP
*
* Uses the protected SECURITY DEFINER RPC.
* The RPC enforces organization isolation.
  */
  async function removeStaff() {
  if (!deleteStaff) {
  return
  }

if (!canAdmin) {

  setError(
    'Company administrator authorization required.'
  )
  return
}

setBusy(true)
setError('')
setMsg('')

const { error: rpcError } =
  await s.rpc(
    'netvyl_delete_staff_membership',
    {
      p_membership_id:
        deleteStaff.id,
    }
  )

if (rpcError) {
  setError(
    rpcError.message
  )
} else {
  setMsg(
    `${deleteStaff.full_name || 'Staff member'} was removed from this organization.`
  )

  setDeleteStaff(null)

  await load()
}

setBusy(false)

}

/*
 * RESET BUSINESS DATA
  */
  async function resetBusiness() {
  if (resetText.trim().toUpperCase() !== 'RESET') {
    setError(
      'Type RESET exactly to confirm the fresh start.'
    )
    return
  }

  if (!ORG) {
    setError('No active organization was found.')
    return
  }

  if (!canAdmin) {
    setError(
      'Only the company administrator can reset business data.'
    )
    return
  }

  setResetBusy(true)
  setError('')
  setMsg('')

  try {
    const { error: rpcError } =
      await s.rpc(
        'reset_organization_operational_data',
        {
          p_organization_id: ORG,
          p_confirmation: 'RESET',
        }
      )

    if (rpcError) {
      console.error(
        'NETVYL reset error:',
        rpcError
      )
      setError(
        `Reset failed: ${rpcError.message}`
      )
      return
    }

    setMsg(
      'Fresh start completed successfully. Customers, jobs, payments, print queue and inventory transactions were cleared. Materials were restored to opening stock.'
    )

    setResetText('')
    setResetOpen(false)
    await load()
  } catch (resetError) {
    console.error(
      'NETVYL reset exception:',
      resetError
    )
    setError(
      resetError instanceof Error
        ? `Reset failed: ${resetError.message}`
        : 'Reset failed unexpectedly.'
    )
  } finally {
    setResetBusy(false)
  }
}

return (
<>
<PageHead
title="Administration"
subtitle="Company profile, staff access and workspace controls."
actions={ <button
         className="btn"
         disabled={busy}
         onClick={load}
       >
↻ Refresh </button>
}
/>

  {supportMode && (
    <div
      className="notice"
      style={{
        marginTop: 14,
      }}
    >
      <strong>
        Master Admin Support Mode:
      </strong>{' '}
      You are managing{' '}
      <strong>
        {org?.name ||
          'this organization'}
      </strong>
      . Administrative actions are tenant-scoped and audited.
    </div>
  )}

  {(error || msg) && (
    <div
      className={`notice ${
        error ? 'error' : ''
      }`}
      style={{
        marginTop: 14,
      }}
    >
      {error || msg}
    </div>
  )}

  <section
    className="card"
    style={{
      marginTop: 18,
    }}
  >
    <div className="section-head">
      <div>
        <h3>Inventory protection</h3>
        <span>Unlock editing for the current browser session.</span>
      </div>

      <Badge tone={inventoryUnlocked ? 'success' : 'warning'}>
        {inventoryUnlocked ? 'UNLOCKED' : 'LOCKED'}
      </Badge>
    </div>

    <div className="grid2" style={{ marginTop: 12 }}>
      <label>
        Administrator password
        <input
          type="password"
          value={inventoryUnlockCode}
          disabled={!canAdmin}
          placeholder="Enter admin password"
          onChange={e => setInventoryUnlockCode(e.target.value)}
        />
      </label>
    </div>

    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        marginTop: 12,
      }}
    >
      <button
        className="btn primary"
        disabled={!canAdmin || inventoryUnlocked}
        onClick={unlockInventory}
      >
        Unlock inventory
      </button>

      <button
        className="btn"
        disabled={!canAdmin || !inventoryUnlocked}
        onClick={lockInventory}
      >
        Lock inventory
      </button>
    </div>
  </section>

  {/* SUBSCRIPTION */}

  <section
    className="card"
    style={{
      marginTop: 18,
    }}
  >
    <div className="section-head">
      <div>
        <h3>
          Subscription
        </h3>

        <span>
          Commercial access for this organization.
        </span>
      </div>

      <Badge
        tone={
          org?.status ===
          'active'
            ? 'success'
            : 'warning'
        }
      >
        {String(
          org?.status ||
            'trial'
        ).toUpperCase()}
      </Badge>
    </div>

    <div
      className="grid3"
      style={{
        marginTop: 8,
      }}
    >
      <div>
        <small>
          Plan
        </small>

        <strong
          style={{
            display:
              'block',
            marginTop: 5,
          }}
        >
          {org?.subscription_plan_name ||
            'Managed by Master Admin'}
        </strong>
      </div>

      <div>
        <small>
          License expiry
        </small>

        <strong
          style={{
            display:
              'block',
            marginTop: 5,
          }}
        >
          {org?.subscription_expires_at
            ? new Date(
                org.subscription_expires_at
              ).toLocaleDateString(
                'en-NG'
              )
            : 'See Master Admin'}
        </strong>
      </div>

      <div>
        <small>
          Active users
        </small>

        <strong
          style={{
            display:
              'block',
            marginTop: 5,
          }}
        >
          {
            members.filter(
              x => x.active
            ).length
          }

          {org?.subscription_max_users
            ? ` / ${org.subscription_max_users}`
            : ''}
        </strong>
      </div>
    </div>
  </section>

  {/* STATISTICS */}

  <div
    className="stats"
    style={{
      marginTop: 16,
    }}
  >
    <StatCard
      label="Staff accounts"
      value={
        members.length
      }
      icon="♙"
    />
  </div>

  {/* COMPANY + STAFF */}

  <div
    className="workspace-grid"
    style={{
      marginTop: 20,
    }}
  >
    {/* COMPANY PROFILE */}

    <section
      className="card form-card"
    >
      <div className="section-head">
        <div>
          <h3>
            Company profile
          </h3>

          <span>
            Edit company details without changing its organization ID.
          </span>
        </div>
      </div>

      <label>
        Company name

        <input
          value={
            org.name || ''
          }
          disabled={!canAdmin}
          onChange={e =>
            setOrg({
              ...org,
              name:
                e.target.value,
            })
          }
        />
      </label>

      <label>
        Address

        <textarea
          value={
            org.address || ''
          }
          disabled={!canAdmin}
          onChange={e =>
            setOrg({
              ...org,
              address:
                e.target.value,
            })
          }
        />
      </label>

      <div className="grid2">
        <label>
          Phone

          <input
            value={
              org.phone || ''
            }
            disabled={!canAdmin}
            onChange={e =>
              setOrg({
                ...org,
                phone:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Email

          <input
            type="email"
            value={
              org.email || ''
            }
            disabled={!canAdmin}
            onChange={e =>
              setOrg({
                ...org,
                email:
                  e.target.value,
              })
            }
          />
        </label>
      </div>

      <div className="grid2">
        <label>
          Website

          <input
            value={
              org.website || ''
            }
            disabled={!canAdmin}
            onChange={e =>
              setOrg({
                ...org,
                website:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Currency

          <input
            value={
              org.currency ||
              'NGN'
            }
            disabled={!canAdmin}
            onChange={e =>
              setOrg({
                ...org,
                currency:
                  e.target.value.toUpperCase(),
              })
            }
          />
        </label>
      </div>

      <div className="grid2">
        <label>
          Job prefix

          <input
            disabled={!canAdmin}
            value={
              org.job_prefix ||
              'JOB-'
            }
            onChange={e =>
              setOrg({
                ...org,
                job_prefix:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Order prefix

          <input
            disabled={!canAdmin}
            value={
              org.order_prefix ||
              'ORD-'
            }
            onChange={e =>
              setOrg({
                ...org,
                order_prefix:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Quote prefix

          <input
            disabled={!canAdmin}
            value={
              org.quote_prefix ||
              'QT-'
            }
            onChange={e =>
              setOrg({
                ...org,
                quote_prefix:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Receipt prefix

          <input
            disabled={!canAdmin}
            value={
              org.receipt_prefix ||
              'RCT-'
            }
            onChange={e =>
              setOrg({
                ...org,
                receipt_prefix:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Tax rate %

          <input
            disabled={!canAdmin}
            type="number"
            min="0"
            step="0.01"
            value={
              org.tax_rate ||
              0
            }
            onChange={e =>
              setOrg({
                ...org,
                tax_rate:
                  e.target.value,
              })
            }
          />
        </label>

        <label>
          Default payment

          <select
            disabled={!canAdmin}
            value={
              org.default_payment_method ||
              'Transfer'
            }
            onChange={e =>
              setOrg({
                ...org,
                default_payment_method:
                  e.target.value,
              })
            }
          >
            <option>
              Transfer
            </option>

            <option>
              Cash
            </option>

            <option>
              POS
            </option>

            <option>
              Card
            </option>

            <option>
              Online
            </option>
          </select>
        </label>
      </div>

      <label>
        Receipt footer

        <textarea
          disabled={!canAdmin}
          value={
            org.receipt_footer ||
            'Thank you for your patronage.'
          }
          onChange={e =>
            setOrg({
              ...org,
              receipt_footer:
                e.target.value,
            })
          }
        />
      </label>

      <button
        className="btn primary wide"
        disabled={
          busy ||
          !canAdmin
        }
        onClick={save}
      >
        {busy
          ? 'Saving…'
          : 'Save company profile'}
      </button>
    </section>

    {/* STAFF */}

    <section className="card">
      <div className="section-head">
        <div>
          <h3>
            Staff &amp; roles
          </h3>

          <span>
            Manage staff accounts for this organization. Administrator and Master Admin accounts are never listed as staff.
          </span>
        </div>

        {canAdmin && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={() =>
              setStaffOpen(true)
            }
          >
            ＋ Add staff
          </button>
        )}
      </div>

      {!canAdmin && (
        <div className="notice error">
          Staff management is locked because this session is not an Administrator, Master Admin, or active Support Mode session for this organization.
        </div>
      )}

      {members.length === 0 ? (
        <div className="notice">
          No staff accounts have been added to this organization yet.
        </div>
      ) : (
        <div className="staff-list">
          {members.map(member => (
            <div
              className="staff-row"
              key={member.id}
            >
              <div className="staff-avatar">
                {(
                  member.full_name ||
                  'U'
                )
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div
                style={{
                  minWidth: 0,
                  flex: 1,
                }}
              >
                <strong>
                  {member.full_name ||
                    'Unnamed user'}
                </strong>

                <small>
                  {member.staff_id
                    ? `Staff ID: ${member.staff_id}`
                    : 'No Staff ID'}
                </small>
              </div>

              {canAdmin ? (
                <select
                  className="compact-select"
                  value={
                    STAFF_ROLES.includes(
                      member.role
                    )
                      ? member.role
                      : 'staff'
                  }
                  disabled={
                    busy
                  }
                  onChange={e =>
                    updateMemberRole(
                      member,
                      e.target.value
                    )
                  }
                >
                  {STAFF_ROLES.map(
                    role => (
                      <option
                        key={role}
                        value={role}
                      >
                        {role}
                      </option>
                    )
                  )}
                </select>
              ) : (
                <span className="badge">
                  {member.role}
                </span>
              )}

              {canAdmin && (
                <>
                  <button
                    className="btn small"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      setStaffStatus(
                        member,
                        !member.active
                      )
                    }
                  >
                    {member.active
                      ? 'Suspend'
                      : 'Activate'}
                  </button>

                  <button
                    className="btn small"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      forceLogout(
                        member
                      )
                    }
                  >
                    Force logout
                  </button>

                  <button
                    className="btn danger small"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      setDeleteStaff(
                        member
                      )
                    }
                  >
                    Delete
                  </button>
                </>
              )}

              <Badge
                tone={
                  member.active
                    ? 'success'
                    : 'danger'
                }
              >
                {member.active
                  ? 'ACTIVE'
                  : 'SUSPENDED'}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </section>
  </div>

  {/* FRESH START */}

  <section
    className="card"
    style={{
      marginTop: 20,
      borderColor:
        '#f0cbd3',
    }}
  >
    <div className="section-head">
      <div>
        <h3>
          Fresh start
        </h3>

        <span>
          Clear this organization's operational business data without deleting company configuration or staff.
        </span>
      </div>

      <button
        className="btn danger"
        disabled={
          busy ||
          resetBusy ||
          !canAdmin
        }
        onClick={() =>
          setResetOpen(true)
        }
      >
        Reset business data
      </button>
    </div>

    <div
      className="notice"
      style={{
        marginTop: 0,
        background:
          '#fff8f9',
        borderColor:
          '#f1d7de',
        color:
          '#7f3146',
      }}
    >
      This permanently removes customers, jobs, payments, receipts, print queue records and transaction history. Materials remain and stock is restored to opening balances. Staff and company settings remain.
    </div>
  </section>

  {/* ADD STAFF MODAL */}

  {staffOpen && (
    <div className="modal-backdrop">
      <section className="modal card">
        <div className="section-head">
          <div>
            <h3>
              Add staff member
            </h3>

            <span>
              A unique Staff ID will be generated automatically for this company.
            </span>
          </div>

          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              setStaffOpen(
                false
              )
            }
          >
            Close
          </button>
        </div>

        <label>
          Full name

          <input
            value={
              staff.full_name
            }
            onChange={e =>
              setStaff({
                ...staff,
                full_name:
                  e.target.value,
              })
            }
            placeholder="Staff full name"
          />
        </label>

        <label>
          Role

          <select
            value={
              staff.role
            }
            onChange={e =>
              setStaff({
                ...staff,
                role:
                  e.target.value,
              })
            }
          >
            {STAFF_ROLES.map(
              role => (
                <option
                  key={role}
                  value={role}
                >
                  {role}
                </option>
              )
            )}
          </select>
        </label>

        <div className="notice">
          The staff member will log in using their <strong>full name + generated Staff ID</strong>. Administrator and Master Admin accounts cannot use Staff Login.
        </div>

        <button
          className="btn primary wide"
          disabled={
            busy
          }
          onClick={() => void addStaff()}
        >
          {busy
            ? 'Creating…'
            : 'Create staff account'}
        </button>
      </section>
    </div>
  )}

  {/* DELETE STAFF */}

  {deleteStaff && (
    <div className="modal-backdrop">
      <section className="modal card">
        <div className="section-head">
          <div>
            <h3>
              Remove staff member
            </h3>

            <span>
              The staff membership will be removed from this organization.
            </span>
          </div>

          <button
            className="btn"
            disabled={
              busy
            }
            onClick={() =>
              setDeleteStaff(
                null
              )
            }
          >
            Cancel
          </button>
        </div>

        <div
          className="notice error"
          style={{
            marginTop: 0,
          }}
        >
          Remove{' '}
          <strong>
            {
              deleteStaff.full_name ||
              'this staff member'
            }
          </strong>{' '}
          from this organization?

          <br />

          <br />

          They will no longer be able to log in through Staff Login.
        </div>

        <button
          className="btn danger wide"
          disabled={
            busy
          }
          onClick={() => void removeStaff()}
        >
          {busy
            ? 'Removing…'
            : 'Remove staff member'}
        </button>
      </section>
    </div>
  )}

  {/* RESET BUSINESS */}

  {resetOpen && (
    <div className="modal-backdrop">
      <section className="modal card">
        <div className="section-head">
          <div>
            <h3>
              Reset organization
            </h3>

            <span>
              This action cannot be undone.
            </span>
          </div>

          <button
            className="btn"
            disabled={
              resetBusy
            }
            onClick={() =>
              setResetOpen(
                false
              )
            }
          >
            Cancel
          </button>
        </div>

        <div
          className="notice error"
          style={{
            marginTop: 0,
          }}
        >
          Customers, jobs, payments, receipts, print queue and inventory transaction history for this organization will be removed. Materials, staff and company settings remain.
        </div>

        <label>
          Type{' '}
          <strong>
            RESET
          </strong>{' '}
          to confirm

          <input
            value={
              resetText
            }
            onChange={e =>
              setResetText(
                e.target.value
              )
            }
            placeholder="RESET"
            autoComplete="off"
          />
        </label>

        <button
          className="btn danger wide"
          disabled={
            resetBusy ||
            resetText.trim() !==
              'RESET'
          }
          onClick={() => void resetBusiness()}
        >
          {resetBusy
            ? 'Resetting…'
            : 'Permanently reset business data'}
        </button>
      </section>
    </div>
  )}
</>

)
}
