export type ThemeMode = 'dark' | 'light'

export type PlatformAppRelease = {
  release_version: string
  minimum_supported_version: string
  is_force_update: boolean
  release_notes: string
  active: boolean
}

export type PlatformAppSettings = {
  app_name: string
  app_tagline: string
  accent_color: string
  theme_mode: ThemeMode
  enable_new_dashboard: boolean
  enable_dtf_calculator: boolean
  enable_inventory_labels: boolean
  enable_global_branding: boolean
  login_banner: string
}

export const CURRENT_APP_VERSION = '1.0.0-v36'

export const DEFAULT_PLATFORM_APP_RELEASE: PlatformAppRelease = {
  release_version: CURRENT_APP_VERSION,
  minimum_supported_version: '1.0.0-v36',
  is_force_update: false,
  release_notes: 'Platform release is current and the app is ready for use.',
  active: true,
}

export const DEFAULT_PLATFORM_APP_SETTINGS: PlatformAppSettings = {
  app_name: 'NETVYL',
  app_tagline: 'BUSINESS MANAGEMENT PLATFORM',
  accent_color: '#4f46e5',
  theme_mode: 'dark',
  enable_new_dashboard: true,
  enable_dtf_calculator: true,
  enable_inventory_labels: true,
  enable_global_branding: true,
  login_banner: 'Shared platform configuration is managed by the Master Admin.'
}

const PLATFORM_CONFIG_STORAGE_KEY = 'netvyl-platform-config'
const PLATFORM_RELEASE_STORAGE_KEY = 'netvyl-platform-release'

function readPlatformConfigFromStorage(): Partial<PlatformAppSettings> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PLATFORM_CONFIG_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PlatformAppSettings>
  } catch {
    return null
  }
}

export function persistPlatformConfigToStorage(settings: PlatformAppSettings) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PLATFORM_CONFIG_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Quietly ignore storage failures.
  }
}

function readPlatformReleaseFromStorage(): Partial<PlatformAppRelease> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PLATFORM_RELEASE_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PlatformAppRelease>
  } catch {
    return null
  }
}

export function persistPlatformReleaseToStorage(release: PlatformAppRelease) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(PLATFORM_RELEASE_STORAGE_KEY, JSON.stringify(release))
  } catch {
    // Quietly ignore storage failures.
  }
}

export function normalizePlatformAppRelease(raw: Record<string, any> = {}): PlatformAppRelease {
  const fallback = DEFAULT_PLATFORM_APP_RELEASE
  const releaseVersion = typeof raw.release_version === 'string' && raw.release_version.trim() ? raw.release_version.trim() : fallback.release_version
  const minimumSupported = typeof raw.minimum_supported_version === 'string' && raw.minimum_supported_version.trim() ? raw.minimum_supported_version.trim() : fallback.minimum_supported_version

  return {
    release_version: releaseVersion,
    minimum_supported_version: minimumSupported,
    is_force_update: Boolean(raw.is_force_update),
    release_notes: typeof raw.release_notes === 'string' && raw.release_notes.trim() ? raw.release_notes.trim() : fallback.release_notes,
    active: raw.active !== false,
  }
}

export function getCurrentAppVersion() {
  return CURRENT_APP_VERSION
}

function parseVersionParts(version: string | null | undefined): number[] {
  if (!version) return [0]
  const cleaned = String(version).replace(/^[^\d]+/, '').trim()
  if (!cleaned) return [0]

  const parts = cleaned.split(/[.-]/).map((part) => Number.parseInt(part, 10)).filter((part) => Number.isFinite(part))
  return parts.length ? parts : [0]
}

function compareVersions(left: Array<number>, right: Array<number>) {
  const maxLength = Math.max(left.length, right.length)

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = left[index] ?? 0
    const rightValue = right[index] ?? 0
    if (leftValue < rightValue) return -1
    if (leftValue > rightValue) return 1
  }

  return 0
}

export function isAppReleaseCurrent(release: PlatformAppRelease | null | undefined) {
  if (!release || !release.release_version) return true
  return compareVersions(parseVersionParts(getCurrentAppVersion()), parseVersionParts(release.release_version)) === 0
}

export function isReleaseUpdateRequired(release: PlatformAppRelease | null | undefined) {
  if (!release || !release.is_force_update) return false

  const currentVersion = parseVersionParts(getCurrentAppVersion())
  const minimumVersion = parseVersionParts(release.minimum_supported_version)
  const releaseVersion = parseVersionParts(release.release_version)

  const belowMinimum = compareVersions(currentVersion, minimumVersion) < 0
  const versionMismatch = compareVersions(currentVersion, releaseVersion) !== 0

  return belowMinimum || versionMismatch
}

