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

function pctLabel(v: number | null): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function CellRp({ value, className }: { value: number; className?: string }) {
  if (!value || Math.abs(value) < 0.5) {
    return <span className={cn('text-gray-300', className)}>—</span>
  }
  return (
    <span className={className}>
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
  const { allCashIn, fetchAllCashIn } = useCashInStore()
  const { allPBB, fetchAllPBB } = usePBBStore()

  const [tab, setTab] = useState<TabMode>('cash')
  const [tahun, setTahun] = useState(new Date().getFullYear())
  /** Satu bulan aktif — klik chip = ganti bulan, hanya bulan itu yang ditampilkan */
  const [bulan, setBulan] = useState(() => new Date().getMonth())
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

  const months = useMemo(() => [bulan], [bulan])

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
        months: ALL_MONTHS, // hitung semua bulan; tampilan filter di UI
      }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan],
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
  const loading = loadKomp && rows.length === 0

  const handleExport = async () => {
    if (filtered.length === 0) return
    setExporting(true)
    try {
      // Export hanya bulan yang sedang ditampilkan
      await exportLaporanHOExcel(filtered, { tahun, months })
    } finally {
      setExporting(false)
    }
  }

  const bulanLabel = BULAN_LABELS_HO[bulan]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Laporan Format HO</h1>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Struktur database proker mengikuti file HO (Cash · Pendapatan · Piutang).
            Klik satu bulan untuk menampilkan realisasi bulan tersebut saja.
          </p>
        </div>
      </div>

      <ExportExcelPanel
        title="Ekspor Excel Format HO"
        description={`3 sheet: Cash · Pendapatan · Piutang — hanya ${bulanLabel} ${tahun}. Satuan Excel: Rp 000.`}
        meta={`${filtered.length} proker · ${bulanLabel} ${tahun}`}
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
            placeholder="Cari proker / Monika / mitra / PKS…"
            value={q}
            onChange={e => setQ(e.target.value)}
            className="h-8 min-w-[200px] flex-1 rounded-md border border-gray-200 px-2.5 text-xs"
          />
          <span className="text-xs font-semibold text-[#1B4F72] bg-blue-50 border border-blue-100 rounded-md px-2.5 py-1">
            {bulanLabel} {tahun}
          </span>
        </div>

        <div>
          <p className="text-[11px] text-gray-400 mb-1.5">Pilih bulan (satu saja)</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_MONTHS.map(m => {
              const on = bulan === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBulan(m)}
                  className={cn(
                    'h-8 rounded-full px-3 text-[11px] font-medium border transition-colors',
                    on
                      ? 'bg-[#1B4F72] text-white border-[#1B4F72] shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-[#1B4F72]/40 hover:text-[#1B4F72]',
                  )}
                >
                  {BULAN_LABELS_HO[m]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Summary cards — hanya bulan terpilih */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Wallet size={16} />}
          label={`Cash In · ${bulanLabel}`}
          sub={`Target ${formatShort(summary.targetCash)}`}
          value={summary.realisasiCash}
          accent="teal"
        />
        <SummaryCard
          icon={<Banknote size={16} />}
          label={`Pendapatan · ${bulanLabel}`}
          sub={`Target ${formatShort(summary.targetPendapatan)}`}
          value={summary.realisasiPendapatan}
          accent="navy"
        />
        <SummaryCard
          icon={<Landmark size={16} />}
          label={`Piutang · ${bulanLabel}`}
          sub="Snapshot akhir bulan"
          value={summary.saldoPiutang}
          accent="amber"
        />
        <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <p className="text-[11px] text-gray-500 font-medium">Proker · Capaian Cash</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{summary.nProker}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {summary.targetCash > 0
              ? `${((summary.realisasiCash / summary.targetCash) * 100).toFixed(1)}% vs target ${bulanLabel}`
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
        <CashTable rows={filtered} bulan={bulan} tahun={tahun} />
      ) : tab === 'pendapatan' ? (
        <PendapatanTable rows={filtered} bulan={bulan} tahun={tahun} />
      ) : (
        <PiutangTable rows={filtered} bulan={bulan} tahun={tahun} />
      )}

      <p className="text-[11px] text-gray-400 flex items-start gap-1.5 pb-4">
        <FileSpreadsheet size={12} className="mt-0.5 shrink-0" />
        <span>
          Kolom master mengikuti database HO (Obyek, Monika, PKS, Lokasi, Alamat, Skema, Mitra, Bidang Usaha,
          Alas Hak, Luas, Mulai/Akhir, Total Kompensasi, RKAP/Non-RKAP). Realisasi bulanan: Target + Kompensasi +
          Denda + PPN + PPH + <strong>PBB</strong> + Jaminan + No Dok SAP + Total + %.
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

