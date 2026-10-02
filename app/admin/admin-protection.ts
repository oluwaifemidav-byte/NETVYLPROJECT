'use client'

const ADMIN_UNLOCK_KEY = 'netvyl_admin_unlocked'

export function isAdminUnlocked(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === 'true'
}

export function unlockAdminActions(): void {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.setItem(
    ADMIN_UNLOCK_KEY,
    'true'
  )

  window.dispatchEvent(
    new Event('netvyl:admin-unlocked')
  )
}

export function lockAdminActions(): void {
  if (typeof window === 'undefined') {
    return
  }

  sessionStorage.removeItem(
    ADMIN_UNLOCK_KEY
  )

  window.dispatchEvent(
    new Event('netvyl:admin-locked')
  )
}