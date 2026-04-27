import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, TrendingUp, Handshake, DollarSign,
  Receipt, Bell, Database, BarChart3, Building2, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface NavItem {
  label: string
  to?: string
  icon?: React.ReactNode
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={18} /> },
  {
    label: 'Jalur A — Pipeline',
    icon: <GitBranch size={18} />,
    children: [
      { label: 'Timeline Program', to: '/jalur-a/timeline' },
      { label: 'Potensi Pendapatan', to: '/jalur-a/potensi' },
    ],
  },
  {
    label: 'Jalur B — Kerja Sama',
    icon: <Handshake size={18} />,
    children: [
      { label: 'Kerja Sama', to: '/jalur-b/kerja-sama' },
      { label: 'Kompensasi', to: '/jalur-b/kompensasi' },
      { label: 'Pembayaran PBB', to: '/jalur-b/pbb' },
      { label: 'Notifikasi & SP', to: '/jalur-b/notifikasi' },
    ],
  },
  {
    label: 'Master Data',
    icon: <Database size={18} />,
    children: [
      { label: 'Data Aset', to: '/master/aset' },
      { label: 'Data NJOP', to: '/master/njop' },
      { label: 'Penilaian KJPP', to: '/master/kjpp' },
    ],
  },
]

function NavGroup({ item }: { item: NavItem }) {
  const [open, setOpen] = useState(true)

  if (item.to) {
    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
            isActive
              ? 'bg-white/20 text-white font-medium'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          )
        }
      >
        {item.icon}
        {item.label}
      </NavLink>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && item.children && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-white/20 pl-3">
          {item.children.map(child => (
            <NavLink
              key={child.to}
              to={child.to!}
              className={({ isActive }) =>
                cn(
                  'block px-2 py-1.5 rounded-md text-xs transition-colors',
                  isActive
                    ? 'bg-white/20 text-white font-medium'
                    : 'text-blue-200 hover:bg-white/10 hover:text-white'
                )
              }
            >
              {child.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[#1B4F72] flex flex-col z-40">
      <div className="px-4 py-5 border-b border-white/20">
        <div className="flex items-center gap-2">
          <Building2 className="text-white" size={24} />
          <div>
            <div className="text-white font-bold text-sm leading-tight">AsetOpt</div>
            <div className="text-blue-200 text-xs">Monitor</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item, i) => (
          <NavGroup key={i} item={item} />
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-white/20 text-xs text-blue-300">
        v0.1.0
      </div>
    </aside>
  )
}
