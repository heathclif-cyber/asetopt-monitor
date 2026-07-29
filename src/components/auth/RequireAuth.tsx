import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { VIEWER_HOME, canAccessPath } from '@/lib/auth'
import { Loader2 } from 'lucide-react'

export function RequireAuth() {
  const location = useLocation()
  const { user, isReady, hydrate } = useAuthStore()

  useEffect(() => {
    if (!isReady) void hydrate()
  }, [isReady, hydrate])

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={18} className="animate-spin text-[#1B4F72]" />
          Memuat sesi...
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!canAccessPath(user.role, location.pathname)) {
    return <Navigate to={user.role === 'viewer' ? VIEWER_HOME : '/'} replace />
  }

  return <Outlet />
}
