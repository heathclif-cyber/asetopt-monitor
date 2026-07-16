import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Filter,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useAsetStore } from '@/store/asetStore'
import { useRKAPStore } from '@/store/rkapStore'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { Button } from '@/components/ui/button'
import { cn, formatTanggal } from '@/lib/utils'
import {
  buildMonitoringDetailRows,
  exportMonitoringExcel,
  groupMonitoringByMitra,
  MONITORING_STATUS_LABEL,
  summarizeMonitoringRows,
  type MonitoringDetailRow,
  type MonitoringGroup,
  type MonitoringStatusBayar,
} from '@/utils/monitoringKompensasiUtils'
import {
  downloadLaporanMitraDocx,
  downloadLaporanSemuaMitraDocx,
} from '@/utils/monitoringMitraDocx'

type StatusFilter = 'all' | MonitoringStatusBayar

const STATUS_COLOR: Record<MonitoringStatusBayar, string> = {
  lunas: 'bg-green-100 text-green-700',
  sebagian: 'bg-amber-100 text-amber-700',
  belum_bayar: 'bg-gray-100 text-gray-600',
  terlambat: 'bg-red-100 text-red-700',
}

function parseYear(dateStr: string): number {
  return Number(dateStr.slice(0, 4))
}

export default function MonitoringKompensasi() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()

  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [filterProker, setFilterProker] = useState('all')
  const [filterMitra, setFilterMitra] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [onlyDenda, setOnlyDenda] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandAll, setExpandAll] = useState(true)
  const [exporting, setExporting] = useState<string | null>(null)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchAset()
  }, [location.key])

  useEffect(() => {
    fetchRKAP(tahun)
  }, [tahun, location.key])

  const rkapByKode = useMemo(() => {
    const m = new Map<string, string>()
    rkapRows.forEach(r => {
      const kode = r.kode?.trim()
      if (kode && !m.has(kode)) m.set(kode, r.nama || kode)
    })
    return m
  }, [rkapRows])

  const ksById = useMemo(
    () => new Map(daftarKS.map(k => [k.id, k])),
    [daftarKS],
  )

  const tahunList = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()])
    allKompensasi.forEach(k => {
      if (k.tgl_jatuh_tempo) years.add(parseYear(k.tgl_jatuh_tempo))
    })
    rkapRows.forEach(r => years.add(r.tahun))
    return Array.from(years).sort((a, b) => b - a)
  }, [allKompensasi, rkapRows])

  useEffect(() => {
    if (tahunList.length && !tahunList.includes(tahun)) setTahun(tahunList[0])
  }, [tahunList])

  const allDetail = useMemo(
    () =>
      buildMonitoringDetailRows({
        allKompensasi,
        daftarKS,
        daftarAset,
        rkapByKode,
        tahun,
      }),
    [allKompensasi, daftarKS, daftarAset, rkapByKode, tahun],
  )

  const prokerOptions = useMemo(() => {
    const seen = new Map<string, string>()
    allDetail.forEach(r => {
      if (r.monikaId) seen.set(r.monikaId, `${r.monikaId} — ${r.namaProker}`)
    })
    return Array.from(seen.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'id'))
      .map(([id, label]) => ({ value: id, label, searchText: label }))
  }, [allDetail])

  const mitraOptions = useMemo(() => {
    const seen = new Map<string, string>()
    allDetail.forEach(r => {
      if (r.ksId) seen.set(r.ksId, r.namaMitra)
    })
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'id'))
      .map(([id, nama]) => ({ value: id, label: nama, searchText: nama }))
  }, [allDetail])

  const filteredDetail = useMemo(() => {
    let data = allDetail
    if (filterProker !== 'all') data = data.filter(r => r.monikaId === filterProker)
    if (filterMitra !== 'all') data = data.filter(r => r.ksId === filterMitra)
    if (filterStatus !== 'all') data = data.filter(r => r.statusBayar === filterStatus)
    if (onlyDenda) data = data.filter(r => r.nominalDenda > 0.5)
    return data
  }, [allDetail, filterProker, filterMitra, filterStatus, onlyDenda])

  /** Satu unit laporan = per mitra (kerja sama) */
  const groups = useMemo(
    () => groupMonitoringByMitra(filteredDetail),
    [filteredDetail],
  )

  useEffect(() => {
    if (expandAll) setExpanded(new Set(groups.map(g => g.key)))
  }, [groups, expandAll])

  const summary = useMemo(
    () => summarizeMonitoringRows(filteredDetail),
    [filteredDetail],
  )

  const toggleGroup = (key: string) => {
    setExpandAll(false)
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleDownloadMitra = async (g: MonitoringGroup) => {
    setExporting(g.key)
    try {
      await downloadLaporanMitraDocx({
        group: g,
        tahun,
        ks: ksById.get(g.key),
      })
    } catch (e) {
      console.error(e)
      alert('Gagal membuat laporan Word.')
    } finally {
      setExporting(null)
    }
  }

  const handleDownloadAll = async () => {
    if (groups.length === 0) return
    setExporting('all')
    try {
      await downloadLaporanSemuaMitraDocx({
        groups,
        tahun,
        ksById,
      })
    } catch (e) {
      console.error(e)
      alert('Gagal membuat laporan Word.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Monitoring Kompensasi — {tahun}</h1>
          <p className="text-xs text-gray-500 mt-1">
            Laporan historikal <strong>per mitra</strong>: identitas, track record invoice &amp; pembayaran,
            keterlambatan, dan denda — unduh format Word
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs bg-[#1B4F72] hover:bg-[#163f5c]"
            onClick={handleDownloadAll}
            disabled={groups.length === 0 || exporting !== null}
          >
            <FileText size={14} />
            {exporting === 'all' ? 'Menyusun Word...' : 'Unduh Word semua mitra'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => exportMonitoringExcel(tahun, filteredDetail, groups, 'mitra')}
            disabled={filteredDetail.length === 0}
          >
            <FileSpreadsheet size={14} />
            Export Excel
          </Button>
        </div>
      </div>

      <div className="bg-white border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
        <Filter size={14} className="text-gray-400 shrink-0" />

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Tahun JT</label>
          <select
            value={tahun}
            onChange={e => setTahun(Number(e.target.value))}
            className="text-xs border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            {tahunList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 min-w-[160px]">
          <label className="text-xs text-gray-500 whitespace-nowrap">Mitra</label>
          <SearchableSelect
            className="h-8 text-xs min-w-[160px] max-w-[240px]"
            value={filterMitra === 'all' ? '' : filterMitra}
            onValueChange={v => setFilterMitra(v || 'all')}
            options={mitraOptions}
            placeholder="Semua mitra"
            searchPlaceholder="Cari mitra..."
            allowClear
            clearLabel="Semua mitra"
          />
        </div>

        <div className="flex items-center gap-1.5 min-w-[160px]">
          <label className="text-xs text-gray-500 whitespace-nowrap">Proker</label>
          <SearchableSelect
            className="h-8 text-xs min-w-[160px] max-w-[220px]"
            value={filterProker === 'all' ? '' : filterProker}
            onValueChange={v => setFilterProker(v || 'all')}
            options={prokerOptions}
            placeholder="Semua proker"
            searchPlaceholder="Cari ID Monika..."
            allowClear
            clearLabel="Semua proker"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Status tagihan</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as StatusFilter)}
            className="text-xs border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            <option value="all">Semua</option>
            <option value="lunas">Lunas</option>
            <option value="sebagian">Sebagian</option>
            <option value="belum_bayar">Belum Bayar</option>
            <option value="terlambat">Terlambat</option>
          </select>
        </div>

        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyDenda}
            onChange={e => setOnlyDenda(e.target.checked)}
            className="rounded border-gray-300"
          />
          Hanya ada denda
        </label>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <button
            type="button"
            className="hover:text-[#1B4F72] hover:underline"
            onClick={() => { setExpandAll(true); setExpanded(new Set(groups.map(g => g.key))) }}
          >
            Buka semua
          </button>
          <span>·</span>
          <button
            type="button"
            className="hover:text-[#1B4F72] hover:underline"
            onClick={() => { setExpandAll(false); setExpanded(new Set()) }}
          >
            Tutup semua
          </button>
          <span className="text-gray-300">|</span>
          <span>{groups.length} mitra · {filteredDetail.length} tagihan</span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Tagihan" value={summary.totalTagihan} />
        <KpiCard label="Cash In" value={summary.totalCashIn} color="text-emerald-700" />
        <KpiCard label="Outstanding" value={summary.totalSisa} color="text-red-600" />
        <KpiCard label="Denda" value={summary.totalDenda} color="text-amber-700" />
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">% Tertagih</p>
          <p className="text-sm font-bold text-[#1B4F72] tabular-nums mt-0.5">
            {summary.pctTertagih.toFixed(1)}%
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{summary.nLunas}/{summary.nTagihan} lunas</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Mitra bermasalah</p>
          <p className={cn(
            'text-sm font-bold tabular-nums mt-0.5',
            groups.some(g => g.nTerlambat > 0) ? 'text-red-600' : 'text-gray-800',
          )}>
            {groups.filter(g => g.nTerlambat > 0 || g.outstanding > 0.5).length}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">ada telat / outstanding</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Satu kartu = <strong>satu mitra</strong>. Klik baris untuk melihat track record tahap;
        tombol <strong>Word</strong> mengunduh laporan formal historikal mitra tersebut.
      </p>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white px-6 py-12 text-center text-sm text-gray-400">
          Tidak ada data mitra untuk filter yang dipilih
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <MitraCard
              key={g.key}
              group={g}
              open={expanded.has(g.key)}
              onToggle={() => toggleGroup(g.key)}
              onDownloadWord={() => handleDownloadMitra(g)}
              downloading={exporting === g.key}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">{label}</p>
      <p className={cn('text-sm font-bold tabular-nums mt-0.5', color)}>
        <CurrencyDisplay value={value} size="sm" className={color} />
      </p>
    </div>
  )
}

