import { Bell, LogOut, Menu, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { APP_PAGES } from '@/lib/navigation'

const breadcrumbMap = new Map(APP_PAGES.map(page => [page.path as string, page.breadcrumb]))

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { jatuhTempoH14, spAktif } = useNotifikasiStore()
  const { user, logout } = useAuthStore()

  const crumbs = breadcrumbMap.get(location.pathname) ?? ['AsetOpt']
  const totalAlert = jatuhTempoH14.length + spAktif.length

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex h-[56px] items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-5 lg:left-56">
      <div className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-gray-500">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 lg:hidden"
          onClick={onMenuClick}
          aria-label="Buka menu"
        >
          <Menu size={18} />
        </Button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className="text-gray-300 mx-0.5">/</span>}
            <span className={i === crumbs.length - 1 ? 'truncate text-sm font-semibold text-gray-800' : ''}>{c}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {(user?.role === 'admin' || user?.role === 'staf') && (
          <div className="relative cursor-pointer group">
            <Bell size={17} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
            {totalAlert > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-3.5 w-3.5 flex items-center justify-center font-bold">
                {totalAlert > 9 ? '9+' : totalAlert}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pl-1">
          <div className="h-7 w-7 rounded-full bg-[#1B4F72] flex items-center justify-center shrink-0">
            <User size={13} className="text-white" />
          </div>
          <div className="hidden sm:block text-right leading-tight min-w-0">
            <p className="text-xs font-medium text-gray-800 truncate max-w-[120px]">
              {user?.full_name ?? '—'}
            </p>
            <p className="text-[10px] text-gray-400 uppercase">
              {user?.role === 'admin_aset' ? 'Admin Data Aset' : user?.role === 'viewer_aset' ? 'Pembaca Master & Peta' : user?.role}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs text-gray-500 hover:text-red-600"
            onClick={handleLogout}
            title="Keluar"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">Keluar</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