function hexToRgba(hex: string, alpha: number) {
  const value = (hex || '#4f46e5').replace('#', '')
  const normalized = value.length === 3
    ? value.split('').map((char) => char + char).join('')
    : value
  const numeric = Number.parseInt(normalized, 16)
  const r = (numeric >> 16) & 255
  const g = (numeric >> 8) & 255
  const b = numeric & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function normalizePlatformAppSettings(raw: Record<string, any> = {}): PlatformAppSettings {
  const fallback = DEFAULT_PLATFORM_APP_SETTINGS
  const appName = typeof raw.app_name === 'string' && raw.app_name.trim() ? raw.app_name.trim() : fallback.app_name
  const appTagline = typeof raw.app_tagline === 'string' && raw.app_tagline.trim() ? raw.app_tagline.trim() : fallback.app_tagline
  const accentColor = typeof raw.accent_color === 'string' && raw.accent_color.trim() ? raw.accent_color.trim() : fallback.accent_color
  const themeMode = raw.theme_mode === 'light' ? 'light' : 'dark'

  return {
    app_name: appName,
    app_tagline: appTagline,
    accent_color: accentColor,
    theme_mode: themeMode,
    enable_new_dashboard: raw.enable_new_dashboard !== false,
    enable_dtf_calculator: raw.enable_dtf_calculator !== false,
    enable_inventory_labels: raw.enable_inventory_labels !== false,
    enable_global_branding: raw.enable_global_branding !== false,
    login_banner: typeof raw.login_banner === 'string' && raw.login_banner.trim() ? raw.login_banner.trim() : fallback.login_banner,
  }
}

export function applyPlatformAppSettings(settings: PlatformAppSettings) {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const accent = settings.accent_color || DEFAULT_PLATFORM_APP_SETTINGS.accent_color

  root.style.setProperty('--brand-accent', accent)
  root.style.setProperty('--brand-accent-soft', hexToRgba(accent, 0.16))
  root.style.setProperty('--brand-surface', settings.theme_mode === 'dark' ? '#0f172a' : '#f8fafc')
  root.style.setProperty('--brand-surface-alt', settings.theme_mode === 'dark' ? '#111827' : '#eef2ff')
  root.style.setProperty('--brand-text', settings.theme_mode === 'dark' ? '#f8fafc' : '#0f172a')
  root.dataset.platformTheme = settings.theme_mode

  if (settings.enable_global_branding) {
    document.title = `${settings.app_name} | ${settings.app_tagline}`
  }
}

export async function loadPlatformAppSettings(supabase: any | null): Promise<PlatformAppSettings> {
  const storageSnapshot = readPlatformConfigFromStorage()
  const fallback = storageSnapshot ? normalizePlatformAppSettings(storageSnapshot as Record<string, any>) : DEFAULT_PLATFORM_APP_SETTINGS

  if (!supabase) {
    return fallback
  }

  try {
    const { data, error } = await supabase.rpc('netvyl_get_platform_app_settings')

    if (error || !data) {
      return fallback
    }

    const settingsMap: Record<string, any> = {}
    for (const row of data) {
      if (row?.setting_key) {
        settingsMap[row.setting_key] = row.setting_value
      }
    }

    const merged = normalizePlatformAppSettings(settingsMap)
    persistPlatformConfigToStorage(merged)
    applyPlatformAppSettings(merged)
    return merged
  } catch {
    return fallback
  }
}

export async function savePlatformAppSettings(supabase: any | null, settings: PlatformAppSettings) {
  const normalized = normalizePlatformAppSettings(settings)
  persistPlatformConfigToStorage(normalized)
  applyPlatformAppSettings(normalized)

  if (!supabase) return normalized

  try {
    const entries = Object.entries(normalized) as [string, any][]
    for (const [key, value] of entries) {
      const { error } = await supabase.rpc('netvyl_set_platform_app_setting', {
        p_key: key,
        p_value: value,
      })

      if (error) {
        throw error
      }
    }

    return normalized
  } catch {
    return normalized
  }
}

export async function loadPlatformAppRelease(supabase: any | null): Promise<PlatformAppRelease> {
  const storageSnapshot = readPlatformReleaseFromStorage()
  const fallback = storageSnapshot ? normalizePlatformAppRelease(storageSnapshot as Record<string, any>) : DEFAULT_PLATFORM_APP_RELEASE

  if (!supabase) return fallback

  try {
    const { data, error } = await supabase.rpc('netvyl_get_platform_app_release')

    if (error || !data) return fallback

    const release = normalizePlatformAppRelease(data)
    persistPlatformReleaseToStorage(release)
    return release
  } catch {
    return fallback
  }
}

export async function savePlatformAppRelease(supabase: any | null, release: PlatformAppRelease) {
  const normalized = normalizePlatformAppRelease(release as Record<string, any>)
  persistPlatformReleaseToStorage(normalized)

  if (!supabase) return normalized

  try {
    const { data, error } = await supabase.rpc('netvyl_set_platform_app_release', {
      p_release_version: normalized.release_version,
      p_minimum_supported_version: normalized.minimum_supported_version,
      p_is_force_update: normalized.is_force_update,
      p_release_notes: normalized.release_notes,
      p_active: normalized.active,
    })

    if (error) throw error
    return normalizePlatformAppRelease(data || normalized)
  } catch {
    return normalized
  }
}
