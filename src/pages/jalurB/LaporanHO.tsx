import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Banknote,
  FileSpreadsheet,
  Filter,
  Landmark,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { usePBBStore } from '@/store/pbbStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { ExportExcelPanel } from '@/components/common/ExportExcelPanel'
import { cn, formatTanggal } from '@/lib/utils'
import {
  BULAN_LABELS_HO,
  buildLaporanHO,
  monthsThrough,
  piutangAsOf,
  sumPendapatanMonths,
  summarizeHO,
  type HOMasterRow,
  type HOSummary,
} from '@/utils/laporanHOUtils'
import { exportLaporanHOExcel } from '@/utils/laporanHOExport'

type TabMode = 'pendapatan' | 'piutang'
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

  const [tab, setTab] = useState<TabMode>('pendapatan')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  /** Satu bulan aktif — null sampai data load (auto pilih bulan ber-realisasi) */
  const [bulan, setBulan] = useState<number | null>(null)
  const [bulanTouched, setBulanTouched] = useState(false)
  /** bulan = hanya bulan X · sd = Jan s.d. X */
  const [periodMode, setPeriodMode] = useState<PeriodMode>('sd')
  const [exporting, setExporting] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
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

  const rows = useMemo(
    () =>
      buildLaporanHO({
        tahun,
        rkapRows,
        daftarAset,
        daftarKS,
        allKompensasi,
        allPBB,
        daftarPDDM,
        allPengakuan,
        months: ALL_MONTHS,
      }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allPBB, daftarPDDM, allPengakuan],
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
    if (!q.trim()) return rows
    const s = q.trim().toLowerCase()
    return rows.filter(r =>
      r.obyek.toLowerCase().includes(s)
      || r.kodeMonika.toLowerCase().includes(s)
      || r.mitra.toLowerCase().includes(s)
      || r.bidangUsaha.toLowerCase().includes(s)
      || r.lokasi.toLowerCase().includes(s)
      || r.noPks.toLowerCase().includes(s)
      || r.alamat.toLowerCase().includes(s),
    )
  }, [rows, q])

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
  const periodLabel =
    periodMode === 'sd'
      ? (bulanAktif === 0 ? `Januari ${tahun}` : `s.d. ${bulanLabel} ${tahun}`)
      : `${bulanLabel} ${tahun}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Laporan Format HO</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Format HO: <strong>Pendapatan</strong> &amp; <strong>Piutang</strong> per proker.
            Pilih <strong>Bulan saja</strong> atau <strong>s.d. bulan</strong> (Januari–bulan terpilih).
          </p>
        </div>
      </div>

      <ExportExcelPanel
        title="Ekspor Excel Format HO"
        description={`3 sheet: Ringkasan TOTAL · Pendapatan · Piutang · ${periodLabel}. Detail: Rp 000.`}
        meta={`${filtered.length} proker · pendapatan (pokok) ${formatShort(summary.realisasiPendapatan)}`}
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

          {/* Mode periode */}
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
              Bulan saja
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
              title="Akumulasi Januari sampai bulan yang ditunjuk"
            >
              s.d. bulan
            </button>
          </div>

          <input
            type="search"
            placeholder="Cari proker / Monika / mitra / PKS…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 min-w-[160px] flex-1 rounded-md border border-gray-200 px-2.5 text-xs"
          />
          <span className="text-xs font-semibold text-[#1B4F72] bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1">
            {periodLabel}
          </span>
        </div>

        <div>
          <p className="text-[11px] text-gray-400 mb-1.5">
            {periodMode === 'sd'
              ? `Pilih bulan akhir — data dijumlah dari Januari s.d. bulan ini (${months.length} bulan)`
              : 'Pilih bulan — hanya data bulan tersebut'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MONTHS.map(m => {
              const on = bulanAktif === m
              const inRange = periodMode === 'sd' && m <= bulanAktif
              const hasAct = rows.some(r =>
                Math.abs(r.pendapatanByMonth[m]?.pendapatan ?? 0) > 0.5
                || Math.abs(r.pendapatanByMonth[m]?.total ?? 0) > 0.5,
              )
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
        tahun={tahun}
        summary={summary}
        summaryYear={summaryYear}
        periodMode={periodMode}
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
        {([
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
          description="Pastikan RKAP tahun ini sudah diisi dan ID Monika terhubung ke tagihan."
        />
      ) : tab === 'pendapatan' ? (
        <PendapatanTable
          rows={filtered}
          months={months}
          periodLabel={periodLabel}
          tahun={tahun}
          totals={summary}
        />
      ) : (
        <PiutangTable
          rows={filtered}
          endMonth={bulanAktif}
          periodLabel={periodLabel}
          tahun={tahun}
          totals={summary}
        />
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5 pb-4">
        <FileSpreadsheet size={12} className="mt-0.5 shrink-0" />
        <span>
          <strong>Pendapatan = pokok (DPP)</strong>.
          Total s.d. pajak = pendapatan + PPN + PPH(−) + PBB.
          <strong> s.d. bulan</strong> = Jan–bulan terpilih · piutang = snapshot akhir bulan.
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
  tahun,
  summary,
  summaryYear,
  periodMode,
}: {
  periodLabel: string
  tahun: number
  summary: HOSummary
  summaryYear: HOSummary
  periodMode: PeriodMode
}) {
  // Capaian vs RKAP: bandingkan pendapatan (= pokok) ke target
  const capaian =
    summary.targetPendapatan > 0
      ? (summary.realisasiPendapatan / summary.targetPendapatan) * 100
      : null

  return (
    <div className="rounded-xl border-2 border-[#1B4F72]/25 bg-gradient-to-r from-slate-50 via-white to-blue-50 shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-[#1B4F72] text-white">
        <p className="text-sm font-bold tracking-tight">
          TOTAL · {periodLabel}
          {periodMode === 'sd' && (
            <span className="ml-2 text-[11px] font-normal text-white/75">akumulasi</span>
          )}
        </p>
        <p className="text-[11px] text-white/80">
          {summary.nProker} proker · Σ RKAP thn {formatShort(summary.totalRkapTahun)}
          {capaian != null ? ` · Capaian ${capaian.toFixed(1)}%` : ''}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px bg-gray-200">
        <TotalCell label="Target RKAP" value={summary.targetPendapatan} />
        <TotalCell
          label="Pendapatan (= Pokok)"
          value={summary.realisasiPendapatan}
          accent="strong"
        />
        <TotalCell label="PPN" value={summary.pendapatanPpn} />
        <TotalCell label="PPH (−)" value={summary.pendapatanPph} accent="danger" />
        <TotalCell label="PBB" value={summary.pendapatanPbb} accent="amber" />
        <TotalCell label="Total s.d. pajak" value={summary.totalSdPajak} accent="navy" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 border-t border-gray-200">
        <TotalCell label="Saldo Piutang" value={summary.saldoPiutang} accent="amber" />
        <TotalCell label="Piutang 1–30" value={summary.piutang1_30} compact />
        <TotalCell label="Piutang >90" value={summary.piutang91_180 + summary.piutang181_360 + summary.piutang361} compact />
        <TotalCell
          label={`Pendapatan thn ${tahun}`}
          value={summaryYear.realisasiPendapatan}
          compact
        />
      </div>
      <p className="px-3 py-1.5 text-[10px] text-gray-500 bg-white border-t border-gray-100">
        <strong>Pendapatan = pokok (DPP)</strong> · Total s.d. pajak = pendapatan + PPN + PPH(−) + PBB ·
        Pendapatan thn = akumulasi pokok 12 bulan (bukan hanya periode filter).
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
function MasterHead() {
  return (
    <>
      <th className="sticky left-0 z-20 bg-[#1B4F72] px-2 py-2 text-left min-w-[36px]">No</th>
      <th className="sticky left-9 z-20 bg-[#1B4F72] px-2 py-2 text-left min-w-[200px]">Obyek Kerjasama</th>
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

function MasterCells({ r, zebra }: { r: HOMasterRow; zebra: boolean }) {
  const bg = zebra ? 'bg-slate-50' : 'bg-white'
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

function PendapatanTable({
  rows,
  months,
  periodLabel,
  tahun,
  totals,
}: {
  rows: HOMasterRow[]
  months: number[]
  periodLabel: string
  tahun: number
  totals: HOSummary
}) {
  const tTarget = totals.targetPendapatan
  const tPendapatan = totals.realisasiPendapatan // = pokok
  const tPpn = totals.pendapatanPpn
  const tPph = totals.pendapatanPph
  const tPbb = totals.pendapatanPbb
  const tSdPajak = totals.totalSdPajak

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Monitoring Penerimaan Pendapatan</p>
          <p className="text-[11px] text-gray-500">
            PROGRAM KERJA OPTIMALISASI ASET · Regional 8 · {periodLabel}
            {months.length > 1 ? ` · ${months.length} bulan` : ''}
            {' · '}Pendapatan = pokok (DPP)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-0.5">
            Pendapatan {formatShort(tPendapatan)}
          </span>
          <span className="font-medium text-blue-800 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5">
            {periodLabel}
          </span>
        </div>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={8} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-[#5B2C6F]">
                Realisasi · {periodLabel}
              </th>
            </tr>
            <tr className="bg-[#163f5c] text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-[#163f5c]', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[110px]" title="Pendapatan = Pokok (DPP)">
                Pendapatan<br /><span className="text-[9px] font-normal opacity-80">(= Pokok)</span>
              </th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPN</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[80px] text-red-200">PPH (−)</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px] bg-amber-900/40">PBB</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Total s.d. pajak</th>
              <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">No Dok (SAP)</th>
              <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const p = sumPendapatanMonths(r, months)
              const pctVsTarget = p.target > 0 ? (p.pendapatan / p.target) * 100 : null
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} />
                  <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                    <CellRp value={p.target} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-emerald-800 font-semibold">
                    <CellRp value={p.pendapatan} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={p.ppn} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={p.pph} /></td>
                  <td className="px-2 py-1.5 text-right text-amber-800 font-medium bg-amber-50/50">
                    <CellRp value={p.pbb} />
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium text-gray-700"><CellRp value={p.total} /></td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={p.noDokSap}>
                    {p.noDokSap || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(pctVsTarget)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-[#FEF3C7] font-bold text-gray-900 border-t-2 border-amber-400 shadow-[0_-2px_6px_rgba(0,0,0,0.06)]">
              <td colSpan={18} className="px-2 py-2.5 sticky left-0 bg-[#FEF3C7]">
                TOTAL · {periodLabel} · {rows.length} proker
              </td>
              <td className="px-2 py-2.5 text-right border-l border-amber-200"><CellRp value={tTarget} /></td>
              <td className="px-2 py-2.5 text-right text-emerald-800 text-sm"><CellRp value={tPendapatan} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={tPpn} /></td>
              <td className="px-2 py-2.5 text-right"><CellRp value={tPph} /></td>
              <td className="px-2 py-2.5 text-right text-amber-900"><CellRp value={tPbb} /></td>
              <td className="px-2 py-2.5 text-right text-gray-800">
                <CellRp value={tSdPajak} />
              </td>
              <td className="px-2 py-2.5" />
              <td className="px-2 py-2.5 text-center">
                {tTarget > 0 ? pctLabel((tPendapatan / tTarget) * 100) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function PiutangTable({
  rows,
  endMonth,
  periodLabel,
  tahun,
  totals,
}: {
  rows: HOMasterRow[]
  endMonth: number
  periodLabel: string
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
          <p className="text-sm font-semibold text-gray-800">Monitoring Piutang</p>
          <p className="text-[11px] text-gray-500">
            Aging snapshot akhir {BULAN_LABELS_HO[endMonth]} {tahun} · {withSaldo} proker punya saldo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold text-amber-900 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            TOTAL SALDO {formatShort(tSaldo)}
          </span>
          <span className="font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
            {periodLabel}
          </span>
        </div>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={7} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-amber-800">
                Umur Piutang · s.d. {BULAN_LABELS_HO[endMonth]} (Rp)
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
                TOTAL · {periodLabel} · saldo outstanding
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
