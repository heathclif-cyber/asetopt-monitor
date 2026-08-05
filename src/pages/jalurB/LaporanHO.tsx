import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Banknote,
  FileSpreadsheet,
  Filter,
  Landmark,
  Wallet,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { useCashInStore } from '@/store/cashInStore'
import { usePBBStore } from '@/store/pbbStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { ExportExcelPanel } from '@/components/common/ExportExcelPanel'
import { cn, formatTanggal } from '@/lib/utils'
import {
  BULAN_LABELS_HO,
  buildLaporanHO,
  summarizeHO,
  type HOMasterRow,
} from '@/utils/laporanHOUtils'
import { exportLaporanHOExcel } from '@/utils/laporanHOExport'

type TabMode = 'cash' | 'pendapatan' | 'piutang'

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function monthsYtd(asOf = new Date()): number[] {
  return Array.from({ length: asOf.getMonth() + 1 }, (_, i) => i)
}

function pctLabel(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

export default function LaporanHO() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi, isLoading: loadKomp } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()
  const { allPBB, fetchAllPBB } = usePBBStore()

  const [tab, setTab] = useState<TabMode>('cash')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => monthsYtd())
  const [exporting, setExporting] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
    fetchAllCashIn()
    fetchAllPBB()
  }, [location.key])

  useEffect(() => {
    fetchRKAP(tahun)
  }, [tahun, location.key])

  const tahunList = useMemo(() => {
    const years = new Set<number>()
    years.add(new Date().getFullYear())
    rkapRows.forEach(r => years.add(r.tahun))
    allKompensasi.forEach(k => {
      if (k.tgl_jatuh_tempo) years.add(Number(k.tgl_jatuh_tempo.slice(0, 4)))
      ;(k.pembayaran ?? []).forEach(p => {
        if (p.tgl_bayar) years.add(Number(p.tgl_bayar.slice(0, 4)))
      })
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [allKompensasi, rkapRows])

  useEffect(() => {
    if (tahunList.length && !tahunList.includes(tahun)) setTahun(tahunList[0])
  }, [tahunList])

  const months = useMemo(
    () => (selectedMonths.length ? [...selectedMonths].sort((a, b) => a - b) : ALL_MONTHS),
    [selectedMonths],
  )

  const rows = useMemo(
    () =>
      buildLaporanHO({
        tahun,
        rkapRows,
        daftarAset,
        daftarKS,
        allKompensasi,
        allCashIn,
        allPBB,
        daftarPDDM,
        allPengakuan,
        months,
      }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan, months],
  )

  const filtered = useMemo(() => {
    if (!q.trim()) return rows
    const s = q.trim().toLowerCase()
    return rows.filter(r =>
      r.obyek.toLowerCase().includes(s)
      || r.kodeMonika.toLowerCase().includes(s)
      || r.mitra.toLowerCase().includes(s)
      || r.bidangUsaha.toLowerCase().includes(s)
      || r.lokasi.toLowerCase().includes(s),
    )
  }, [rows, q])

  const summary = useMemo(() => summarizeHO(filtered, months), [filtered, months])
  const loading = loadKomp && rows.length === 0

  const toggleMonth = (m: number) => {
    setSelectedMonths(prev => {
      if (prev.includes(m)) {
        if (prev.length === 1) return prev
        return prev.filter(x => x !== m)
      }
      return [...prev, m].sort((a, b) => a - b)
    })
  }

  const setYtd = () => setSelectedMonths(monthsYtd())
  const setFullYear = () => setSelectedMonths([...ALL_MONTHS])

  const handleExport = async () => {
    if (filtered.length === 0) return
    setExporting(true)
    try {
      await exportLaporanHOExcel(filtered, { tahun, months })
    } finally {
      setExporting(false)
    }
  }

  const bulanLabel = months.map(m => BULAN_LABELS_HO[m]).join(', ')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Laporan Format HO</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Monitoring <strong>Cash In</strong>, <strong>Pendapatan</strong>, dan <strong>Piutang</strong> per proker
            (ID Monika) mengikuti struktur file Proker Optimalisasi Aset HO — pilih bulan yang dilapor.
          </p>
        </div>
      </div>

      <ExportExcelPanel
        title="Ekspor Excel Format HO"
        description="3 sheet: Cash · Pendapatan · Piutang. Satuan di Excel: Rp 000 (÷1000)."
        meta={`${filtered.length} proker · ${bulanLabel}`}
        fileNameHint={`Laporan_HO_Proker_${tahun}_….xlsx`}
        onExport={handleExport}
        loading={exporting}
        disabled={filtered.length === 0}
      />

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <Filter size={14} />
            Filter
          </div>
          <label className="text-xs text-gray-500 flex items-center gap-1.5">
            Tahun
            <select
              className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium"
              value={tahun}
              onChange={e => setTahun(Number(e.target.value))}
            >
              {tahunList.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <input
            type="search"
            placeholder="Cari proker / Monika / mitra…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 min-w-[200px] flex-1 rounded-md border border-gray-200 px-2.5 text-xs"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={setYtd}
              className="h-8 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              YTD
            </button>
            <button
              type="button"
              onClick={setFullYear}
              className="h-8 rounded-md border border-gray-200 px-2.5 text-[11px] font-medium text-gray-600 hover:bg-gray-50"
            >
              12 bulan
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ALL_MONTHS.map(m => {
            const on = selectedMonths.includes(m)
            return (
              <button
                key={m}
                type="button"
                onClick={() => toggleMonth(m)}
                className={cn(
                  'h-7 rounded-full px-2.5 text-[11px] font-medium border transition-colors',
                  on
                    ? 'bg-[#1B4F72] text-white border-[#1B4F72]'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300',
                )}
              >
                {BULAN_LABELS_HO[m].slice(0, 3)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Wallet size={16} />}
          label="Realisasi Cash In"
          sub={`Target ${formatShort(summary.targetCash)}`}
          value={summary.realisasiCash}
          accent="teal"
        />
        <SummaryCard
          icon={<Banknote size={16} />}
          label="Realisasi Pendapatan"
          sub={`Target ${formatShort(summary.targetPendapatan)}`}
          value={summary.realisasiPendapatan}
          accent="navy"
        />
        <SummaryCard
          icon={<Landmark size={16} />}
          label="Saldo Piutang"
          sub={`Snapshot ${BULAN_LABELS_HO[months[months.length - 1] ?? 0]}`}
          value={summary.saldoPiutang}
          accent="amber"
        />
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] text-gray-500 font-medium">Proker · Capaian Cash</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{summary.nProker}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {summary.targetCash > 0
              ? `${((summary.realisasiCash / summary.targetCash) * 100).toFixed(1)}% vs target bulan terpilih`
              : '—'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {([
          { id: 'cash' as const, label: 'Cash In', icon: <Wallet size={13} /> },
          { id: 'pendapatan' as const, label: 'Pendapatan', icon: <Banknote size={13} /> },
          { id: 'piutang' as const, label: 'Piutang', icon: <Landmark size={13} /> },
        ]).map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id
                ? 'bg-white text-[#1B4F72] shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Belum ada data proker"
          description="Pastikan RKAP tahun ini sudah diisi dan ID Monika terhubung ke tagihan/pembayaran."
        />
      ) : tab === 'cash' ? (
        <CashTable rows={filtered} months={months} />
      ) : tab === 'pendapatan' ? (
        <PendapatanTable rows={filtered} months={months} />
      ) : (
        <PiutangTable rows={filtered} months={months} />
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5 pb-4">
        <FileSpreadsheet size={12} className="mt-0.5 shrink-0" />
        <span>
          Excel HO memakai satuan <strong>Rp 000</strong>. Kolom Skema KS dan Jaminan belum di master AsetOpt
          (kosong / 0). PPN·PPH dialokasi proporsional dari invoice. Piutang = snapshot outstanding akhir bulan.
        </span>
      </p>
    </div>
  )
}

function formatShort(n: number): string {
  if (Math.abs(n) >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} M`
  if (Math.abs(n) >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)} jt`
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`
}

function SummaryCard({
  icon,
  label,
  sub,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  value: number
  accent: 'teal' | 'navy' | 'amber'
}) {
  const colors = {
    teal: 'text-teal-700 bg-teal-50 border-teal-100',
    navy: 'text-[#1B4F72] bg-blue-50 border-blue-100',
    amber: 'text-amber-800 bg-amber-50 border-amber-100',
  }
  return (
    <div className={cn('rounded-xl border p-3 shadow-sm', colors[accent])}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1">
        <CurrencyDisplay value={value} size="md" />
      </div>
      <p className="text-[11px] opacity-70 mt-0.5">{sub}</p>
    </div>
  )
}

function StickyMasterHead() {
  return (
    <>
      <th className="sticky left-0 z-20 bg-[#1B4F72] px-2 py-2 text-left min-w-[36px]">No</th>
      <th className="sticky left-9 z-20 bg-[#1B4F72] px-2 py-2 text-left min-w-[180px]">Obyek Kerjasama</th>
      <th className="px-2 py-2 text-left min-w-[110px]">Kode MONIKA</th>
      <th className="px-2 py-2 text-left min-w-[120px]">Mitra</th>
      <th className="px-2 py-2 text-left min-w-[100px]">Bidang Usaha</th>
    </>
  )
}

function StickyMasterCells({ r, zebra }: { r: HOMasterRow; zebra: boolean }) {
  const bg = zebra ? 'bg-slate-50' : 'bg-white'
  return (
    <>
      <td className={cn('sticky left-0 z-10 px-2 py-1.5 text-gray-500', bg)}>{r.no}</td>
      <td className={cn('sticky left-9 z-10 px-2 py-1.5 font-medium text-gray-800', bg)}>
        <div className="max-w-[200px] truncate" title={r.obyek}>{r.obyek}</div>
        {r.isOrphan && (
          <span className="text-[10px] text-amber-600 font-normal">Non-RKAP</span>
        )}
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-600">{r.kodeMonika}</td>
      <td className="px-2 py-1.5 text-gray-600 max-w-[140px] truncate" title={r.mitra}>{r.mitra || '—'}</td>
      <td className="px-2 py-1.5 text-gray-500 text-[11px]">{r.bidangUsaha}</td>
    </>
  )
}

function CashTable({ rows, months }: { rows: HOMasterRow[]; months: number[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[min(70vh,720px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <StickyMasterHead />
              {months.map(m => (
                <th
                  key={m}
                  colSpan={6}
                  className="px-2 py-2 text-center border-l border-white/20 font-semibold"
                >
                  {BULAN_LABELS_HO[m]}
                </th>
              ))}
            </tr>
            <tr className="bg-[#163f5c] text-white/90">
              <th className="sticky left-0 z-20 bg-[#163f5c]" />
              <th className="sticky left-9 z-20 bg-[#163f5c]" />
              <th /><th /><th />
              {months.map(m => (
                <FragmentMonthCashHeaders key={m} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <StickyMasterCells r={r} zebra={zebra} />
                  {months.map(m => {
                    const c = r.cashByMonth[m]
                    return (
                      <Fragment key={`${r.kodeMonika}-c-${m}`}>
                        <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                          <CurrencyDisplay value={c.target} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-teal-700 font-medium">
                          <CurrencyDisplay value={c.kompensasi} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-red-600">
                          {c.denda > 0 ? <CurrencyDisplay value={c.denda} size="sm" /> : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-600">
                          {c.ppn > 0 ? <CurrencyDisplay value={c.ppn} size="sm" /> : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-800">
                          <CurrencyDisplay value={c.totalDiluarJaminan} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(c.pct)}</td>
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400">
        UI menampilkan Target · Kompensasi · Denda · PPN · Total · %. Export Excel berisi breakdown penuh
        (termasuk PPH, PBB, Jaminan, No Dok SAP).
      </div>
    </div>
  )
}

function FragmentMonthCashHeaders() {
  return (
    <>
      <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
      <th className="px-2 py-1.5 text-right font-normal min-w-[88px]">Kompensasi</th>
      <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">Denda</th>
      <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPN</th>
      <th className="px-2 py-1.5 text-right font-normal min-w-[88px]">Total</th>
      <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
    </>
  )
}

function PendapatanTable({ rows, months }: { rows: HOMasterRow[]; months: number[] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-auto max-h-[min(70vh,720px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <StickyMasterHead />
              {months.map(m => (
                <th key={m} colSpan={4} className="px-2 py-2 text-center border-l border-white/20 font-semibold">
                  {BULAN_LABELS_HO[m]}
                </th>
              ))}
            </tr>
            <tr className="bg-[#163f5c] text-white/90">
              <th className="sticky left-0 z-20 bg-[#163f5c]" />
              <th className="sticky left-9 z-20 bg-[#163f5c]" />
              <th /><th /><th />
              {months.map(m => (
                <Fragment key={`ph-${m}`}>
                  <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
                  <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Pendapatan</th>
                  <th className="px-2 py-1.5 text-right font-normal min-w-[88px]">Total</th>
                  <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <StickyMasterCells r={r} zebra={zebra} />
                  {months.map(m => {
                    const p = r.pendapatanByMonth[m]
                    return (
                      <Fragment key={`${r.kodeMonika}-p-${m}`}>
                        <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                          <CurrencyDisplay value={p.target} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-right text-[#1B4F72] font-medium">
                          <CurrencyDisplay value={p.pendapatan} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold">
                          <CurrencyDisplay value={p.total} size="sm" />
                        </td>
                        <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(p.pct)}</td>
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PiutangTable({ rows, months }: { rows: HOMasterRow[]; months: number[] }) {
  const lastM = months[months.length - 1] ?? 0
  const withSaldo = rows.filter(r => (r.piutangByMonth[lastM]?.saldo ?? 0) > 0.5)

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-gray-100 text-[11px] text-gray-500">
        Menampilkan aging per bulan terpilih. Snapshot akhir bulan · {withSaldo.length} proker punya saldo di{' '}
        {BULAN_LABELS_HO[lastM]}.
      </div>
      <div className="overflow-auto max-h-[min(70vh,720px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <StickyMasterHead />
              {months.map(m => (
                <th key={m} colSpan={4} className="px-2 py-2 text-center border-l border-white/20 font-semibold">
                  {BULAN_LABELS_HO[m]}
                </th>
              ))}
            </tr>
            <tr className="bg-[#163f5c] text-white/90">
              <th className="sticky left-0 z-20 bg-[#163f5c]" />
              <th className="sticky left-9 z-20 bg-[#163f5c]" />
              <th /><th /><th />
              {months.map(m => (
                <Fragment key={`pih-${m}`}>
                  <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[72px]">1–30</th>
                  <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">31–90</th>
                  <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">&gt;90</th>
                  <th className="px-2 py-1.5 text-right font-normal min-w-[88px]">Saldo</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <StickyMasterCells r={r} zebra={zebra} />
                  {months.map(m => {
                    const p = r.piutangByMonth[m]
                    const m3190 = p.aging31_60 + p.aging61_90
                    const m90 =
                      p.aging91_180 + p.aging181_360 + p.aging361
                    return (
                      <Fragment key={`${r.kodeMonika}-pi-${m}`}>
                        <td className="px-2 py-1.5 text-right border-l border-gray-100 text-orange-700">
                          {p.aging1_30 > 0 ? <CurrencyDisplay value={p.aging1_30} size="sm" /> : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-red-600">
                          {m3190 > 0 ? <CurrencyDisplay value={m3190} size="sm" /> : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right text-red-800 font-medium">
                          {m90 > 0 ? <CurrencyDisplay value={m90} size="sm" /> : '—'}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-gray-800">
                          {p.saldo > 0 ? <CurrencyDisplay value={p.saldo} size="sm" /> : '—'}
                        </td>
                      </Fragment>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-gray-100 px-3 py-2 text-[10px] text-gray-400">
        UI menggabungkan bucket 31–60+61–90 dan &gt;90. Export Excel memecah 1–30 · 31–60 · 61–90 · 91–180 · 181–360 · &gt;361.
        {' '}{formatTanggal(new Date().toISOString())}
      </div>
    </div>
  )
}

