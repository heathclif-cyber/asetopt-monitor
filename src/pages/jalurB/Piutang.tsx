import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Banknote,
  FileText,
  Filter,
  MessageSquareWarning,
  Wallet,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { useCashInStore } from '@/store/cashInStore'
import { useAuthStore } from '@/store/authStore'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { ExportExcelPanel } from '@/components/common/ExportExcelPanel'
import { Button } from '@/components/ui/button'
import { cn, formatTanggal, formatRupiah } from '@/lib/utils'
import {
  buildPiutangRows,
  PIUTANG_AGING_LABEL,
  PIUTANG_AGING_ORDER,
  summarizePiutang,
  type PiutangAging,
  type PiutangRow,
} from '@/utils/piutangUtils'
import { exportPiutangExcel } from '@/utils/piutangExport'

type AgingFilter = 'all' | PiutangAging
type InvoiceFilter = 'all' | 'ada' | 'belum'
type TahunFilter = 'all' | number

const AGING_COLOR: Record<PiutangAging, string> = {
  invoice_belum_jt: 'bg-blue-100 text-blue-800 border-blue-200',
  '1_30': 'bg-orange-100 text-orange-800 border-orange-200',
  '31_60': 'bg-red-100 text-red-700 border-red-200',
  '61_90': 'bg-red-200 text-red-900 border-red-300',
  '90_plus': 'bg-red-700 text-white border-red-800',
}

const ALASAN_LABEL: Record<PiutangRow['alasan'], string> = {
  invoice: 'Invoice terbit',
  jatuh_tempo: 'Sudah JT',
  keduanya: 'Invoice + JT',
}

