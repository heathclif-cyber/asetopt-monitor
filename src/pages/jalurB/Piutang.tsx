import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  AlertTriangle,
  Banknote,
  FileText,
  Filter,
  MessageSquareWarning,
  Receipt,
  Wallet,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
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

type AgingFilter = 'all' | PiutangAging
type InvoiceFilter = 'all' | 'ada' | 'belum'
type TahunFilter = 'all' | number

const AGING_COLOR: Record<PiutangAging, string> = {
  invoice_belum_jt: 'bg-blue-100 text-blue-800 border-blue-200',
  dalam_grace: 'bg-amber-100 text-amber-800 border-amber-200',
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
  const { allKompensasi, fetchAllKompensasi, isLoading } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { spAktif, fetchSPAktif } = useNotifikasiStore()

  const [filterMitra, setFilterMitra] = useState('all')
  const [filterAging, setFilterAging] = useState<AgingFilter>('all')
  const [filterInvoice, setFilterInvoice] = useState<InvoiceFilter>('all')
  const [filterTahun, setFilterTahun] = useState<TahunFilter>('all')
  const [q, setQ] = useState('')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchSPAktif()
  }, [location.key])

  const allRows = useMemo(
    () => buildPiutangRows({ allKompensasi, daftarKS, spAktif }),
    [allKompensasi, daftarKS, spAktif],
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Piutang — Collection</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Tagihan dengan <strong>sisa &gt; 0</strong> yang sudah <strong>diterbitkan invoice</strong>
            {' '}atau <strong>jatuh tempo</strong> (waktunya kompensasi). Terintegrasi ke Input Cash In,
            Buat Invoice, dan Notifikasi &amp; SP.
          </p>
        </div>
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
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-orange-200 px-4 py-3">
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Wallet size={12} className="text-orange-500" /> Total Piutang
          </p>
          <p className="text-lg font-bold text-orange-600 mt-0.5">{formatRupiah(summary.totalSisa)}</p>
          <p className="text-[11px] text-gray-400">{summary.nTagihan} tagihan</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-xs text-gray-500">Sudah ditagih (efektif)</p>
          <p className="text-lg font-bold text-gray-800 mt-0.5">{formatRupiah(summary.totalTagihan)}</p>
          <p className="text-[11px] text-gray-400">Cash in parsial: {formatRupiah(summary.totalDibayar)}</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-xs text-gray-500">Invoice</p>
          <p className="text-lg font-bold text-[#1B4F72] mt-0.5">{summary.nInvoice}</p>
          <p className="text-[11px] text-gray-400">{summary.nTanpaInvoice} belum invoice (sudah JT)</p>
        </div>
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-xs text-gray-500">Est. denda + SP aktif</p>
          <p className="text-lg font-bold text-red-600 mt-0.5">{formatRupiah(summary.totalDenda)}</p>
          <p className="text-[11px] text-gray-400">{summary.nSP} baris dengan SP KS</p>
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
                <tr className="bg-gray-50 text-gray-500 uppercase shadow-[0_1px_0_#e5e7eb]">
                  <th className="text-left px-3 py-2.5 w-6">#</th>
                  <th className="text-left px-3 py-2.5">Mitra / Aset</th>
                  <th className="text-left px-3 py-2.5">Periode</th>
                  <th className="text-left px-3 py-2.5">JT</th>
                  <th className="text-left px-3 py-2.5">Aging</th>
                  <th className="text-left px-3 py-2.5">Invoice</th>
                  <th className="text-right px-3 py-2.5">Tagihan</th>
                  <th className="text-right px-3 py-2.5">Dibayar</th>
                  <th className="text-right px-3 py-2.5">Sisa</th>
                  <th className="text-right px-3 py-2.5">Denda</th>
                  <th className="text-left px-3 py-2.5">SP / KS</th>
                  <th className="text-right px-3 py-2.5">Aksi</th>
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
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div>{formatTanggal(r.tglJatuhTempo)}</div>
                      <div className={cn(
                        'text-[10px] font-medium mt-0.5',
                        r.hariDariJT < 0 ? 'text-blue-600' : r.dalamGrace ? 'text-amber-600' : 'text-red-600',
                      )}>
                        {r.hariDariJT < 0
                          ? `JT dalam ${Math.abs(r.hariDariJT)} hari`
                          : r.dalamGrace
                            ? `Hari ke-${r.hariDariJT} (grace ${r.maksHariBayar}h)`
                            : `+${r.hariLewatGrace} hari lewat grace`}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={cn(
                        'inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border',
                        AGING_COLOR[r.aging],
                      )}>
                        {PIUTANG_AGING_LABEL[r.aging]}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {r.hasInvoice ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-green-700">
                            <Receipt size={11} /> Ada
                          </span>
                          {(r.noInvoice || r.noInvoiceSap) && (
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5">
                              {r.noInvoiceSap || r.noInvoice}
                            </div>
                          )}
                          {r.invoiceTgl && (
                            <div className="text-[10px] text-gray-400">{formatTanggal(r.invoiceTgl)}</div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <AlertTriangle size={11} /> Belum
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CurrencyDisplay value={r.efektifTagihan} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">
                      <CurrencyDisplay value={r.totalDibayar} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <CurrencyDisplay value={r.sisa} size="sm" className="text-orange-600 font-semibold" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.nominalDenda > 0.5 ? (
                        <CurrencyDisplay value={r.nominalDenda} size="sm" className="text-red-600" />
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.spJenis ? (
                        <span className={cn(
                          'inline-block px-2 py-0.5 rounded-full text-[10px] font-bold',
                          r.spJenis === 'PUTUS' && 'bg-red-700 text-white',
                          r.spJenis === 'SP3' && 'bg-red-100 text-red-800',
                          r.spJenis === 'SP2' && 'bg-orange-100 text-orange-800',
                          r.spJenis === 'SP1' && 'bg-yellow-100 text-yellow-800',
                        )}>
                          {r.spJenis}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 uppercase">{r.statusKs}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-end gap-1">
                        <Link
                          to={`/jalur-b/pembayaran?kompensasi_id=${r.id}`}
                          className="text-[11px] font-medium text-green-700 hover:underline whitespace-nowrap"
                        >
                          Catat bayar
                        </Link>
                        {!r.hasInvoice && (
                          <Link
                            to={`/jalur-b/invoice?kompensasi_id=${r.id}`}
                            className="text-[11px] font-medium text-[#1B4F72] hover:underline whitespace-nowrap"
                          >
                            Buat invoice
                          </Link>
                        )}
                        {(r.aging === '1_30' || r.aging === '31_60' || r.aging === '61_90' || r.aging === '90_plus' || r.spJenis) && (
                          <Link
                            to="/jalur-b/notifikasi"
                            className="text-[11px] font-medium text-orange-700 hover:underline whitespace-nowrap"
                          >
                            Cek SP
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                  <td colSpan={6} className="px-3 py-2.5 text-gray-700">
                    Total ({rows.length} piutang)
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <CurrencyDisplay value={summary.totalTagihan} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-green-700">
                    <CurrencyDisplay value={summary.totalDibayar} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-orange-600">
                    <CurrencyDisplay value={summary.totalSisa} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-red-600">
                    <CurrencyDisplay value={summary.totalDenda} size="sm" />
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-400">
        Definisi: sisa = (total tagihan − pengurang) − pembayaran. Masuk daftar jika sisa &gt; 0 dan
        (ada nomor/tanggal invoice ATAU tgl jatuh tempo ≤ hari ini). Aging dihitung setelah masa
        bayar (grace = maks hari bayar).
      </p>
    </div>
  )
}
