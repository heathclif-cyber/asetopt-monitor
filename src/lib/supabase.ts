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
  // API mengirim {"detail": "..."}; klien Supabase membaca error.message.
  const body = await res.clone().json().catch(() => null)
  if (body && typeof body.detail === 'string' && !body.message) {
    return new Response(JSON.stringify({ ...body, message: body.detail }), {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    })
  }
  return res
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: authFetch },
})
