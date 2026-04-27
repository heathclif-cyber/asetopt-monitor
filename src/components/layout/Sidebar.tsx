import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, GitBranch, Handshake, Database,
  Building2, ChevronDown, ChevronRight, Target
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
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={15} /> },
  { label: 'RKAP Monitor', to: '/rkap', icon: <Target size={15} /> },
  {
    label: 'Jalur A — Pipeline',
    icon: <GitBranch size={15} />,
    children: [
      { label: 'Timeline Program', to: '/jalur-a/timeline' },
      { label: 'Potensi Pendapatan', to: '/jalur-a/potensi' },
    ],
  },
  {
    label: 'Jalur B — Kerja Sama',
    icon: <Handshake size={15} />,
    children: [
      { label: 'Kerja Sama', to: '/jalur-b/kerja-sama' },
      { label: 'Kompensasi', to: '/jalur-b/kompensasi' },
      { label: 'Pembayaran PBB', to: '/jalur-b/pbb' },
      { label: 'Notifikasi & SP', to: '/jalur-b/notifikasi' },
    ],
  },
  {
    label: 'Master Data',
    icon: <Database size={15} />,
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
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all duration-150',
            isActive
              ? 'bg-white/15 text-white border-l-2 border-white pl-[10px]'
              : 'text-blue-200 hover:bg-white/8 hover:text-white border-l-2 border-transparent pl-[10px]'
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
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium text-blue-200 hover:bg-white/8 hover:text-white transition-all duration-150"
      >
        {item.icon}
        <span className="flex-1 text-left">{item.label}</span>
        {open
          ? <ChevronDown size={13} className="opacity-60" />
          : <ChevronRight size={13} className="opacity-60" />}
      </button>
      {open && item.children && (
        <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/15 pl-3">
          {item.children.map(child => (
            <NavLink
              key={child.to}
              to={child.to!}
              className={({ isActive }) =>
                cn(
                  'block px-2.5 py-1.5 rounded-md text-xs transition-all duration-150',
                  isActive
                    ? 'bg-white/15 text-white font-medium'
                    : 'text-blue-300 hover:bg-white/8 hover:text-white'
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
    <aside className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-[#1a4f73] to-[#0f3352] flex flex-col z-40 shadow-lg">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
            <Building2 className="text-white" size={16} />
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">AsetOpt</div>
            <div className="text-blue-300 text-[11px] leading-tight">Monitor v0.1</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {navItems.map((item, i) => (
          <NavGroup key={i} item={item} />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-[11px] text-blue-400 leading-tight">© 2025 AsetOpt</p>
      </div>
    </aside>
  )
}
