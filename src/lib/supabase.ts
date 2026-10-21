import { createClient } from '@supabase/supabase-js'
import { getStoredToken, clearSession } from '@/lib/auth'

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
const url = apiBase
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'railway-internal'

async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = getStoredToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
    headers.set('X-Asetopt-Token', token)
  }
  const res = await fetch(input, { ...init, headers })
  if (res.status === 401 && typeof window !== 'undefined') {
    clearSession()
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
  }
  if (res.ok) return res
  const galat = (message: string, extra: object = {}) => new Response(JSON.stringify({ ...extra, message }), {
    status: res.status,
    statusText: res.statusText,
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.clone().json().catch(() => null)
  // API mengirim {"detail": "..."}; klien Supabase membaca error.message.
  if (body && typeof body.detail === 'string' && !body.message) return galat(body.detail, body)
  // Balasan bukan JSON (mis. halaman 502 dari proxy saat server sedang dimulai ulang): jangan tampilkan HTML mentah.
  if (!body && res.status >= 500) return galat(`Server sedang tidak dapat dihubungi (kode ${res.status}). Coba lagi sebentar lagi.`)
  return res
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: authFetch },
})
