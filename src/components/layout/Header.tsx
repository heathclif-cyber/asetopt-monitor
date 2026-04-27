import { Bell, User } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { Badge } from '@/components/ui/badge'

const breadcrumbMap: Record<string, string[]> = {
  '/': ['Dashboard'],
  '/jalur-a/timeline': ['Jalur A', 'Timeline Program'],
  '/jalur-a/potensi': ['Jalur A', 'Potensi Pendapatan'],
  '/jalur-b/kerja-sama': ['Jalur B', 'Kerja Sama'],
  '/jalur-b/kompensasi': ['Jalur B', 'Kompensasi'],
  '/jalur-b/pbb': ['Jalur B', 'Pembayaran PBB'],
  '/jalur-b/notifikasi': ['Jalur B', 'Notifikasi & SP'],
  '/master/aset': ['Master Data', 'Data Aset'],
  '/master/njop': ['Master Data', 'Data NJOP'],
  '/master/kjpp': ['Master Data', 'Penilaian KJPP'],
}

export function Header() {
  const location = useLocation()
  const { jatuhTempoH14, spAktif } = useNotifikasiStore()

  const crumbs = breadcrumbMap[location.pathname] ?? ['AsetOpt']
  const totalAlert = jatuhTempoH14.length + spAktif.length

  return (
    <header className="fixed top-0 left-56 right-0 h-[56px] bg-white border-b border-gray-200 flex items-center justify-between px-5 z-30">
      <div className="flex items-center gap-1 text-xs text-gray-500">
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-gray-300 mx-0.5">/</span>}
            <span className={i === crumbs.length - 1 ? 'text-gray-800 font-semibold text-sm' : ''}>{c}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative cursor-pointer group">
          <Bell size={17} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
          {totalAlert > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full h-3.5 w-3.5 flex items-center justify-center font-bold">
              {totalAlert > 9 ? '9+' : totalAlert}
            </span>
          )}
        </div>
        <div className="h-7 w-7 rounded-full bg-[#1B4F72] flex items-center justify-center">
          <User size={13} className="text-white" />
        </div>
      </div>
    </header>
  )
}