function CashTable({ rows, bulan, tahun }: { rows: HOMasterRow[]; bulan: number; tahun: number }) {
  const label = BULAN_LABELS_HO[bulan]
  let tTarget = 0, tKomp = 0, tDenda = 0, tPpn = 0, tPph = 0, tPbb = 0, tJam = 0, tTotal = 0
  rows.forEach(r => {
    const c = r.cashByMonth[bulan]
    tTarget += c.target
    tKomp += c.kompensasi
    tDenda += c.denda
    tPpn += c.ppn
    tPph += c.pph
    tPbb += c.pbb
    tJam += c.jaminan
    tTotal += c.totalDiluarJaminan
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Monitoring Penerimaan Cash In</p>
          <p className="text-[11px] text-gray-500">
            PROGRAM KERJA OPTIMALISASI ASET · Regional 8 · {label} {tahun}
          </p>
        </div>
        <span className="text-[11px] font-medium text-teal-800 bg-teal-50 border border-teal-100 rounded-full px-2.5 py-0.5">
          {label} saja
        </span>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={10} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-[#0f766e]">
                Realisasi Cash In · {label}
              </th>
            </tr>
            <tr className="bg-[#163f5c] text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-[#163f5c]', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[92px]">Kompensasi</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">Denda</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPN</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPH</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px] bg-amber-900/40">PBB</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">Jaminan</th>
              <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">No Dok (SAP)</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[96px]">Total s.d. PBB</th>
              <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const c = r.cashByMonth[bulan]
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} />
                  <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                    <CellRp value={c.target} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-teal-700 font-medium">
                    <CellRp value={c.kompensasi} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-red-600"><CellRp value={c.denda} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={c.ppn} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={c.pph} /></td>
                  <td className="px-2 py-1.5 text-right text-amber-800 font-medium bg-amber-50/50">
                    <CellRp value={c.pbb} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-500"><CellRp value={c.jaminan} /></td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={c.noDokSap}>
                    {c.noDokSap || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-gray-900">
                    <CellRp value={c.totalDiluarJaminan} />
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(c.pct)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50 font-semibold text-gray-800 border-t-2 border-amber-200">
              <td colSpan={18} className="px-2 py-2 sticky left-0 bg-amber-50">TOTAL · {label}</td>
              <td className="px-2 py-2 text-right border-l border-amber-100"><CellRp value={tTarget} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tKomp} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tDenda} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tPpn} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tPph} /></td>
              <td className="px-2 py-2 text-right text-amber-900"><CellRp value={tPbb} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tJam} /></td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right"><CellRp value={tTotal} /></td>
              <td className="px-2 py-2 text-center">
                {tTarget > 0 ? pctLabel((tTotal / tTarget) * 100) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function PendapatanTable({ rows, bulan, tahun }: { rows: HOMasterRow[]; bulan: number; tahun: number }) {
  const label = BULAN_LABELS_HO[bulan]
  let tTarget = 0, tPend = 0, tPpn = 0, tPph = 0, tPbb = 0, tTotal = 0
  rows.forEach(r => {
    const p = r.pendapatanByMonth[bulan]
    tTarget += p.target
    tPend += p.pendapatan
    tPpn += p.ppn
    tPph += p.pph
    tPbb += p.pbb
    tTotal += p.total
  })

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Monitoring Penerimaan Pendapatan</p>
          <p className="text-[11px] text-gray-500">
            PROGRAM KERJA OPTIMALISASI ASET · Regional 8 · {label} {tahun}
          </p>
        </div>
        <span className="text-[11px] font-medium text-blue-800 bg-blue-50 border border-blue-100 rounded-full px-2.5 py-0.5">
          {label} saja
        </span>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={8} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-[#5B2C6F]">
                Realisasi Pendapatan · {label}
              </th>
            </tr>
            <tr className="bg-[#163f5c] text-white/95">
              {Array.from({ length: 18 }).map((_, i) => (
                <th key={i} className={cn(i < 2 && 'sticky z-20 bg-[#163f5c]', i === 0 && 'left-0', i === 1 && 'left-9')} />
              ))}
              <th className="px-2 py-1.5 text-right border-l border-white/15 font-normal min-w-[88px]">Target</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[100px]">Pendapatan</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPN</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px]">PPH</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[72px] bg-amber-900/40">PBB</th>
              <th className="px-2 py-1.5 text-right font-normal min-w-[88px]">Total</th>
              <th className="px-2 py-1.5 text-left font-normal min-w-[100px]">No Dok (SAP)</th>
              <th className="px-2 py-1.5 text-center font-normal min-w-[48px]">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const zebra = i % 2 === 1
              const p = r.pendapatanByMonth[bulan]
              return (
                <tr key={r.kodeMonika} className={zebra ? 'bg-slate-50/80' : 'bg-white'}>
                  <MasterCells r={r} zebra={zebra} />
                  <td className="px-2 py-1.5 text-right text-gray-400 border-l border-gray-100">
                    <CellRp value={p.target} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-[#5B2C6F] font-medium">
                    <CellRp value={p.pendapatan} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={p.ppn} /></td>
                  <td className="px-2 py-1.5 text-right text-gray-600"><CellRp value={p.pph} /></td>
                  <td className="px-2 py-1.5 text-right text-amber-800 font-medium bg-amber-50/50">
                    <CellRp value={p.pbb} />
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold"><CellRp value={p.total} /></td>
                  <td className="px-2 py-1.5 text-gray-500 font-mono text-[10px] max-w-[120px] truncate" title={p.noDokSap}>
                    {p.noDokSap || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-center text-gray-500">{pctLabel(p.pct)}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-amber-50 font-semibold text-gray-800 border-t-2 border-amber-200">
              <td colSpan={18} className="px-2 py-2 sticky left-0 bg-amber-50">TOTAL · {label}</td>
              <td className="px-2 py-2 text-right border-l border-amber-100"><CellRp value={tTarget} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tPend} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tPpn} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tPph} /></td>
              <td className="px-2 py-2 text-right text-amber-900"><CellRp value={tPbb} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tTotal} /></td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-center">
                {tTarget > 0 ? pctLabel((tTotal / tTarget) * 100) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function PiutangTable({ rows, bulan, tahun }: { rows: HOMasterRow[]; bulan: number; tahun: number }) {
  const label = BULAN_LABELS_HO[bulan]
  let t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, tSaldo = 0
  rows.forEach(r => {
    const p = r.piutangByMonth[bulan]
    t1 += p.aging1_30
    t2 += p.aging31_60
    t3 += p.aging61_90
    t4 += p.aging91_180
    t5 += p.aging181_360
    t6 += p.aging361
    tSaldo += p.saldo
  })
  const withSaldo = rows.filter(r => (r.piutangByMonth[bulan]?.saldo ?? 0) > 0.5).length

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-800">Monitoring Piutang</p>
          <p className="text-[11px] text-gray-500">
            Aging snapshot akhir {label} {tahun} · {withSaldo} proker punya saldo
          </p>
        </div>
        <span className="text-[11px] font-medium text-amber-900 bg-amber-50 border border-amber-100 rounded-full px-2.5 py-0.5">
          {label} saja
        </span>
      </div>
      <div className="overflow-auto max-h-[min(72vh,760px)]">
        <table className="text-[11px] w-max min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-30">
            <tr className="bg-[#1B4F72] text-white">
              <MasterHead />
              <th colSpan={7} className="px-2 py-2 text-center border-l border-white/25 font-semibold bg-amber-800">
                Umur Piutang · {label} (Rp)
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
              const p = r.piutangByMonth[bulan]
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
          <tfoot>
            <tr className="bg-amber-50 font-semibold text-gray-800 border-t-2 border-amber-200">
              <td colSpan={18} className="px-2 py-2 sticky left-0 bg-amber-50">TOTAL · {label}</td>
              <td className="px-2 py-2 text-right border-l border-amber-100"><CellRp value={t1} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={t2} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={t3} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={t4} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={t5} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={t6} /></td>
              <td className="px-2 py-2 text-right"><CellRp value={tSaldo} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
