import { useEffect, useMemo, useState } from 'react'
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
import { usePBBStore } from '@/store/pbbStore'
import { useCashInStore } from '@/store/cashInStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { ExportExcelPanel } from '@/components/common/ExportExcelPanel'
import { cn, formatTanggal } from '@/lib/utils'
import {
  BULAN_LABELS_HO,
  buildLaporanHO,
  monthHasActivity,
  monthsThrough,
  piutangAsOf,
  rowHasCashTx,
  rowHasPendapatanTx,
  rowHasPiutang,
  sumCashBreakdownMonths,
  sumPendapatanMonths,
  summarizeHO,
  type HOMasterRow,
  type HOSummary,
} from '@/utils/laporanHOUtils'
import { exportLaporanHOExcel } from '@/utils/laporanHOExport'

type TabMode = 'cash' | 'pendapatan' | 'piutang'
/** bulan = hanya bulan terpilih · sd = Januari s.d. bulan terpilih */
type PeriodMode = 'bulan' | 'sd'

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

function pctLabel(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function CellRp({ value, className }: { value: number; className?: string }) {
  if (value == null || Math.abs(value) < 0.5) {
    return <span className={cn('text-gray-300', className)}>—</span>
  }
  return (
    <span className={cn(value < 0 && 'text-red-600', className)}>
      <CurrencyDisplay value={value} size="sm" />
    </span>
  )
}

function formatTgl(iso: string | null): string {
  if (!iso) return '—'
  return formatTanggal(iso)
}

export default function LaporanHO() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi, isLoading: loadKomp } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { allPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()

  const [tab, setTab] = useState<TabMode>('cash')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  /** Satu bulan aktif — null sampai data load (auto pilih bulan ber-realisasi) */
  const [bulan, setBulan] = useState<number | null>(null)
  const [bulanTouched, setBulanTouched] = useState(false)
  /** bulan = hanya bulan X · sd = Jan s.d. X */
  const [periodMode, setPeriodMode] = useState<PeriodMode>('sd')
  /** Default: hanya proker yang ada transaksi di tab & periode aktif */
  const [onlyWithTx, setOnlyWithTx] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
    fetchAllPBB()
    fetchAllCashIn()
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
        months: ALL_MONTHS,
      }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan],
  )

  // Auto-pilih bulan terakhir yang punya pendapatan (kecuali user sudah klik)
  useEffect(() => {
    if (bulanTouched) return
    if (rows.length === 0) {
      if (bulan == null) setBulan(new Date().getMonth())
      return
    }
    let best = new Date().getMonth()
    for (let m = 11; m >= 0; m--) {
      const has = rows.some(r => {
        const p = r.pendapatanByMonth[m]
        return Math.abs(p?.total ?? 0) > 0.5 || Math.abs(p?.pendapatan ?? 0) > 0.5
      })
      if (has) {
        best = m
        break
      }
    }
    setBulan(best)
  }, [rows, tahun, bulanTouched])

  const bulanAktif = bulan ?? new Date().getMonth()
  /** Rentang bulan untuk agregasi / export */
  const months = useMemo(
    () => (periodMode === 'sd' ? monthsThrough(bulanAktif) : [bulanAktif]),
    [periodMode, bulanAktif],
  )

  const filtered = useMemo(() => {
    let list = rows
    if (onlyWithTx) {
      if (tab === 'cash') list = list.filter(r => rowHasCashTx(r, months))
      else if (tab === 'pendapatan') list = list.filter(r => rowHasPendapatanTx(r, months))
      else list = list.filter(r => rowHasPiutang(r, bulanAktif))
    }
    if (!q.trim()) return list
    const s = q.trim().toLowerCase()
    return list.filter(r =>
      r.obyek.toLowerCase().includes(s)
      || r.kodeMonika.toLowerCase().includes(s)
      || r.mitra.toLowerCase().includes(s)
      || r.bidangUsaha.toLowerCase().includes(s)
      || r.lokasi.toLowerCase().includes(s)
      || r.noPks.toLowerCase().includes(s)
      || r.alamat.toLowerCase().includes(s),
    )
  }, [rows, q, onlyWithTx, tab, months, bulanAktif])

  const nAll = rows.length
  const nTxCash = useMemo(() => rows.filter(r => rowHasCashTx(r, months)).length, [rows, months])
  const nTxPendapatan = useMemo(() => rows.filter(r => rowHasPendapatanTx(r, months)).length, [rows, months])
  const nTxPiutang = useMemo(() => rows.filter(r => rowHasPiutang(r, bulanAktif)).length, [rows, bulanAktif])
  const nTxActive = tab === 'cash' ? nTxCash : tab === 'pendapatan' ? nTxPendapatan : nTxPiutang

  const summary = useMemo(() => summarizeHO(filtered, months), [filtered, months])
  const summaryYear = useMemo(() => summarizeHO(filtered, ALL_MONTHS), [filtered])
  const loading = loadKomp && rows.length === 0

  const handleExport = async () => {
    if (filtered.length === 0) return
    setExporting(true)
    try {
      await exportLaporanHOExcel(filtered, { tahun, months })
    } finally {
      setExporting(false)
    }
  }

  const selectBulan = (m: number) => {
    setBulanTouched(true)
    setBulan(m)
  }

  const bulanLabel = BULAN_LABELS_HO[bulanAktif]
  /** Label periode yang dibaca orang awam: "Maret 2026" atau "Januari s.d. Maret 2026" */
  const periodLabel =
    periodMode === 'sd'
      ? (bulanAktif === 0
          ? `Januari ${tahun}`
          : `Januari s.d. ${bulanLabel} ${tahun}`)
      : `${bulanLabel} ${tahun}`
  const periodPendapatan = `Pendapatan ${periodLabel}`
  const periodTarget = `Target RKAP ${periodLabel}`
  const periodPiutang = `Piutang per akhir ${bulanLabel} ${tahun}`
  const periodFullYear = `Pendapatan Januari s.d. Desember ${tahun}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Laporan Format HO</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Tiga laporan terpisah: <strong>Cash In</strong> (format HO copy-paste), <strong>Pendapatan</strong> (akrual),
            dan <strong>Piutang</strong> (aging). Default hanya menampilkan proker yang ada transaksi di periode aktif.
          </p>
        </div>
      </div>

      <ExportExcelPanel
        title="Unduh Excel"
        description={`${periodLabel} · sheet Cash In · Pendapatan · Piutang · Ringkasan · nilai dalam Rp 000`}
        meta={`${filtered.length} proker · Cash ${formatShort(summary.cashIn)} · Pendapatan ${formatShort(summary.realisasiPendapatan)}`}
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

          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              type="button"
              onClick={() => setPeriodMode('bulan')}
              className={cn(
                'h-8 rounded-md px-3 text-[11px] font-semibold transition-colors',
                periodMode === 'bulan'
                  ? 'bg-white text-[#1B4F72] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Hanya 1 bulan
            </button>
            <button
              type="button"
              onClick={() => setPeriodMode('sd')}
              className={cn(
                'h-8 rounded-md px-3 text-[11px] font-semibold transition-colors',
                periodMode === 'sd'
                  ? 'bg-white text-[#1B4F72] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              Dari Januari s.d. bulan ini
            </button>
          </div>

          <input
            type="search"
            placeholder="Cari proker / Monika / mitra / PKS…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 min-w-[160px] flex-1 rounded-md border border-gray-200 px-2.5 text-xs"
          />
          <label className="flex items-center gap-2 h-8 rounded-md border border-teal-200 bg-teal-50/80 px-2.5 text-[11px] font-medium text-teal-900 cursor-pointer select-none">
            <input
              type="checkbox"
              className="rounded border-teal-400 text-teal-700 focus:ring-teal-500"
              checked={onlyWithTx}
              onChange={e => setOnlyWithTx(e.target.checked)}
            />
            Hanya yang ada transaksi
            <span className="text-teal-700/80 font-normal">
              ({nTxActive}/{nAll})
            </span>
          </label>
          <span className="text-xs font-semibold text-[#1B4F72] bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1">
            {periodLabel}
          </span>
        </div>

        <div>
          <p className="text-[11px] text-gray-500 mb-1.5 font-medium">
            {periodMode === 'sd'
              ? `Klik bulan terakhir. Sekarang menampilkan: ${periodLabel} (${months.length} bulan).`
              : `Klik bulan. Sekarang menampilkan: ${periodLabel} saja.`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MONTHS.map(m => {
              const on = bulanAktif === m
              const inRange = periodMode === 'sd' && m <= bulanAktif
              const hasAct = monthHasActivity(rows, m)
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectBulan(m)}
                  className={cn(
                    'h-8 rounded-full px-3 text-[11px] font-medium border transition-colors',
                    on
                      ? 'bg-[#1B4F72] text-white border-[#1B4F72] shadow-sm'
                      : inRange
                        ? 'bg-blue-50 text-[#1B4F72] border-[#1B4F72]/25'
                        : hasAct
                          ? 'bg-white text-[#1B4F72] border-[#1B4F72]/30 hover:bg-blue-50'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300',
                  )}
                >
                  {BULAN_LABELS_HO[m]}
                  {hasAct && !on && (
                    <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-teal-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <TotalBar
        periodLabel={periodLabel}
        periodPendapatan={periodPendapatan}
        periodTarget={periodTarget}
        periodPiutang={periodPiutang}
        periodFullYear={periodFullYear}
        tahun={tahun}
        summary={summary}
        summaryYear={summaryYear}
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {([
          { id: 'cash' as const, label: 'Cash In', icon: <Wallet size={13} />, count: nTxCash },
          { id: 'pendapatan' as const, label: 'Pendapatan', icon: <Banknote size={13} />, count: nTxPendapatan },
          { id: 'piutang' as const, label: 'Piutang', icon: <Landmark size={13} />, count: nTxPiutang },
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
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                tab === t.id ? 'bg-blue-50 text-[#1B4F72]' : 'bg-gray-200/80 text-gray-600',
              )}
            >
              {onlyWithTx ? t.count : nAll}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={8} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={onlyWithTx ? 'Tidak ada proker dengan transaksi' : 'Belum ada data proker'}
          description={
            onlyWithTx
              ? `Tidak ada transaksi ${tab === 'cash' ? 'Cash In' : tab === 'pendapatan' ? 'Pendapatan' : 'Piutang'} di ${periodLabel}. Matikan filter "Hanya yang ada transaksi" untuk melihat semua proker, atau pilih periode lain.`
              : 'Pastikan RKAP tahun ini sudah diisi dan ID Monika terhubung ke tagihan.'
          }
        />
      ) : tab === 'cash' ? (
        <CashInTable
          rows={filtered}
          months={months}
          periodLabel={periodLabel}
        />
      ) : tab === 'pendapatan' ? (
        <PendapatanTable
          rows={filtered}
          months={months}
          periodLabel={periodLabel}
        />
      ) : (
        <PiutangTable
          rows={filtered}
          endMonth={bulanAktif}
          periodLabel={periodLabel}
          periodPiutang={periodPiutang}
          tahun={tahun}
          totals={summary}
        />
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5 pb-4">
        <FileSpreadsheet size={12} className="mt-0.5 shrink-0" />
        <span>
          Periode: <strong>{periodLabel}</strong>
          {onlyWithTx ? ` · filter: proker dengan transaksi (${filtered.length} dari ${nAll})` : ` · semua proker (${filtered.length})`}.
          {tab === 'cash' && (
            <> Cash In HO: <strong>Kompensasi · Denda · PPN · PPH · PBB · Jaminan · Total · No Billing</strong>.</>
          )}
          {tab === 'pendapatan' && (
            <> Pendapatan akrual (by JT): <strong>Target · Pendapatan · No Billing · %</strong> (tanpa PPN/PPH/PBB).</>
          )}
          {tab === 'piutang' && (
            <> Aging snapshot akhir {bulanLabel} {tahun}.</>
          )}
          {' '}Excel satuan Rp 000.
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

function TotalBar({
  periodLabel,
  periodPendapatan,
  periodTarget,
  periodPiutang,
  periodFullYear,
  tahun,
  summary,
  summaryYear,
}: {
  periodLabel: string
  periodPendapatan: string
  periodTarget: string
  periodPiutang: string
  periodFullYear: string
  tahun: number
  summary: HOSummary
  summaryYear: HOSummary
}) {
  const capaian =
    summary.targetPendapatan > 0
      ? (summary.realisasiPendapatan / summary.targetPendapatan) * 100
      : null

  return (
    <div className="rounded-xl border-2 border-[#1B4F72]/25 bg-gradient-to-r from-slate-50 via-white to-blue-50 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-[#1B4F72] text-white">
        <div>
          <p className="text-sm font-bold tracking-tight">Ringkasan angka</p>
          <p className="text-[12px] text-white/90 mt-0.5 font-medium">
            Periode: {periodLabel}
          </p>
        </div>
        <p className="text-[11px] text-white/80">
          {summary.nProker} proker
          {capaian != null ? ` · Capaian vs target ${capaian.toFixed(1)}%` : ''}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-200">
        <TotalCell label={periodTarget} value={summary.targetPendapatan} />
        <TotalCell label={periodPendapatan} value={summary.realisasiPendapatan} accent="strong" />
        <TotalCell label={`Cash In (${periodLabel})`} value={summary.cashIn} accent="navy" />
        <TotalCell label={periodPiutang} value={summary.saldoPiutang} accent="amber" />
      </div>
      <p className="px-3 py-2 text-[11px] text-gray-600 bg-white border-t border-gray-100 leading-relaxed">
        Format HO Cash In (copy-paste): <strong>Kompensasi · Denda · PPN · PPH · PBB · Jaminan · Total · No Billing</strong>.
        Satuan Excel: Rp 000.
      </p>
    </div>
  )
}

function TotalCell({
  label,
  value,
  accent,
  compact,
}: {
  label: string
  value: number
  accent?: 'navy' | 'amber' | 'danger' | 'strong'
  compact?: boolean
}) {
  return (
    <div className={cn('bg-white px-3 py-2.5', compact && 'py-2')}>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'font-bold tabular-nums mt-0.5',
          compact ? 'text-sm' : 'text-base',
          accent === 'navy' && 'text-[#1B4F72]',
          accent === 'amber' && 'text-amber-800',
          accent === 'danger' && 'text-red-600',
          accent === 'strong' && 'text-emerald-800 text-lg',
          !accent && 'text-gray-900',
        )}
      >
        <CurrencyDisplay value={value} size={compact ? 'sm' : 'md'} />
      </p>
    </div>
  )
}

/** Header kolom master database HO */
function MasterHead({ className }: { className?: string }) {
  const sticky = className ?? 'bg-[#1B4F72]'
  return (
    <>
      <th className={cn('sticky left-0 z-20 px-2 py-2 text-left min-w-[36px]', sticky)}>No</th>
      <th className={cn('sticky left-9 z-20 px-2 py-2 text-left min-w-[200px]', sticky)}>Obyek Kerjasama</th>
      <th className="px-2 py-2 text-left min-w-[110px]">Kode MONIKA</th>
      <th className="px-2 py-2 text-left min-w-[110px]">No PKS/Add</th>
      <th className="px-2 py-2 text-left min-w-[110px]">Lokasi (Unit/Kebun)</th>
      <th className="px-2 py-2 text-left min-w-[140px]">Alamat Lengkap</th>
      <th className="px-2 py-2 text-left min-w-[80px]">Skema KS</th>
      <th className="px-2 py-2 text-left min-w-[140px]">Mitra / Calon Mitra</th>
      <th className="px-2 py-2 text-left min-w-[100px]">Bidang Usaha</th>
      <th className="px-2 py-2 text-left min-w-[90px]">Status Alas Hak</th>
      <th className="px-2 py-2 text-right min-w-[80px]">Luas (m²)</th>
      <th className="px-2 py-2 text-center min-w-[90px]">Mulai KS</th>
      <th className="px-2 py-2 text-center min-w-[90px]">Berakhir KS</th>
      <th className="px-2 py-2 text-right min-w-[70px]">Jangka (Th)</th>
      <th className="px-2 py-2 text-right min-w-[100px]">Total Komp. Fix</th>
      <th className="px-2 py-2 text-right min-w-[90px]">RKAP Eksisting</th>
      <th className="px-2 py-2 text-right min-w-[90px]">NON RKAP</th>
      <th className="px-2 py-2 text-right min-w-[90px]">Target Tahun</th>
    </>
  )
}

function MasterCells({
  r,
  zebra,
  stickyBg,
}: {
  r: HOMasterRow
  zebra: boolean
  stickyBg?: string
}) {
  const bg = stickyBg ?? (zebra ? 'bg-slate-50' : 'bg-white')
  return (
    <>
      <td className={cn('sticky left-0 z-10 px-2 py-1.5 text-gray-500', bg)}>{r.no}</td>
      <td className={cn('sticky left-9 z-10 px-2 py-1.5 font-medium text-gray-800', bg)}>
        <div className="max-w-[220px] truncate" title={r.obyek}>{r.obyek}</div>
        {r.isOrphan && (
          <span className="text-[10px] text-amber-600 font-normal">Non-RKAP</span>
        )}
      </td>
      <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700">{r.kodeMonika}</td>
      <td className="px-2 py-1.5 text-gray-600 max-w-[120px] truncate" title={r.noPks}>{r.noPks || '—'}</td>
      <td className="px-2 py-1.5 text-gray-600 max-w-[120px] truncate" title={r.lokasi}>{r.lokasi || '—'}</td>
      <td className="px-2 py-1.5 text-gray-500 max-w-[150px] truncate" title={r.alamat}>{r.alamat || '—'}</td>
      <td className="px-2 py-1.5 text-gray-500">{r.skema || '—'}</td>
      <td className="px-2 py-1.5 text-gray-700 max-w-[150px] truncate" title={r.mitra}>{r.mitra || '—'}</td>
      <td className="px-2 py-1.5 text-gray-600 text-[11px]">{r.bidangUsaha}</td>
      <td className="px-2 py-1.5 text-gray-500 text-[11px] max-w-[100px] truncate" title={r.statusAlasHak}>
        {r.statusAlasHak || '—'}
      </td>
      <td className="px-2 py-1.5 text-right text-gray-600 tabular-nums">
        {r.luasM2 != null ? r.luasM2.toLocaleString('id-ID') : '—'}
      </td>
      <td className="px-2 py-1.5 text-center text-gray-500 whitespace-nowrap text-[10px]">{formatTgl(r.tglMulai)}</td>
      <td className="px-2 py-1.5 text-center text-gray-500 whitespace-nowrap text-[10px]">{formatTgl(r.tglBerakhir)}</td>
      <td className="px-2 py-1.5 text-right text-gray-600">
        {r.jangkaTahun != null ? r.jangkaTahun : '—'}
      </td>
      <td className="px-2 py-1.5 text-right"><CellRp value={r.totalKompensasiFix} /></td>
      <td className="px-2 py-1.5 text-right"><CellRp value={r.rkapEksisting} /></td>
      <td className="px-2 py-1.5 text-right"><CellRp value={r.nonRkapEksisting} /></td>
      <td className="px-2 py-1.5 text-right font-medium"><CellRp value={r.targetTahun} /></td>
    </>
  )
}

/** Chip total — selalu terlihat di luar scroll tabel */
function TotalChip({
  label,
  value,
  accent,
  isPct,
}: {
  label: string
  value: number
  accent?: 'teal' | 'red' | 'amber' | 'bold' | 'muted'
  isPct?: boolean
}) {
  return (
    <div className="flex flex-col min-w-[88px] px-2.5 py-1.5 rounded-lg bg-white/80 border border-amber-200/80">
      <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          'text-sm font-bold tabular-nums mt-0.5',
          accent === 'teal' && 'text-teal-800',
          accent === 'red' && 'text-red-600',
          accent === 'amber' && 'text-amber-800',
          accent === 'bold' && 'text-gray-900 text-base',
          accent === 'muted' && 'text-gray-500',
          !accent && 'text-gray-800',
        )}
      >
        {isPct
          ? (value != null && Number.isFinite(value) ? pctLabel(value) : '—')
          : <CurrencyDisplay value={value} size="sm" />}
      </span>
    </div>
  )
}

/** Tab Cash In — format HO copy-paste */
function CashInTable({
  rows,
  months,
  periodLabel,
}: {
  rows: HOMasterRow[]
  months: number[]
  periodLabel: string
}) {
  let tTarget = 0, tKomp = 0, tDenda = 0, tPpn = 0, tPph = 0, tPbb = 0, tJam = 0, tTotal = 0
  rows.forEach(r => {
    const c = sumCashBreakdownMonths(r, months)
    tTarget += c.target
    tKomp += c.kompensasi
    tDenda += c.denda
    tPpn += c.ppn
    tPph += c.pph
    tPbb += c.pbb
    tJam += c.jaminan
    tTotal += c.totalDiluarJaminan
  })
  const tPct = tTarget > 0 ? (tTotal / tTarget) * 100 : null

  return (
    <div className="rounded-xl border border-teal-200/80 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-teal-50/60 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-teal-950">Cash In — format HO</p>
          <p className="text-[11px] text-teal-800/70">
            Uang masuk (by tgl bayar) · {periodLabel} · {rows.length} proker · siap copy-paste
          </p>
        </div>
        <span className="font-semibold text-teal-900 bg-white border border-teal-200 rounded-full px-2.5 py-0.5 text-[11px]">
          Total Cash In {formatShort(tTotal)}
        </span>
      </div>

      {/* TOTAL selalu di atas — tidak perlu scroll horizontal */}
      <div className="px-3 py-2.5 border-b-2 border-amber-300 bg-[#FEF3C7]">
        <p className="text-[11px] font-bold text-amber-950 mb-1.5">
          TOTAL Cash In · {periodLabel} · {rows.length} proker
        </p>
        <div className="flex flex-wrap gap-1.5">
          <TotalChip label="Target" value={tTarget} accent="muted" />
          <TotalChip label="Kompensasi" value={tKomp} accent="teal" />
          <TotalChip label="Denda" value={tDenda} accent="red" />
          <TotalChip label="PPN" value={tPpn} />
          <TotalChip label="PPH" value={tPph} accent="red" />
          <TotalChip label="PBB" value={tPbb} accent="amber" />
          <TotalChip label="Jaminan" value={tJam} />
          <TotalChip label="Total" value={tTotal} accent="bold" />
          <TotalChip label="%" value={tPct ?? 0} isPct accent="bold" />
        </div>
      </div>

      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#0f766e] text-white">
              <MasterHead className="bg-[#0f766e]" />
              <th colSpan={10} className="px-2 py-2 text-center border-l border-white/25 font-semibold">
                Realisasi Cash In · {periodLabel}
              </th>
            </tr>
            <tr className="bg-[#0d9488] text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-[#0d9488]', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Kompensasi</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">Denda</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">PPN</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">PPH</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">PBB</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">Jaminan</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Total</th>
              <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">No Billing</th>
              <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const c = sumCashBreakdownMonths(r, months)
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-teal-50/40' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} stickyBg={zebra ? 'bg-teal-50' : 'bg-white'} />
                  <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                    <CellRp value={c.target} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-teal-800 font-semibold">
                    <CellRp value={c.kompensasi} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-red-600"><CellRp value={c.denda} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-700"><CellRp value={c.ppn} /></td>
                  <td className="px-2 py-1.5 text-right text-red-600"><CellRp value={c.pph} /></td>
                  <td className="px-2 py-1.5 text-right text-amber-800"><CellRp value={c.pbb} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={c.jaminan} /></td>
                  <td className="px-2 py-1.5 text-right font-bold text-gray-900">
                    <CellRp value={c.totalDiluarJaminan} />
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={c.noDokSap || undefined}>
                    {c.noDokSap || ''}
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(c.pct)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#FEF3C7] font-bold text-gray-900 border-t-2 border-amber-400">
              <td colSpan={18} className="px-2 py-2 sticky left-0 bg-[#FEF3C7] z-10">
                TOTAL · scroll kanan untuk rincian kolom
              </td>
              <td className="px-2 py-2 text-right border-l border-amber-200 bg-[#FEF3C7]"><CellRp value={tTarget} /></td>
              <td className="px-2 py-2 text-right text-teal-800 bg-[#FEF3C7]"><CellRp value={tKomp} /></td>
              <td className="px-2 py-2 text-right bg-[#FEF3C7]"><CellRp value={tDenda} /></td>
              <td className="px-2 py-2 text-right bg-[#FEF3C7]"><CellRp value={tPpn} /></td>
              <td className="px-2 py-2 text-right bg-[#FEF3C7]"><CellRp value={tPph} /></td>
              <td className="px-2 py-2 text-right bg-[#FEF3C7]"><CellRp value={tPbb} /></td>
              <td className="px-2 py-2 text-right bg-[#FEF3C7]"><CellRp value={tJam} /></td>
              <td className="px-2 py-2 text-right text-sm bg-[#FEF3C7]"><CellRp value={tTotal} /></td>
              <td className="px-2 py-2 bg-[#FEF3C7]" />
              <td className="px-2 py-2 text-center bg-[#FEF3C7]">
                {tPct != null ? pctLabel(tPct) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-teal-100 text-[10px] text-gray-500">
        <strong>Total = Σ uang masuk</strong> (nominal_bayar + denda + PBB) — SSOT, sama dengan Cash In di Laporan Pendapatan (filter by tgl bayar).
        Kolom Kompensasi/PPN/PPH = alokasi internal (jumlahnya = Total). PPH negatif hanya jika mode bukti potong.
        No Billing = no_billing_sap saja.
      </div>
    </div>
  )
}

/** Tab Pendapatan — hanya Target · Pendapatan (DPP) · No Billing · % (tanpa PPN/PPH/PBB) */
function PendapatanTable({
  rows,
  months,
  periodLabel,
}: {
  rows: HOMasterRow[]
  months: number[]
  periodLabel: string
}) {
  let tTarget = 0, tPend = 0
  rows.forEach(r => {
    const p = sumPendapatanMonths(r, months)
    tTarget += p.target
    tPend += p.pendapatan
  })
  const tPct = tTarget > 0 ? (tPend / tTarget) * 100 : null

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-emerald-50/60 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-950">Pendapatan — akrual</p>
          <p className="text-[11px] text-emerald-800/70">
            Hanya DPP (pokok) by jatuh tempo · {periodLabel} · {rows.length} proker
            · PPN/PPH/PBB tidak diisi di sini (lihat tab Cash In)
          </p>
        </div>
        <span className="font-semibold text-emerald-900 bg-white border border-emerald-200 rounded-full px-2.5 py-0.5 text-[11px]">
          Pendapatan {formatShort(tPend)}
        </span>
      </div>

      <div className="px-3 py-2.5 border-b-2 border-amber-300 bg-[#FEF3C7]">
        <p className="text-[11px] font-bold text-amber-950 mb-1.5">
          TOTAL Pendapatan · {periodLabel} · {rows.length} proker
        </p>
        <div className="flex flex-wrap gap-1.5">
          <TotalChip label="Target" value={tTarget} accent="muted" />
          <TotalChip label="Pendapatan" value={tPend} accent="bold" />
          <TotalChip label="%" value={tPct ?? 0} isPct accent="bold" />
        </div>
      </div>

      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-emerald-800 text-white">
              <MasterHead className="bg-emerald-800" />
              <th colSpan={4} className="px-2 py-2 text-center border-l border-white/25 font-semibold">
                Realisasi Pendapatan · {periodLabel}
              </th>
            </tr>
            <tr className="bg-emerald-700 text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-emerald-700', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[120px]">Pendapatan</th>
              <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">No Billing</th>
              <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const p = sumPendapatanMonths(r, months)
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-emerald-50/40' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} stickyBg={zebra ? 'bg-emerald-50' : 'bg-white'} />
                  <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                    <CellRp value={p.target} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-emerald-800 font-bold">
                    <CellRp value={p.pendapatan} />
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={p.noDokSap || undefined}>
                    {p.noDokSap || ''}
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(p.pct)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#FEF3C7] font-bold text-gray-900 border-t-2 border-amber-400">
              <td colSpan={18} className="px-2 py-2 sticky left-0 bg-[#FEF3C7] z-10">
                TOTAL Pendapatan · {periodLabel}
              </td>
              <td className="px-2 py-2 text-right border-l border-amber-200 bg-[#FEF3C7]"><CellRp value={tTarget} /></td>
              <td className="px-2 py-2 text-right text-emerald-800 text-sm bg-[#FEF3C7]"><CellRp value={tPend} /></td>
              <td className="px-2 py-2 bg-[#FEF3C7]" />
              <td className="px-2 py-2 text-center bg-[#FEF3C7]">
                {tPct != null ? pctLabel(tPct) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="px-3 py-2 border-t border-emerald-100 text-[10px] text-gray-500">
        Pendapatan = DPP akrual (pokok) by jatuh tempo saja — tanpa PPN, PPH, PBB.
        Pajak &amp; komponen kas ada di tab Cash In (format HO).
      </div>
    </div>
  )
}

function PiutangTable({
  rows,
  endMonth,
  periodLabel,
  periodPiutang,
  tahun,
  totals,
}: {
  rows: HOMasterRow[]
  endMonth: number
  periodLabel: string
  periodPiutang: string
  tahun: number
  totals: HOSummary
}) {
  const t1 = totals.piutang1_30
  const t2 = totals.piutang31_60
  const t3 = totals.piutang61_90
  const t4 = totals.piutang91_180
  const t5 = totals.piutang181_360
  const t6 = totals.piutang361
  const tSaldo = totals.saldoPiutang
  const withSaldo = rows.filter(r => (piutangAsOf(r, endMonth).saldo ?? 0) > 0.5).length

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">{periodPiutang}</p>
          <p className="text-[11px] text-gray-500">
            {withSaldo} proker masih punya sisa tagihan · periode laporan {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-amber-900 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            Sisa {formatShort(tSaldo)}
          </span>
        </div>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={7} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-amber-800">
                {periodPiutang}
              </th>
            </tr>
            <tr className="bg-[#163f5c] text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-[#163f5c]', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[80px]">1 – 30</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">31 – 60</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">61 – 90</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">91 – 180</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px]">181 – 360</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">&gt; 361</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const p = piutangAsOf(r, endMonth)
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} />
                  <td className="px-2 py-1.5 text-right border-l border-gray-100 text-orange-700">
                    <CellRp value={p.aging1_30} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-red-600"><CellRp value={p.aging31_60} /></td>
                  <td className="px-2 py-1.5 text-right text-red-700"><CellRp value={p.aging61_90} /></td>
                  <td className="px-2 py-1.5 text-right text-red-800"><CellRp value={p.aging91_180} /></td>
                  <td className="px-2 py-1.5 text-right text-red-900"><CellRp value={p.aging181_360} /></td>
                  <td className="px-2 py-1.5 text-right text-red-950 font-medium"><CellRp value={p.aging361} /></td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-900">
                    <CellRp value={p.saldo} />
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[#FEF3C7] font-bold text-gray-900 border-t-2 border-amber-400 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
              <td colSpan={18} className="px-2 py-2.5 sticky left-0 bg-[#FEF3C7]">
                Jumlah · {periodPiutang}
              </td>
              <td className="px-2 py-2.5 text-right border-l border-amber-200"><CellRp value={t1} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={t2} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={t3} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={t4} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={t5} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={t6} /></td>
              <td className="px-2 py-2.5 text-right text-amber-900 text-sm"><CellRp value={tSaldo} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
