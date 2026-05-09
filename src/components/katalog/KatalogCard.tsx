import { useState } from 'react'
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { cn, formatAngka } from '@/lib/utils'
import { StatusBadge } from '@/components/common/StatusBadge'
import { KatalogCardSections } from './KatalogCardSections'
import type { Aset, NJOP, PenilaianKJPP, TimelineProgram, ProspekMitra, KerjaSama, PBB } from '@/types'
import type { PotensiResult } from '@/utils/potensiUtils'

const statusBorder: Record<string, string> = {
  pipeline: 'border-l-blue-400',
  prospek: 'border-l-yellow-400',
  negosiasi: 'border-l-orange-400',
  aktif_ks: 'border-l-green-400',
  selesai: 'border-l-gray-400',
}

interface KatalogCardProps {
  aset: Aset
  njopTerbaru: NJOP | null
  kjppTerbaru: PenilaianKJPP | null
  potensi: PotensiResult | null
  timeline: TimelineProgram[]
  timelineProgress: number
  prospek: ProspekMitra[]
  kerjaSama: KerjaSama | null
  pbbTerbaru: PBB | null
}

export function KatalogCard(props: KatalogCardProps) {
  const { aset, ...rest } = props
  const [expanded, setExpanded] = useState(false)

  const border = statusBorder[aset.status] ?? 'border-l-gray-300'

  return (
    <div className={cn('rounded-xl border bg-white overflow-hidden border-l-4', border)}>
      {/* Header */}
      <button
        type="button"
        className="w-full text-left px-4 py-3.5 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-xs font-mono text-gray-400">{aset.kode_aset}</span>
            <StatusBadge type="aset" value={aset.status} />
          </div>
          <h3 className="font-semibold text-gray-900 text-sm truncate">{aset.nama_aset}</h3>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
            {aset.luas_tanah_m2 != null && <span>Tanah: {formatAngka(aset.luas_tanah_m2)} m²</span>}
            {aset.luas_bangunan_m2 != null && <span>Bangunan: {formatAngka(aset.luas_bangunan_m2)} m²</span>}
            {aset.alamat && (
              <span className="flex items-center gap-0.5 truncate">
                <MapPin size={10} /> {aset.alamat}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pt-0.5">
          {rest.potensi && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-gray-400 leading-tight">Potensi</p>
              <p className="font-bold text-[#117A65] text-xs">
                {new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0, notation: 'compact' }).format(rest.potensi.totalPotensi)}
              </p>
            </div>
          )}
          <div className="text-gray-400">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-4 py-4 bg-gray-50/50">
          <KatalogCardSections aset={aset} {...rest} />
        </div>
      )}
    </div>
  )
}
