import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import Piutang from './Piutang'
import MonitoringKompensasi from './MonitoringKompensasi'

export default function MonitoringPenagihan({ mode }: { mode: 'piutang' | 'semua' }) {
  return <div className="space-y-4">
    <nav aria-label="Monitoring dan penagihan" className="flex flex-wrap gap-1 rounded-lg border bg-white p-1">
      {[
        { path: '/jalur-b/piutang', label: 'Piutang per Mitra' },
        { path: '/jalur-b/monitoring-kompensasi', label: 'Semua Tagihan' },
      ].map(tab => <NavLink key={tab.path} to={tab.path} className={({ isActive }) => cn(
        'rounded-md px-4 py-2 text-sm font-medium',
        isActive ? 'bg-[#1B4F72] text-white' : 'text-gray-600 hover:bg-gray-50',
      )}>{tab.label}</NavLink>)}
    </nav>
    {mode === 'piutang' ? <Piutang /> : <MonitoringKompensasi />}
  </div>
}