export default function Piutang() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi, isLoading, getKompensasiWithStatus } = useKompensasiStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { spAktif, fetchSPAktif } = useNotifikasiStore()
  const user = useAuthStore(s => s.user)
  const isViewer = user?.role === 'viewer'
  const isAdmin = user?.role === 'admin' || user?.role === 'staf'

  const [filterMitra, setFilterMitra] = useState('all')
  const [filterAging, setFilterAging] = useState<AgingFilter>('all')
  const [filterInvoice, setFilterInvoice] = useState<InvoiceFilter>('all')
  const [filterTahun, setFilterTahun] = useState<TahunFilter>('all')
  const [q, setQ] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchAllCashIn()
    if (!isViewer) fetchSPAktif()
  }, [location.key, isViewer])

  const allRows = useMemo(
    () => buildPiutangRows({ allKompensasi, daftarKS, spAktif: isViewer ? [] : spAktif }),
    [allKompensasi, daftarKS, spAktif, isViewer],
  )

  const tahunList = useMemo(() => {
    const years = new Set(allRows.map(r => r.tahunJT))
    return Array.from(years).sort((a, b) => b - a)
  }, [allRows])

  const mitraOptions = useMemo(() => {
    const seen = new Map<string, string>()
    allRows.forEach(r => {
      if (r.ksId) seen.set(r.ksId, r.namaMitra)
    })
    return Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1], 'id'))
      .map(([id, nama]) => ({ value: id, label: nama, searchText: nama }))
  }, [allRows])

  const rows = useMemo(() => {
    let data = allRows
    if (filterMitra !== 'all') data = data.filter(r => r.ksId === filterMitra)
    if (filterAging !== 'all') data = data.filter(r => r.aging === filterAging)
    if (filterInvoice === 'ada') data = data.filter(r => r.hasInvoice)
    if (filterInvoice === 'belum') data = data.filter(r => !r.hasInvoice)
    if (filterTahun !== 'all') data = data.filter(r => r.tahunJT === filterTahun)
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      data = data.filter(r =>
        r.namaMitra.toLowerCase().includes(s)
        || r.namaAset.toLowerCase().includes(s)
        || r.periodeLabel.toLowerCase().includes(s)
        || r.noPerjanjian.toLowerCase().includes(s)
        || (r.noInvoice ?? '').toLowerCase().includes(s)
        || (r.noInvoiceSap ?? '').toLowerCase().includes(s),
      )
    }
    return data
  }, [allRows, filterMitra, filterAging, filterInvoice, filterTahun, q])

  const summary = useMemo(() => summarizePiutang(rows), [rows])

  // Denda cash in is recorded per KS, and may settle late fees of invoices
  // already paid, so the fee balance is computed per KS over all its invoices.
  const dendaPerKS = useMemo(() => {
    const ksIds = new Set(rows.map(r => r.ksId))
    const byKs = new Map<string, { ksId: string; namaMitra: string; namaAset: string; terhitung: number; cashIn: number }>()
    for (const r of rows) {
      if (!byKs.has(r.ksId)) byKs.set(r.ksId, { ksId: r.ksId, namaMitra: r.namaMitra, namaAset: r.namaAset, terhitung: 0, cashIn: 0 })
    }
    for (const k of allKompensasi) {
      const entry = byKs.get(k.ks_id)
      if (!entry) continue
      entry.terhitung += getKompensasiWithStatus(k, k.pembayaran ?? []).dendaAkumulasi.nominalDenda
    }
    for (const c of allCashIn) {
      if (c.jenis === 'denda' && ksIds.has(c.ks_id)) byKs.get(c.ks_id)!.cashIn += Number(c.nominal)
    }
    const list = [...byKs.values()]
      .map(entry => ({ ...entry, sisa: Math.max(0, entry.terhitung - entry.cashIn) }))
      .filter(entry => entry.terhitung > 0.5 || entry.cashIn > 0)
      .sort((a, b) => b.sisa - a.sisa)
    return {
      list,
      terhitung: list.reduce((sum, entry) => sum + entry.terhitung, 0),
      cashIn: list.reduce((sum, entry) => sum + entry.cashIn, 0),
      sisa: list.reduce((sum, entry) => sum + entry.sisa, 0),
    }
  }, [rows, allKompensasi, allCashIn, getKompensasiWithStatus])
  const summaryAll = useMemo(() => summarizePiutang(allRows), [allRows])

  const clearFilters = () => {
    setFilterMitra('all')
    setFilterAging('all')
    setFilterInvoice('all')
    setFilterTahun('all')
    setQ('')
  }

  const hasActiveFilter =
    filterMitra !== 'all'
    || filterAging !== 'all'
    || filterInvoice !== 'all'
    || filterTahun !== 'all'
    || q.trim().length > 0

  const handleExport = async () => {
    if (rows.length === 0) return
    setExporting(true)
    try {
      await exportPiutangExcel(rows, { includeSP: isAdmin })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Piutang — Collection</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Tagihan dengan <strong>sisa &gt; 0</strong> yang sudah <strong>jatuh tempo</strong>.
            {' '}Tagihan ber-invoice tetapi belum jatuh tempo tetap dipantau di menu Kompensasi.
            {isAdmin && (
              <> Terintegrasi ke Input Cash In, Buat Invoice, dan Notifikasi &amp; SP.</>
            )}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline" className="text-xs h-8">
              <Link to="/jalur-b/pembayaran">
                <Banknote size={13} className="mr-1" /> Input Cash In
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="text-xs h-8">
              <Link to="/jalur-b/invoice">
                <FileText size={13} className="mr-1" /> Buat Invoice
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="text-xs h-8">
              <Link to="/jalur-b/notifikasi">
                <MessageSquareWarning size={13} className="mr-1" /> Notifikasi &amp; SP
              </Link>
            </Button>
          </div>
        )}
      </div>

      <ExportExcelPanel
        title="Ekspor daftar piutang"
        description="Unduh Excel sesuai filter aging, mitra, tahun, dan pencarian yang aktif."
        meta={`${rows.length} baris · sisa ${formatRupiah(summary.totalSisa)}`}
        fileNameHint="Piutang_YYYY-MM-DD.xlsx"
        onExport={handleExport}
        disabled={rows.length === 0}
        loading={exporting}
      />

      {/* Summary: pokok vs denda */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-orange-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-orange-700"><Wallet size={13} /> Piutang pokok</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div><p className="text-[11px] text-gray-500">Nilai pokok (DPP)</p><p className="text-base font-bold tabular-nums text-gray-900">{formatRupiah(summary.totalPokok)}</p><p className="text-[11px] text-gray-400">{summary.nTagihan} tagihan · tagihan inkl. PPN {formatRupiah(summary.totalTagihan)}</p></div>
            <div><p className="text-[11px] text-gray-500">Cash in diterima</p><p className="text-base font-bold tabular-nums text-green-700">{formatRupiah(summary.totalDibayar)}</p><p className="text-[11px] text-gray-400">pembayaran parsial</p></div>
            <div><p className="text-[11px] text-gray-500">Sisa pokok</p><p className="text-base font-bold tabular-nums text-orange-600">{formatRupiah(summary.totalSisaPokok)}</p><p className="text-[11px] text-gray-400">sisa tagihan inkl. PPN {formatRupiah(summary.totalSisa)}</p></div>
          </div>
        </div>
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-red-700"><MessageSquareWarning size={13} /> Piutang denda</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div><p className="text-[11px] text-gray-500">Denda terhitung</p><p className="text-base font-bold tabular-nums text-gray-900">{formatRupiah(dendaPerKS.terhitung)}</p><p className="text-[11px] text-gray-400">semua tagihan mitra yang tampil</p></div>
            <div><p className="text-[11px] text-gray-500">Cash in denda</p><p className="text-base font-bold tabular-nums text-green-700">{formatRupiah(dendaPerKS.cashIn)}</p><p className="text-[11px] text-gray-400">dari Input Cash In</p></div>
            <div><p className="text-[11px] text-gray-500">Sisa piutang denda</p><p className="text-base font-bold tabular-nums text-red-600">{formatRupiah(dendaPerKS.sisa)}</p><p className="text-[11px] text-gray-400">{isViewer ? 'estimasi' : `${summary.nSP} baris dengan SP aktif`}</p></div>
          </div>
        </div>
      </div>

      {/* Aging chips */}
      <div className="bg-white border rounded-xl px-4 py-3 space-y-2">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Aging (klik untuk filter)</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterAging('all')}
            className={cn(
              'px-2.5 py-1 rounded-lg border text-xs transition-colors',
              filterAging === 'all'
                ? 'bg-[#1B4F72] text-white border-[#1B4F72]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
            )}
          >
            Semua · {formatRupiah(summaryAll.totalSisa)}
          </button>
          {PIUTANG_AGING_ORDER.map(aging => {
            const bucket = summaryAll.byAging[aging]
            if (bucket.count === 0) return null
            const active = filterAging === aging
            return (
              <button
                key={aging}
                type="button"
                onClick={() => setFilterAging(active ? 'all' : aging)}
                className={cn(
                  'px-2.5 py-1 rounded-lg border text-xs transition-colors text-left',
                  active ? AGING_COLOR[aging] + ' ring-2 ring-offset-1 ring-gray-300' : AGING_COLOR[aging] + ' opacity-90 hover:opacity-100',
                )}
              >
                <span className="font-semibold">{PIUTANG_AGING_LABEL[aging]}</span>
                <span className="mx-1 opacity-70">·</span>
                <span>{bucket.count}</span>
                <span className="mx-1 opacity-70">·</span>
                <span className="font-medium">{formatRupiah(bucket.sisa)}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-gray-400 shrink-0" />

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Mitra</label>
          <SearchableSelect
            className="h-8 text-xs min-w-[180px] max-w-[240px]"
            value={filterMitra === 'all' ? '' : filterMitra}
            onValueChange={v => setFilterMitra(v || 'all')}
            options={mitraOptions}
            placeholder="Semua Mitra"
            searchPlaceholder="Cari mitra..."
            allowClear
            clearLabel="Semua Mitra"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Tahun JT</label>
          <select
            value={filterTahun === 'all' ? 'all' : String(filterTahun)}
            onChange={e => setFilterTahun(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            <option value="all">Semua tahun</option>
            {tahunList.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Invoice</label>
          <select
            value={filterInvoice}
            onChange={e => setFilterInvoice(e.target.value as InvoiceFilter)}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            <option value="all">Semua</option>
            <option value="ada">Sudah invoice</option>
            <option value="belum">Belum invoice (sudah JT)</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
          <label className="text-xs text-gray-500 whitespace-nowrap">Cari</label>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Mitra, aset, periode, no invoice…"
            className="flex-1 text-xs border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72] min-w-0"
          />
        </div>

        {hasActiveFilter && (
          <button type="button" onClick={clearFilters} className="text-[11px] text-blue-600 hover:underline">
            Reset filter
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400">{rows.length} baris</span>
      </div>

      {/* Table */}
      {isLoading && allKompensasi.length === 0 ? (
        <TableSkeleton rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Tidak ada piutang"
          description={
            hasActiveFilter
              ? 'Tidak ada tagihan yang cocok dengan filter.'
              : 'Semua tagihan yang sudah JT / ber-invoice sudah lunas, atau belum ada yang masuk kriteria piutang.'
          }
        />
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 text-[10px] uppercase text-gray-500">
                  <th rowSpan={2} className="w-6 px-3 py-2 text-left align-bottom">#</th>
                  <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Mitra / Aset</th>
                  <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Periode · JT · aging</th>
                  <th colSpan={3} className="border-b border-l border-orange-100 bg-orange-50/60 px-3 py-1.5 text-center text-orange-700">Pokok</th>
                  <th className="border-b border-l border-red-100 bg-red-50/60 px-3 py-1.5 text-center text-red-700">Denda</th>
                  <th rowSpan={2} className="sticky right-0 bg-gray-50 px-3 py-2 text-right align-bottom shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">Aksi</th>
                </tr>
                <tr className="bg-gray-50 text-[10px] uppercase text-gray-500 shadow-[0_1px_0_#e5e7eb]">
                  <th className="border-l border-orange-100 px-3 py-2 text-right">Nilai pokok</th>
                  <th className="px-3 py-2 text-right">Cash in</th>
                  <th className="px-3 py-2 text-right">Sisa pokok</th>
                  <th className="border-l border-red-100 px-3 py-2 text-right">Estimasi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.id} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{r.namaMitra}</div>
                      <div className="text-[11px] text-gray-500">{r.namaAset}</div>
                      <div className="text-[10px] text-gray-400">{r.noPerjanjian}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {r.periodeLabel}
                      <div className="text-[10px] text-gray-400 mt-0.5">{ALASAN_LABEL[r.alasan]}</div>
                      <div className="mt-1 whitespace-nowrap">JT {formatTanggal(r.tglJatuhTempo)}</div>
                      <span className={cn(
                        'mt-1 inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                        AGING_COLOR[r.aging],
                      )}>
                        {PIUTANG_AGING_LABEL[r.aging]}
                      </span>
                      <div className={cn(
                        'text-[10px] font-medium mt-0.5',
                        r.hariDariJT < 0 ? 'text-blue-600' : 'text-red-600',
                      )}>
                        {r.hariDariJT < 0
                          ? `JT dalam ${Math.abs(r.hariDariJT)} hari`
                          : r.hariDariJT === 0
                            ? 'JT hari ini · denda mulai H+1'
                            : `Terlambat ${r.hariDariJT} hari · denda berlaku`}
                      </div>
                    </td>
                    <td className="border-l border-orange-50 px-3 py-2 text-right">
                      <CurrencyDisplay value={r.nilaiPokok} size="sm" className="font-medium" />
                      <div className="whitespace-nowrap text-[10px] text-gray-400">tagihan {formatRupiah(r.efektifTagihan)}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">
                      <CurrencyDisplay value={r.totalDibayar} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CurrencyDisplay value={r.sisaPokok} size="sm" className="text-orange-600 font-semibold" />
                      <div className="whitespace-nowrap text-[10px] text-gray-400">tagihan {formatRupiah(r.sisa)}</div>
                    </td>
                    <td className="border-l border-red-50 px-3 py-2 text-right">
                      {r.nominalDenda > 0.5 ? (
                        <CurrencyDisplay value={r.nominalDenda} size="sm" className="text-red-600" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="sticky right-0 bg-white px-3 py-2 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">
                      {isAdmin ? (
                        <Link
                          to={`/jalur-b/pembayaran?kompensasi_id=${r.id}`}
                          title="Catat cash in untuk tagihan ini"
                          aria-label="Catat cash in"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-green-700 hover:bg-green-50"
                        >
                          <Banknote size={16} />
                        </Link>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                  <td colSpan={3} className="px-3 py-2.5 text-gray-700">
                    Total ({rows.length} piutang)
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <CurrencyDisplay value={summary.totalPokok} size="sm" />
                    <div className="text-[10px] font-normal text-gray-400">tagihan {formatRupiah(summary.totalTagihan)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-green-700">
                    <CurrencyDisplay value={summary.totalDibayar} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-orange-600">
                    <CurrencyDisplay value={summary.totalSisaPokok} size="sm" />
                    <div className="text-[10px] font-normal text-gray-400">tagihan {formatRupiah(summary.totalSisa)}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-red-600">
                    <CurrencyDisplay value={summary.totalDenda} size="sm" />
                  </td>
                  <td className="sticky right-0 bg-gray-50" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {dendaPerKS.list.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold text-gray-800">Piutang denda per mitra</p>
            <p className="text-xs text-gray-500">Cash in denda dicatat per kerja sama, jadi sisanya dihitung dari seluruh denda tagihan mitra, termasuk tagihan yang sudah lunas tetapi dibayar terlambat.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead><tr className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <th className="px-3 py-2 text-left">Mitra / Aset</th>
                <th className="px-3 py-2 text-right">Denda terhitung</th>
                <th className="px-3 py-2 text-right">Cash in denda</th>
                <th className="px-3 py-2 text-right">Sisa denda</th>
              </tr></thead>
              <tbody className="divide-y">
                {dendaPerKS.list.map(entry => (
                  <tr key={entry.ksId} className="hover:bg-gray-50">
                    <td className="px-3 py-2"><div className="font-medium text-gray-900">{entry.namaMitra}</div><div className="text-[11px] text-gray-500">{entry.namaAset}</div></td>
                    <td className="px-3 py-2 text-right"><CurrencyDisplay value={entry.terhitung} size="sm" /></td>
                    <td className="px-3 py-2 text-right text-green-700"><CurrencyDisplay value={entry.cashIn} size="sm" /></td>
                    <td className="px-3 py-2 text-right"><CurrencyDisplay value={entry.sisa} size="sm" className="font-semibold text-red-600" /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 bg-gray-50 font-semibold">
                <td className="px-3 py-2.5 text-gray-700">Total</td>
                <td className="px-3 py-2.5 text-right"><CurrencyDisplay value={dendaPerKS.terhitung} size="sm" /></td>
                <td className="px-3 py-2.5 text-right text-green-700"><CurrencyDisplay value={dendaPerKS.cashIn} size="sm" /></td>
                <td className="px-3 py-2.5 text-right text-red-600"><CurrencyDisplay value={dendaPerKS.sisa} size="sm" /></td>
              </tr></tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Definisi: nilai pokok = nominal kompensasi (DPP) tanpa PPN/PPh. Sisa tagihan = (total tagihan − pengurang) − cash in pembayaran; sisa pokok = bagian pokok dari sisa tagihan (proporsional). Sisa denda = denda terhitung − cash in denda per kerja sama. Masuk daftar jika sisa &gt; 0 dan
        (ada nomor/tanggal invoice ATAU tgl jatuh tempo ≤ hari ini). Aging &amp; denda dihitung dari
        tgl JT — denda mulai H+1 setelah jatuh tempo (tanpa grace).
      </p>
    </div>
  )
}
