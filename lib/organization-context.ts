'use client'

const KEY='netvyl-active-organization'

export function getActiveOrganizationId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(KEY)
}

export function setActiveOrganizationId(id: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY,id)
}

export function clearActiveOrganizationId() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY)
}