function MitraCard({
  group,
  open,
  onToggle,
  onDownloadWord,
  downloading,
}: {
  group: MonitoringGroup
  open: boolean
  onToggle: () => void
  onDownloadWord: () => void
  downloading: boolean
}) {
  const hasIssue = group.nTerlambat > 0 || group.outstanding > 0.5

  return (
    <div className={cn(
      'rounded-xl border bg-white shadow-sm overflow-hidden',
      hasIssue ? 'border-red-100' : 'border-gray-200/80',
    )}>
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left px-4 py-3.5 flex flex-wrap items-start gap-3 hover:bg-slate-50/80 transition-colors min-w-0"
        >
          <span className="mt-0.5 text-gray-400 shrink-0">
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{group.namaMitra}</h2>
              {group.statusKs !== '-' && (
                <StatusBadge type="ks" value={group.statusKs as any} />
              )}
              {group.nTerlambat > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-100">
                  <AlertTriangle size={10} /> {group.nTerlambat} terlambat
                </span>
              )}
              {group.nLunas === group.nTagihan && group.nTagihan > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <CheckCircle2 size={10} /> Semua lunas
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {[
                group.noPerjanjian !== '-' ? group.noPerjanjian : null,
                group.monikaId,
                group.namaProker,
                group.namaAset,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-right shrink-0">
            <MiniStat label="Tagihan" value={group.totalTagihan} />
            <MiniStat label="Cash In" value={group.cashIn} className="text-emerald-700" />
            <MiniStat
              label="Sisa"
              value={group.outstanding}
              className={group.outstanding > 0 ? 'text-red-600' : 'text-gray-400'}
            />
            <MiniStat
              label="Denda"
              value={group.totalDenda}
              className={group.totalDenda > 0.5 ? 'text-amber-700' : 'text-gray-400'}
            />
          </div>

          <div className="w-full sm:w-auto flex flex-wrap gap-2 text-[10px] text-gray-500">
            <span className="bg-slate-50 border rounded-md px-2 py-0.5">{group.nTagihan} tahap</span>
            <span className="bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-md px-2 py-0.5">
              {group.nLunas} lunas
            </span>
            {group.pctTertagih != null && (
              <span className="bg-[#1B4F72]/5 border border-[#1B4F72]/15 text-[#1B4F72] rounded-md px-2 py-0.5 font-medium">
                {group.pctTertagih.toFixed(0)}% tertagih
              </span>
            )}
          </div>
        </button>

        <div className="flex items-center px-3 border-l bg-slate-50/50 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs border-[#1B4F72]/30 text-[#1B4F72] hover:bg-[#1B4F72]/5"
            onClick={e => {
              e.stopPropagation()
              onDownloadWord()
            }}
            disabled={downloading}
            title="Unduh laporan Word historikal mitra ini"
          >
            <Download size={13} />
            {downloading ? '...' : 'Word'}
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t bg-slate-50/40">
          <div className="px-4 py-2 border-b bg-white/60 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-gray-500">
              Track record tagihan &amp; pembayaran — {group.namaMitra}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-[#1B4F72]"
              onClick={onDownloadWord}
              disabled={downloading}
            >
              <FileText size={12} />
              Unduh laporan Word mitra ini
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 uppercase border-b bg-slate-50/80">
                  <th className="text-left px-3 py-2 font-semibold w-8">#</th>
                  <th className="text-left px-3 py-2 font-semibold">Periode</th>
                  <th className="text-left px-3 py-2 font-semibold">No. Invoice</th>
                  <th className="text-left px-3 py-2 font-semibold">Tgl Terbit</th>
                  <th className="text-left px-3 py-2 font-semibold">Jatuh Tempo</th>
                  <th className="text-right px-3 py-2 font-semibold">Tagihan</th>
                  <th className="text-right px-3 py-2 font-semibold">Cash In</th>
                  <th className="text-right px-3 py-2 font-semibold">Sisa</th>
                  <th className="text-left px-3 py-2 font-semibold">Tgl Bayar</th>
                  <th className="text-right px-3 py-2 font-semibold">Hari Telat</th>
                  <th className="text-right px-3 py-2 font-semibold">Denda</th>
                  <th className="text-left px-3 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {group.rows.map((r, i) => (
                  <TagihanRow key={r.id} row={r} index={i} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-slate-50 font-semibold text-xs">
                  <td colSpan={5} className="px-3 py-2 text-gray-600">
                    Subtotal {group.namaMitra}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CurrencyDisplay value={group.totalTagihan} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    <CurrencyDisplay value={group.cashIn} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-right text-red-600">
                    <CurrencyDisplay value={group.outstanding} size="sm" />
                  </td>
                  <td colSpan={2} />
                  <td className="px-3 py-2 text-right text-amber-700">
                    {group.totalDenda > 0.5
                      ? <CurrencyDisplay value={group.totalDenda} size="sm" className="text-amber-700" />
                      : '—'}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cn('text-[11px] font-semibold tabular-nums', className)}>
        <CurrencyDisplay value={value} size="sm" className={className} />
      </p>
    </div>
  )
}

function TagihanRow({ row: r, index }: { row: MonitoringDetailRow; index: number }) {
  return (
    <tr className="hover:bg-gray-50/80">
      <td className="px-3 py-2 text-gray-400">{index + 1}</td>
      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.periodeLabel}</td>
      <td className="px-3 py-2">
        {r.noInvoice ? (
          <span className="font-mono text-[11px]">{r.noInvoice}</span>
        ) : (
          <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
            Belum terbit
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
        {r.tglTerbit ? formatTanggal(r.tglTerbit) : '—'}
      </td>
      <td className="px-3 py-2 text-gray-800 font-medium whitespace-nowrap">
        {formatTanggal(r.tglJatuhTempo)}
      </td>
      <td className="px-3 py-2 text-right">
        <CurrencyDisplay value={r.totalTagihan} size="sm" />
      </td>
      <td className="px-3 py-2 text-right text-emerald-700">
        <CurrencyDisplay value={r.cashIn} size="sm" />
      </td>
      <td className="px-3 py-2 text-right">
        <CurrencyDisplay
          value={r.sisa}
          size="sm"
          className={r.sisa > 0 ? 'text-red-600' : 'text-gray-400'}
        />
      </td>
      <td className="px-3 py-2 text-gray-600 whitespace-nowrap text-[11px]">
        {r.tglBayarLabel}
        {r.nPembayaran > 1 && (
          <span className="block text-[9px] text-gray-400">{r.nPembayaran}x bayar</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {r.hariTerlambat > 0 ? (
          <span className="text-red-600 font-medium">{r.hariTerlambat}</span>
        ) : (
          <span className="text-gray-300">0</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        {r.nominalDenda > 0.5 ? (
          <CurrencyDisplay value={r.nominalDenda} size="sm" className="text-amber-700" />
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <span className={cn(
          'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
          STATUS_COLOR[r.statusBayar],
        )}>
          {MONITORING_STATUS_LABEL[r.statusBayar]}
        </span>
      </td>
    </tr>
  )
}
