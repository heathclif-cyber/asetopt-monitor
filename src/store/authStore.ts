import { create } from 'zustand'
import {
  type AuthUser,
  clearSession,
  getStoredToken,
  getStoredUser,
  persistSession,
} from '@/lib/auth'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

interface AuthStore {
  token: string | null
  user: AuthUser | null
  isReady: boolean
  isLoading: boolean
  error: string | null
  hydrate: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: getStoredToken(),
  user: getStoredUser(),
  isReady: false,
  isLoading: false,
  error: null,

  clearError: () => set({ error: null }),

  hydrate: async () => {
    const token = getStoredToken()
    if (!token) {
      clearSession()
      set({ token: null, user: null, isReady: true })
      return
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        clearSession()
        set({ token: null, user: null, isReady: true })
        return
      }
      const data = await res.json()
      const user = data.user as AuthUser
      persistSession(token, user)
      set({ token, user, isReady: true })
    } catch {
      // Offline / API down: keep cached session so UI masih bisa render
      const cached = getStoredUser()
      if (cached) {
        set({ token, user: cached, isReady: true })
      } else {
        clearSession()
        set({ token: null, user: null, isReady: true })
      }
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null })
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const detail = data.detail
        const msg = typeof detail === 'string' ? detail : 'Login gagal'
        throw new Error(msg)
      }
      const token = data.token as string
      const user = data.user as AuthUser
      persistSession(token, user)
      set({ token, user, isLoading: false, error: null })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Login gagal'
      set({ isLoading: false, error: msg, token: null, user: null })
      clearSession()
      throw e
    }
  },

  logout: async () => {
    const token = get().token
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
    } catch {
      // ignore
    }
    clearSession()
    set({ token: null, user: null, error: null })
  },
}))
