import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Filter,
  LayoutList,
  Table2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
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
  aggregateMonitoringByProker,
  buildMonitoringDetailRows,
  exportMonitoringExcel,
  MONITORING_STATUS_LABEL,
  summarizeMonitoringRows,
  type MonitoringDetailRow,
  type MonitoringStatusBayar,
} from '@/utils/monitoringKompensasiUtils'

type ViewMode = 'detail' | 'proker'
type StatusFilter = 'all' | MonitoringStatusBayar
type SortKey =
  | 'tglJatuhTempo'
  | 'monikaId'
  | 'namaMitra'
  | 'totalTagihan'
  | 'cashIn'
  | 'sisa'
  | 'nominalDenda'
  | 'statusBayar'
type SortDir = 'asc' | 'desc'

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

  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [filterProker, setFilterProker] = useState('all')
  const [filterMitra, setFilterMitra] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [onlyDenda, setOnlyDenda] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('tglJatuhTempo')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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
    if (filterProker !== 'all') {
      data = data.filter(r => r.monikaId === filterProker)
    }
    if (filterMitra !== 'all') {
      data = data.filter(r => r.ksId === filterMitra)
    }
    if (filterStatus !== 'all') {
      data = data.filter(r => r.statusBayar === filterStatus)
    }
    if (onlyDenda) {
      data = data.filter(r => r.nominalDenda > 0.5)
    }

    const dir = sortDir === 'asc' ? 1 : -1
    data = [...data].sort((a, b) => {
      const cmpStr = (x: string, y: string) => x.localeCompare(y, 'id') * dir
      const cmpNum = (x: number, y: number) => (x - y) * dir
      if (sortKey === 'tglJatuhTempo') return cmpStr(a.tglJatuhTempo, b.tglJatuhTempo)
      if (sortKey === 'monikaId') return cmpStr(a.monikaId ?? 'zzz', b.monikaId ?? 'zzz')
      if (sortKey === 'namaMitra') return cmpStr(a.namaMitra, b.namaMitra)
      if (sortKey === 'totalTagihan') return cmpNum(a.totalTagihan, b.totalTagihan)
      if (sortKey === 'cashIn') return cmpNum(a.cashIn, b.cashIn)
      if (sortKey === 'sisa') return cmpNum(a.sisa, b.sisa)
      if (sortKey === 'nominalDenda') return cmpNum(a.nominalDenda, b.nominalDenda)
      if (sortKey === 'statusBayar') {
        return cmpStr(
          MONITORING_STATUS_LABEL[a.statusBayar],
          MONITORING_STATUS_LABEL[b.statusBayar],
        )
      }
      return 0
    })
    return data
  }, [allDetail, filterProker, filterMitra, filterStatus, onlyDenda, sortKey, sortDir])

  const prokerRows = useMemo(
    () => aggregateMonitoringByProker(filteredDetail),
    [filteredDetail],
  )

  const summary = useMemo(
    () => summarizeMonitoringRows(filteredDetail),
    [filteredDetail],
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'namaMitra' || key === 'monikaId' || key === 'tglJatuhTempo' ? 'asc' : 'desc')
    }
  }

  const handleExport = () => {
    exportMonitoringExcel(tahun, filteredDetail, prokerRows)
  }

  const drillToProker = (monikaId: string) => {
    if (monikaId === '—') {
      setFilterProker('all')
    } else {
      setFilterProker(monikaId)
    }
    setViewMode('detail')
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Monitoring Kompensasi — {tahun}</h1>
          <p className="text-xs text-gray-500 mt-1">
            Track tagihan terbit, jatuh tempo, pembayaran, dan denda per kerja sama / proker (ID Monika)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('detail')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                viewMode === 'detail' ? 'bg-[#1B4F72] text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <LayoutList size={14} />
              Detail Tagihan
            </button>
            <button
              type="button"
              onClick={() => setViewMode('proker')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                viewMode === 'proker' ? 'bg-[#1B4F72] text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              <Table2 size={14} />
              Per Proker
            </button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleExport}
            disabled={filteredDetail.length === 0}
          >
            <FileSpreadsheet size={14} />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Filters */}
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

        <div className="flex items-center gap-1.5 min-w-[180px]">
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

        <div className="flex items-center gap-1.5 min-w-[160px]">
          <label className="text-xs text-gray-500 whitespace-nowrap">Mitra</label>
          <SearchableSelect
            className="h-8 text-xs min-w-[160px] max-w-[220px]"
            value={filterMitra === 'all' ? '' : filterMitra}
            onValueChange={v => setFilterMitra(v || 'all')}
            options={mitraOptions}
            placeholder="Semua mitra"
            searchPlaceholder="Cari mitra..."
            allowClear
            clearLabel="Semua mitra"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Status</label>
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
          {viewMode === 'detail'
            ? `${filteredDetail.length} tagihan`
            : `${prokerRows.length} proker`}
        </span>
      </div>

      {/* KPI */}
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
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Terlambat</p>
          <p className={cn(
            'text-sm font-bold tabular-nums mt-0.5',
            summary.nTerlambat > 0 ? 'text-red-600' : 'text-gray-800',
          )}>
            {summary.nTerlambat}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">tagihan outstanding</p>
        </div>
      </div>

      <p className="text-[11px] text-gray-500 -mt-1">
        Tahun filter = <strong>tahun jatuh tempo</strong>.
        Denda: outstanding dihitung s.d. hari ini; lunas dihitung s.d. tanggal pelunasan (historis).
        Proker = ID Monika (<code className="text-[10px]">rkap_kode</code> / kode aset).
      </p>

      {/* Tables */}
      {viewMode === 'detail' ? (
        <DetailTable
          rows={filteredDetail}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      ) : (
        <ProkerTable rows={prokerRows} onDrill={drillToProker} />
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

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = 'left',
}: {
  label: string
  col: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <th
      className={cn(
        'px-2.5 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
        active ? 'text-[#1B4F72]' : 'text-gray-500',
      )}
      onClick={() => onSort(col)}
    >
      {label}
      {active && <span className="ml-0.5 text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  )
}

function DetailTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: MonitoringDetailRow[]
  sortKey: SortKey
  sortDir: SortDir
  onSort: (k: SortKey) => void
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-gray-500 uppercase shadow-[0_1px_0_#e5e7eb]">
              <th className="text-left px-2.5 py-2.5 w-8">#</th>
              <SortTh label="Proker" col="monikaId" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Mitra" col="namaMitra" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2.5 py-2.5">Periode</th>
              <th className="text-left px-2.5 py-2.5">No. Invoice</th>
              <th className="text-left px-2.5 py-2.5">Tgl Terbit</th>
              <SortTh label="Jatuh Tempo" col="tglJatuhTempo" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <SortTh label="Tagihan" col="totalTagihan" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortTh label="Cash In" col="cashIn" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortTh label="Sisa" col="sisa" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <th className="text-left px-2.5 py-2.5">Tgl Bayar</th>
              <th className="text-right px-2.5 py-2.5">Hari Telat</th>
              <SortTh label="Denda" col="nominalDenda" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
              <SortTh label="Status" col="statusBayar" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <th className="text-left px-2.5 py-2.5">KS</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-10 text-center text-gray-400">
                  Tidak ada data untuk filter yang dipilih
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.id} className="hover:bg-gray-50/80">
                <td className="px-2.5 py-2 text-gray-400">{i + 1}</td>
                <td className="px-2.5 py-2">
                  <div className="font-mono text-[11px] text-[#1B4F72]">{r.monikaId ?? '—'}</div>
                  <div className="text-[10px] text-gray-500 truncate max-w-[140px]" title={r.namaProker}>
                    {r.namaProker}
                  </div>
                </td>
                <td className="px-2.5 py-2">
                  <div className="font-medium text-gray-800">{r.namaMitra}</div>
                  <div className="text-[10px] text-gray-400 truncate max-w-[120px]">{r.noPerjanjian}</div>
                </td>
                <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">{r.periodeLabel}</td>
                <td className="px-2.5 py-2">
                  {r.noInvoice ? (
                    <span className="font-mono text-[11px]">{r.noInvoice}</span>
                  ) : (
                    <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                      Belum terbit
                    </span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap">
                  {r.tglTerbit ? (
                    <>
                      {formatTanggal(r.tglTerbit)}
                      {r.tglTerbitSource === 'created' && (
                        <span className="block text-[9px] text-gray-400">dari created</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-2.5 py-2 text-gray-700 whitespace-nowrap font-medium">
                  {formatTanggal(r.tglJatuhTempo)}
                </td>
                <td className="px-2.5 py-2 text-right">
                  <CurrencyDisplay value={r.totalTagihan} size="sm" />
                </td>
                <td className="px-2.5 py-2 text-right text-emerald-700">
                  <CurrencyDisplay value={r.cashIn} size="sm" />
                </td>
                <td className="px-2.5 py-2 text-right">
                  <CurrencyDisplay
                    value={r.sisa}
                    size="sm"
                    className={r.sisa > 0 ? 'text-red-600' : 'text-gray-400'}
                  />
                </td>
                <td className="px-2.5 py-2 text-gray-600 whitespace-nowrap text-[11px]">
                  {r.tglBayarLabel}
                  {r.nPembayaran > 1 && (
                    <span className="block text-[9px] text-gray-400">{r.nPembayaran}x bayar</span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">
                  {r.hariTerlambat > 0 ? (
                    <span className="text-red-600 font-medium">{r.hariTerlambat}</span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="px-2.5 py-2 text-right">
                  {r.nominalDenda > 0.5 ? (
                    <span className="text-amber-700 font-medium">
                      <CurrencyDisplay value={r.nominalDenda} size="sm" className="text-amber-700" />
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-2.5 py-2">
                  <span className={cn(
                    'inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap',
                    STATUS_COLOR[r.statusBayar],
                  )}>
                    {MONITORING_STATUS_LABEL[r.statusBayar]}
                  </span>
                </td>
                <td className="px-2.5 py-2">
                  <StatusBadge type="ks" value={r.statusKs as any} />
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan={7} className="px-2.5 py-2.5 text-gray-700">
                  Total ({rows.length} tagihan)
                </td>
                <td className="px-2.5 py-2.5 text-right">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.totalTagihan, 0)} size="sm" />
                </td>
                <td className="px-2.5 py-2.5 text-right text-emerald-700">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.cashIn, 0)} size="sm" />
                </td>
                <td className="px-2.5 py-2.5 text-right text-red-600">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.sisa, 0)} size="sm" />
                </td>
                <td colSpan={2} />
                <td className="px-2.5 py-2.5 text-right text-amber-700">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.nominalDenda, 0)} size="sm" />
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function ProkerTable({
  rows,
  onDrill,
}: {
  rows: ReturnType<typeof aggregateMonitoringByProker>
  onDrill: (monikaId: string) => void
}) {
  return (
    <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
      <div className="overflow-auto max-h-[70vh]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 text-gray-500 uppercase shadow-[0_1px_0_#e5e7eb]">
              <th className="text-left px-3 py-2.5">#</th>
              <th className="text-left px-3 py-2.5">ID Monika</th>
              <th className="text-left px-3 py-2.5">Proker / Aset</th>
              <th className="text-left px-3 py-2.5">Mitra</th>
              <th className="text-right px-3 py-2.5">Tagihan</th>
              <th className="text-right px-3 py-2.5">Lunas</th>
              <th className="text-right px-3 py-2.5">Terlambat</th>
              <th className="text-right px-3 py-2.5">Total Tagihan</th>
              <th className="text-right px-3 py-2.5">Cash In</th>
              <th className="text-right px-3 py-2.5">Outstanding</th>
              <th className="text-right px-3 py-2.5">Denda</th>
              <th className="text-right px-3 py-2.5">% Tertagih</th>
              <th className="text-left px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-gray-400">
                  Tidak ada data proker untuk filter yang dipilih
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.monikaId + r.namaProker} className="hover:bg-gray-50/80">
                <td className="px-3 py-2.5 text-gray-400">{i + 1}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-[#1B4F72]">{r.monikaId}</td>
                <td className="px-3 py-2.5 font-medium text-gray-800">{r.namaProker}</td>
                <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                  <span className="line-clamp-2" title={r.mitraList.join(', ')}>
                    {r.mitraList.length ? r.mitraList.join(', ') : '—'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.nTagihan}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className="inline-flex items-center gap-0.5 text-emerald-700">
                    <CheckCircle2 size={11} /> {r.nLunas}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.nTerlambat > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-red-600 font-medium">
                      <AlertTriangle size={11} /> {r.nTerlambat}
                    </span>
                  ) : (
                    <span className="text-gray-300">0</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <CurrencyDisplay value={r.totalTagihan} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-700">
                  <CurrencyDisplay value={r.cashIn} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-red-600">
                  <CurrencyDisplay value={r.outstanding} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-amber-700">
                  {r.totalDenda > 0.5
                    ? <CurrencyDisplay value={r.totalDenda} size="sm" className="text-amber-700" />
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[#1B4F72]">
                  {r.pctTertagih != null ? `${r.pctTertagih.toFixed(1)}%` : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onDrill(r.monikaId)}
                    className="text-[11px] text-[#1B4F72] hover:underline whitespace-nowrap"
                  >
                    Lihat detail
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan={4} className="px-3 py-2.5 text-gray-700">
                  Total ({rows.length} proker)
                </td>
                <td className="px-3 py-2.5 text-right">
                  {rows.reduce((s, r) => s + r.nTagihan, 0)}
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-700">
                  {rows.reduce((s, r) => s + r.nLunas, 0)}
                </td>
                <td className="px-3 py-2.5 text-right text-red-600">
                  {rows.reduce((s, r) => s + r.nTerlambat, 0)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.totalTagihan, 0)} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-emerald-700">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.cashIn, 0)} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-red-600">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.outstanding, 0)} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-right text-amber-700">
                  <CurrencyDisplay value={rows.reduce((s, r) => s + r.totalDenda, 0)} size="sm" />
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
