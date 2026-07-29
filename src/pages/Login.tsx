import { useState, FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Building2, Loader2, Lock, User } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { VIEWER_HOME } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, isLoading, error, clearError } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const from = (location.state as { from?: string } | null)?.from

  if (user) {
    const dest = user.role === 'viewer'
      ? VIEWER_HOME
      : (from && from !== '/login' ? from : '/')
    return <Navigate to={dest} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    try {
      await login(username, password)
      const role = useAuthStore.getState().user?.role
      navigate(role === 'viewer' ? VIEWER_HOME : (from && from !== '/login' ? from : '/'), { replace: true })
    } catch {
      // error di store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f3352] via-[#1a4f73] to-[#163f5c] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/15 mb-3">
            <Building2 className="text-white" size={24} />
          </div>
          <h1 className="text-xl font-bold text-white">AsetOpt Monitor</h1>
          <p className="text-sm text-blue-200 mt-1">Masuk untuk melanjutkan</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-2xl shadow-xl border border-white/20 p-6 space-y-4"
        >
          <div>
            <Label htmlFor="username" className="text-xs text-gray-600">Username</Label>
            <div className="relative mt-1">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="pl-9 h-10"
                placeholder="admin / viewer"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password" className="text-xs text-gray-600">Password</Label>
            <div className="relative mt-1">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pl-9 h-10"
                placeholder="••••••••"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full h-10 bg-[#1B4F72] hover:bg-[#163f5c]"
            disabled={isLoading || !username.trim() || !password}
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Masuk...
              </>
            ) : (
              'Masuk'
            )}
          </Button>

          <p className="text-[10px] text-gray-400 text-center leading-relaxed">
            Admin: akses penuh · Viewer: Laporan, Piutang, Monitoring
          </p>
        </form>
      </div>
    </div>
  )
}
