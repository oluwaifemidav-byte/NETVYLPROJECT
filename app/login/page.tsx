'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '../../lib/supabase-browser'
import { setActiveOrganizationId } from '../../lib/organization-context'
import { DEFAULT_PLATFORM_APP_SETTINGS, applyPlatformAppSettings, loadPlatformAppSettings } from '../../lib/platform-config'

type LoginMode = 'staff' | 'admin'

const STAFF_LOGIN_STORAGE_KEY = 'netvyl_saved_staff_login'
const ADMIN_LOGIN_STORAGE_KEY = 'netvyl_saved_admin_login'

export default function Login() {
  const router = useRouter()
  const supabase = supabaseBrowser()

  const [mode, setMode] = useState<LoginMode>('staff')

  const [fullName, setFullName] = useState('')
  const [staffId, setStaffId] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [platformConfig, setPlatformConfig] = useState(DEFAULT_PLATFORM_APP_SETTINGS)

  useEffect(() => {
    const timer = window.setTimeout(() => setShowWelcome(false), 3000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    let active = true

    loadPlatformAppSettings(supabase)
      .then((settings) => {
        if (active) {
          setPlatformConfig(settings)
          applyPlatformAppSettings(settings)
        }
      })
      .catch(() => {
        // Ignore remote config errors and keep the app usable.
      })

    return () => {
      active = false
    }
  }, [supabase])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const savedStaff = window.localStorage.getItem(STAFF_LOGIN_STORAGE_KEY)
      const savedAdmin = window.localStorage.getItem(ADMIN_LOGIN_STORAGE_KEY)

      if (savedStaff) {
        const parsed = JSON.parse(savedStaff) as {
          fullName?: string
          staffId?: string
        }

        if (parsed.fullName || parsed.staffId) {
          setFullName(parsed.fullName || '')
          setStaffId(parsed.staffId || '')
          setRememberMe(true)
        }
      }

      if (savedAdmin) {
        const parsed = JSON.parse(savedAdmin) as {
          email?: string
        }

        if (parsed.email) {
          setEmail(parsed.email)
          setRememberMe(true)
        }
      }
    } catch {
      // Ignore local storage errors and keep the form usable.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (mode === 'staff') {
      const saved = window.localStorage.getItem(STAFF_LOGIN_STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as {
            fullName?: string
            staffId?: string
          }

          if (parsed.fullName || parsed.staffId) {
            setFullName(parsed.fullName || '')
            setStaffId(parsed.staffId || '')
            setRememberMe(true)
          }
        } catch {
          // Ignore malformed saved staff login data.
        }
      }
      return
    }

    const saved = window.localStorage.getItem(ADMIN_LOGIN_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          email?: string
        }

        if (parsed.email) {
          setEmail(parsed.email)
          setRememberMe(true)
        }
      } catch {
        // Ignore malformed saved admin login data.
      }
    }
  }, [mode])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const target = mode === 'staff' ? STAFF_LOGIN_STORAGE_KEY : ADMIN_LOGIN_STORAGE_KEY

    if (!rememberMe) {
      window.localStorage.removeItem(target)
      return
    }

    const payload =
      mode === 'staff'
        ? {
            fullName: fullName.trim(),
            staffId: staffId.trim().toUpperCase(),
          }
        : {
            email: email.trim(),
          }

    if (payload.fullName || payload.staffId || payload.email) {
      window.localStorage.setItem(target, JSON.stringify(payload))
    }
  }, [email, fullName, mode, rememberMe, staffId])

  // =========================================================
  // STAFF LOGIN
  // =========================================================

  async function staffLogin(e: React.FormEvent) {
    e.preventDefault()

    const name = fullName.trim().replace(/\s+/g, ' ')
    const id = staffId.trim().toUpperCase()

    if (!name || !id) {
      setError('Enter your full name and Staff ID.')
      return
    }

    setBusy(true)
    setError('')

    try {
      // -----------------------------------------------------
      // Verify Staff ID + Full Name against the organization
      // -----------------------------------------------------

      const {
        data: identity,
        error: identityError,
      } = await supabase.rpc(
        'netvyl_get_staff_login_identity',
        {
          p_staff_id: id,
          p_full_name: name,
        }
      )

      if (identityError) {
        throw new Error(identityError.message)
      }

      const account = identity?.[0]

      if (
        !account?.login_email ||
        !account?.organization_id
      ) {
        throw new Error(
          'Staff account not found. Check your full name and Staff ID.'
        )
      }

      // -----------------------------------------------------
      // Sign in using the INTERNAL Auth email.
      //
      // Staff never needs to know this email.
      // Staff ID is the initial password.
      // -----------------------------------------------------

      const {
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: account.login_email,
        password: id,
      })

      if (authError) {
        throw new Error(
          'Staff authentication failed. Check your Staff ID or contact your administrator.'
        )
      }

      // -----------------------------------------------------
      // Set the verified organization.
      // Never trust an old organization ID from the browser.
      // -----------------------------------------------------

      setActiveOrganizationId(
        account.organization_id
      )

      // -----------------------------------------------------
      // Save Staff session information
      // -----------------------------------------------------

      sessionStorage.setItem(
        'netvyl_staff_id',
        id
      )

      sessionStorage.setItem(
        'netvyl_staff_name',
        account.full_name || name
      )

      sessionStorage.setItem(
        'netvyl_staff_role',
        account.role || 'staff'
      )

      sessionStorage.setItem(
        'netvyl_staff_organization_id',
        account.organization_id
      )

      sessionStorage.setItem(
        'netvyl_staff_session_started_at',
        new Date().toISOString()
      )

      // -----------------------------------------------------
      // Go to dashboard
      // -----------------------------------------------------

      router.replace('/dashboard')

    } catch (caught: any) {
      setError(
        caught?.message ||
        'Unable to sign in.'
      )
    } finally {
      setBusy(false)
    }
  }

  // =========================================================
  // ADMINISTRATOR LOGIN
  // =========================================================

  async function administratorLogin(
    e: React.FormEvent
  ) {
    e.preventDefault()

    if (!email.trim() || !password) {
      setError(
        'Enter your email and password.'
      )
      return
    }

    setBusy(true)
    setError('')

    try {
      const {
        data,
        error: authError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (authError || !data.user) {
        throw new Error(
          authError?.message ||
          'Administrator authentication failed.'
        )
      }

      // -----------------------------------------------------
      // Find active administrator/super admin membership
      // -----------------------------------------------------

      const {
        data: memberships,
        error: memberError,
      } = await supabase
        .from('organization_members')
        .select(
          'organization_id,role,active'
        )
        .eq(
          'user_id',
          data.user.id
        )
        .eq(
          'active',
          true
        )

      if (memberError) {
        await supabase.auth.signOut()

        throw new Error(
          memberError.message
        )
      }

      const membership =
        (memberships || []).find(
          row =>
            row.role === 'administrator' ||
            row.role === 'super_admin'
        )

      if (
        !membership?.organization_id
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'This account is not assigned to an active organization.'
        )
      }

      // -----------------------------------------------------
      // Set administrator organization
      // -----------------------------------------------------

      setActiveOrganizationId(
        membership.organization_id
      )

      // -----------------------------------------------------
      // Remove any old staff session data
      // -----------------------------------------------------

      sessionStorage.removeItem(
        'netvyl_staff_id'
      )

      sessionStorage.removeItem(
        'netvyl_staff_name'
      )

      sessionStorage.removeItem(
        'netvyl_staff_role'
      )

      sessionStorage.removeItem(
        'netvyl_staff_organization_id'
      )

      sessionStorage.removeItem(
        'netvyl_staff_session_started_at'
      )

      // -----------------------------------------------------
      // Dashboard
      // -----------------------------------------------------

      router.replace('/dashboard')

    } catch (caught: any) {
      setError(
        caught?.message ||
        'Unable to sign in.'
      )
    } finally {
      setBusy(false)
    }
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <main className="auth-page">

      {showWelcome && (
        <div className="welcome-screen" role="status" aria-live="polite">
          <div className="welcome-panel">
            <div className="welcome-brand">
              <div className="brand-mark welcome-mark">N</div>
            </div>
            <div className="welcome-banner">Welcome</div>
          </div>
        </div>
      )}

      {!showWelcome && (
        <>
          <div className="auth-brand">

            <div className="brand-mark large">
              N
            </div>

            <div>

              <div className="brand-name">
                {platformConfig.app_name}
              </div>

              <div className="brand-sub">
                {platformConfig.app_tagline}
              </div>

            </div>

          </div>

          <div className="auth-card">

        <span className="kicker">
          SECURE WORKSPACE
        </span>

        <h1>
          {mode === 'staff'
            ? 'Staff Login'
            : 'Administrator Login'}
        </h1>

        <p>
          {platformConfig.login_banner || (mode === 'staff'
            ? 'Sign in with your registered full name and Staff ID.'
            : 'Use your administrator or Master Admin account.')}
        </p>

        {/* =================================================
            LOGIN MODE
        ================================================= */}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              '1fr 1fr',
            gap: 8,
            marginBottom: 18,
          }}
        >

          <button
            type="button"
            className={`btn ${
              mode === 'staff'
                ? 'primary'
                : ''
            }`}
            onClick={() => {
              setMode('staff')
              setError('')
              setPassword('')

              const saved = window.localStorage.getItem(STAFF_LOGIN_STORAGE_KEY)
              if (saved) {
                try {
                  const parsed = JSON.parse(saved) as {
                    fullName?: string
                    staffId?: string
                  }
                  setFullName(parsed.fullName || '')
                  setStaffId(parsed.staffId || '')
                  setRememberMe(true)
                } catch {
                  setRememberMe(false)
                }
              } else {
                setRememberMe(false)
              }
            }}
          >
            Staff
          </button>

          <button
            type="button"
            className={`btn ${
              mode === 'admin'
                ? 'primary'
                : ''
            }`}
            onClick={() => {
              setMode('admin')
              setError('')
              setStaffId('')

              const saved = window.localStorage.getItem(ADMIN_LOGIN_STORAGE_KEY)
              if (saved) {
                try {
                  const parsed = JSON.parse(saved) as {
                    email?: string
                  }
                  setEmail(parsed.email || '')
                  setRememberMe(true)
                } catch {
                  setRememberMe(false)
                }
              } else {
                setRememberMe(false)
              }
            }}
          >
            Administrator
          </button>

        </div>

        {/* =================================================
            STAFF LOGIN FORM
        ================================================= */}

        {mode === 'staff' ? (

          <form
            onSubmit={staffLogin}
          >

            <label>
              Full name

              <input
                value={fullName}
                onChange={e =>
                  setFullName(
                    e.target.value
                  )
                }
                required
                autoComplete="name"
                placeholder="Enter your full name"
                autoFocus
              />

            </label>

            <label>
              Staff ID

              <input
                value={staffId}
                onChange={e =>
                  setStaffId(
                    e.target.value.toUpperCase()
                  )
                }
                required
                autoComplete="username"
                placeholder="STF-XXXXXXXX"
              />

            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              Remember my Staff ID
            </label>

            <div
              className="notice"
              style={{
                marginTop: 8,
                marginBottom: 12,
              }}
            >
              Your Staff ID is generated by
              your company's administrator.

              <br />

              Master Admin and Administrator
              accounts cannot use Staff Login.
            </div>

            {error && (
              <div className="notice error">
                {error}
              </div>
            )}

            <button
              className="btn primary wide"
              disabled={busy}
            >
              {busy
                ? 'Signing in…'
                : 'Sign in as staff'}
            </button>

          </form>

        ) : (

          /* =================================================
             ADMINISTRATOR LOGIN FORM
          ================================================= */

          <form
            onSubmit={administratorLogin}
          >

            <label>
              Email

              <input
                type="email"
                value={email}
                onChange={e =>
                  setEmail(
                    e.target.value
                  )
                }
                required
                autoComplete="email"
                autoFocus
              />

            </label>

            <label>
              Password

              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e =>
                    setPassword(
                      e.target.value
                    )
                  }
                  required
                  autoComplete="current-password"
                  style={{ paddingRight: 72 }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  className="btn"
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: '6px 10px',
                    minHeight: 0,
                    lineHeight: 1.2,
                    fontSize: 12,
                  }}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                marginBottom: 12,
                fontSize: 14,
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
              />
              Remember my email
            </label>

            {error && (
              <div className="notice error">
                {error}
              </div>
            )}

            <button
              className="btn primary wide"
              disabled={busy}
            >
              {busy
                ? 'Signing in…'
                : 'Sign in as administrator'}
            </button>

          </form>

        )}

        <div
          style={{
            textAlign: 'center',
            marginTop: 14,
            display: 'grid',
            gap: 8,
          }}
        >

          <a href="/forgot-password">
            Forgot password?
          </a>

          <a href="/activate">
            Activate NETVYL License
          </a>

          <a href="/register">
            Purchase a NETVYL License
          </a>

        </div>

            <small className="auth-foot">
              Powered by NETVYL Digital Resources Global Ltd
            </small>

          </div>
        </>
      )}

    </main>
  )
}
