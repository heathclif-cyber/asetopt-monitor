import { createClient } from '@supabase/supabase-js'

const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '')
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
const url = apiBase
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'railway-internal'

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
