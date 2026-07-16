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
  /** Default tertutup — detail tidak langsung ditampilkan */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
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

  // Tutup expand yang tidak lagi ada di daftar (filter berubah)
  useEffect(() => {
    setExpanded(prev => {
      const keys = new Set(groups.map(g => g.key))
      const next = new Set<string>()
      prev.forEach(k => { if (keys.has(k)) next.add(k) })
      return next
    })
  }, [groups])

  const summary = useMemo(
    () => summarizeMonitoringRows(filteredDetail),
    [filteredDetail],
  )

  const toggleGroup = (key: string) => {
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

        <span className="ml-auto text-xs text-gray-400">
          {groups.length} mitra · {filteredDetail.length} tagihan
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Tagihan" value={summary.totalTagihan} />
        <KpiCard label="Cash In" value={summary.totalCashIn} color="text-emerald-700" />
        <KpiCard label="Outstanding" value={summary.totalSisa} color="text-red-600" />
        <KpiCard label="Denda" value={summary.totalDenda} color="text-amber-700" />
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Daftar mitra ringkas — klik baris untuk buka detail. Unduh <strong>Word (A4)</strong> untuk laporan historikal.
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
  const pct = group.pctTertagih != null ? `${group.pctTertagih.toFixed(0)}%` : '—'

  return (
    <div className={cn(
      'rounded-xl border bg-white shadow-sm overflow-hidden',
      hasIssue ? 'border-red-100' : 'border-gray-200/80',
    )}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left flex items-center gap-2.5 min-w-0 hover:opacity-90"
        >
          <span className="text-gray-400 shrink-0">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900 truncate">{group.namaMitra}</span>
              {group.statusKs !== '-' && (
                <StatusBadge type="ks" value={group.statusKs as any} />
              )}
              {group.nTerlambat > 0 && (
                <span className="text-[10px] text-red-600 inline-flex items-center gap-0.5">
                  <AlertTriangle size={10} /> {group.nTerlambat} telat
                </span>
              )}
              {!hasIssue && group.nLunas === group.nTagihan && group.nTagihan > 0 && (
                <span className="text-[10px] text-emerald-600 inline-flex items-center gap-0.5">
                  <CheckCircle2 size={10} /> lunas
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 truncate mt-0.5">
              {[
                group.noPerjanjian !== '-' ? group.noPerjanjian : null,
                group.monikaId,
                `${group.nTagihan} tahap`,
                `${group.nLunas} lunas`,
                pct + ' tertagih',
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-right shrink-0 text-[11px]">
            <div>
              <p className="text-[9px] text-gray-400 uppercase">Sisa</p>
              <p className={cn('font-semibold tabular-nums', group.outstanding > 0 ? 'text-red-600' : 'text-gray-400')}>
                <CurrencyDisplay value={group.outstanding} size="sm" />
              </p>
            </div>
            <div>
              <p className="text-[9px] text-gray-400 uppercase">Denda</p>
              <p className={cn('font-semibold tabular-nums', group.totalDenda > 0.5 ? 'text-amber-700' : 'text-gray-400')}>
                {group.totalDenda > 0.5
                  ? <CurrencyDisplay value={group.totalDenda} size="sm" className="text-amber-700" />
                  : '—'}
              </p>
            </div>
          </div>
        </button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs shrink-0 border-[#1B4F72]/30 text-[#1B4F72]"
          onClick={onDownloadWord}
          disabled={downloading}
          title="Unduh Word A4 portrait"
        >
          <Download size={13} />
          {downloading ? '...' : 'Word'}
        </Button>
      </div>

      {open && (
        <div className="border-t">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b bg-slate-50">
                  <th className="text-left px-3 py-2 font-medium w-8">#</th>
                  <th className="text-left px-3 py-2 font-medium">Periode</th>
                  <th className="text-left px-3 py-2 font-medium">JT</th>
                  <th className="text-right px-3 py-2 font-medium">Tagihan</th>
                  <th className="text-right px-3 py-2 font-medium">Cash In</th>
                  <th className="text-right px-3 py-2 font-medium">Sisa</th>
                  <th className="text-left px-3 py-2 font-medium">Bayar</th>
                  <th className="text-right px-3 py-2 font-medium">Telat</th>
                  <th className="text-right px-3 py-2 font-medium">Denda</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {group.rows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50/80">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                      <div>{r.periodeLabel}</div>
                      {r.noInvoice && (
                        <div className="text-[10px] text-gray-400 font-mono">{r.noInvoice}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
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
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.hariTerlambat > 0
                        ? <span className="text-red-600 font-medium">{r.hariTerlambat}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.nominalDenda > 0.5
                        ? <CurrencyDisplay value={r.nominalDenda} size="sm" className="text-amber-700" />
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium',
                        STATUS_COLOR[r.statusBayar],
                      )}>
                        {MONITORING_STATUS_LABEL[r.statusBayar]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
