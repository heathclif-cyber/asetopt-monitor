/** Role & path access helpers */

export type AppRole = 'admin' | 'viewer'

export interface AuthUser {
  id: string
  username: string
  full_name: string
  role: AppRole
}

export const AUTH_TOKEN_KEY = 'asetopt_auth_token'
export const AUTH_USER_KEY = 'asetopt_auth_user'

/** Viewer: hanya halaman collection/laporan (tanpa Laporan HO) */
export const VIEWER_ALLOWED_PATHS = [
  '/jalur-b/laporan',
  '/jalur-b/piutang',
  '/jalur-b/monitoring-kompensasi',
] as const

export const VIEWER_HOME = '/jalur-b/laporan'

export function isViewerPath(pathname: string): boolean {
  return VIEWER_ALLOWED_PATHS.some(
    p => pathname === p || pathname.startsWith(p + '/'),
  )
}

export function canAccessPath(role: AppRole | null | undefined, pathname: string): boolean {
  if (!role) return false
  if (role === 'admin') return true
  if (pathname === '/login') return true
  return isViewerPath(pathname)
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY)
    if (!raw) return null
    const u = JSON.parse(raw) as AuthUser
    if (!u?.id || !u?.role) return null
    return u
  } catch {
    return null
  }
}

export function persistSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token)
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}
