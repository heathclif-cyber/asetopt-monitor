import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { formatTanggal, formatRupiah, cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter, LayoutList, Table2 } from 'lucide-react'
import { hitungDenda } from '@/utils/taxUtils'
import {
  buildProgramLaporanRows,
  summarizeProgramRows,
  type ProgramHorizon,
  type ProgramLaporanRow,
} from '@/utils/laporanProgramUtils'

type ViewMode = 'detail' | 'program'
type SortKey = 'namaMitra' | 'namaAset' | 'periodeLabel' | 'tglJatuhTempo' | 'totalTagihan' | 'cashIn' | 'sisa' | 'status' | 'pendapatanAkrual'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'lunas' | 'belum_lunas'
/** Filter tampilan periode (bukan sort) */
type PeriodeMode = 'semua' | 'terbaru' | 'terdekat'
/** Preset urutan cepat di dropdown */
type SortPreset =
  | 'tgl_terbaru'
  | 'tgl_terlama'
  | 'tagihan_terbesar'
  | 'tagihan_terkecil'
  | 'cashin_terbesar'
  | 'cashin_terkecil'
  | 'sisa_terbesar'
  | 'akrual_terbesar'
  | 'mitra_az'
  | 'mitra_za'
  | 'status'

const SORT_PRESETS: { value: SortPreset; label: string; key: SortKey; dir: SortDir }[] = [
  { value: 'tgl_terbaru', label: 'Tanggal terbaru', key: 'tglJatuhTempo', dir: 'desc' },
  { value: 'tgl_terlama', label: 'Tanggal terlama', key: 'tglJatuhTempo', dir: 'asc' },
  { value: 'tagihan_terbesar', label: 'Tagihan terbesar', key: 'totalTagihan', dir: 'desc' },
  { value: 'tagihan_terkecil', label: 'Tagihan terkecil', key: 'totalTagihan', dir: 'asc' },
  { value: 'cashin_terbesar', label: 'Cash In terbesar', key: 'cashIn', dir: 'desc' },
  { value: 'cashin_terkecil', label: 'Cash In terkecil', key: 'cashIn', dir: 'asc' },
  { value: 'sisa_terbesar', label: 'Outstanding terbesar', key: 'sisa', dir: 'desc' },
  { value: 'akrual_terbesar', label: 'Akrual terbesar', key: 'pendapatanAkrual', dir: 'desc' },
  { value: 'mitra_az', label: 'Mitra A → Z', key: 'namaMitra', dir: 'asc' },
  { value: 'mitra_za', label: 'Mitra Z → A', key: 'namaMitra', dir: 'desc' },
  { value: 'status', label: 'Status', key: 'status', dir: 'asc' },
]

function resolveSortPreset(key: SortKey, dir: SortDir): SortPreset | 'custom' {
  const hit = SORT_PRESETS.find(p => p.key === key && p.dir === dir)
  return hit?.value ?? 'custom'
}

const STATUS_LABEL: Record<string, string> = {
  lunas: 'Lunas',
  sebagian: 'Belum Lunas',
  belum_bayar: 'Belum Lunas',
  terlambat: 'Belum Lunas',
}

const STATUS_COLOR: Record<string, string> = {
  lunas: 'bg-green-100 text-green-700',
  sebagian: 'bg-amber-100 text-amber-700',
  belum_bayar: 'bg-gray-100 text-gray-600',
  terlambat: 'bg-red-100 text-red-700',
}

function parseTglParts(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number)
  return { year: y, month: m - 1 }
}

function dateKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function resolveStatus(totalDibayar: number, efektifTagihan: number, hariTerlambat: number): string {
  if (totalDibayar >= efektifTagihan && efektifTagihan > 0) return 'lunas'
  if (totalDibayar > 0) return hariTerlambat > 0 ? 'terlambat' : 'sebagian'
  if (hariTerlambat > 0) return 'terlambat'
  return 'belum_bayar'
}

export default function LaporanPendapatan() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()

  const [viewMode, setViewMode] = useState<ViewMode>('detail')
  const [programHorizon, setProgramHorizon] = useState<ProgramHorizon>('ytd')
  const [programSort, setProgramSort] = useState<'no' | 'rkap' | 'pendapatan' | 'cashIn' | 'capaian' | 'kategori'>('no')
  const [programSortDir, setProgramSortDir] = useState<SortDir>('asc')
  const [filterKategori, setFilterKategori] = useState('all')
  const [editing, setEditing] = useState<{ id: string; field: string; value: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Filters ───────────────────────────────────────────────────────────────
  const tahunList = useMemo(() => {
    const years = new Set(allKompensasi.map(k => parseTglParts(k.tgl_jatuh_tempo).year))
    years.add(new Date().getFullYear())
    rkapRows.forEach(r => years.add(r.tahun))
    return Array.from(years).sort((a, b) => b - a)
  }, [allKompensasi, rkapRows])

  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [filterMitra, setFilterMitra] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [periodeMode, setPeriodeMode] = useState<PeriodeMode>('semua')
  const [selectedMonths, setSelectedMonths] = useState<number[]>([0,1,2,3,4,5,6,7,8,9,10,11])

  // ── Sort (default: laporan / tagihan terbaru dulu) ───────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('tglJatuhTempo')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const sortPreset = resolveSortPreset(sortKey, sortDir)

  const applySortPreset = (preset: SortPreset) => {
    const p = SORT_PRESETS.find(x => x.value === preset)
    if (!p) return
    setSortKey(p.key)
    setSortDir(p.dir)
  }

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
  }, [location.key])

  useEffect(() => {
    fetchRKAP(tahun)
  }, [tahun, location.key])

  // Keep tahun in sync when kompensasi loads
  useEffect(() => {
    if (tahunList.length && !tahunList.includes(tahun)) setTahun(tahunList[0])
  }, [tahunList])

  // ── Build rows ────────────────────────────────────────────────────────────
  const allRows = useMemo(() => {
    return allKompensasi
      .filter(k => parseTglParts(k.tgl_jatuh_tempo).year === tahun)
      .map(k => {
        const ks = daftarKS.find(x => x.id === k.ks_id) ?? k.kerja_sama
        const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
        const efektifTagihan = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
        const sisa = Math.max(0, efektifTagihan - totalDibayar)
        const denda = hitungDenda({
          nominal: k.nominal,
          tglJatuhTempo: k.tgl_jatuh_tempo,
          tglHariIni: new Date(),
          persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
          maksHariBayar: k.maks_hari_bayar ?? 30,
        })
        const status = resolveStatus(totalDibayar, efektifTagihan, denda.hariTerlambat)

        const pddm = daftarPDDM.find(p => p.ks_id === k.ks_id)
        const match = pddm
          ? allPengakuan.find(
              pp => pp.pddm_id === pddm.id && dateKey(pp.tgl_awal) === dateKey(k.tgl_jatuh_tempo),
            )
          : null

        return {
          id: k.id,
          ksId: k.ks_id,
          namaMitra: ks?.nama_mitra ?? '-',
          namaAset: (ks?.aset as any)?.nama_aset ?? '-',
          periodeLabel: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
          tglJatuhTempo: k.tgl_jatuh_tempo,
          tglBilling: k.tgl_jatuh_tempo,
          noPerjanjian: ks?.no_perjanjian ?? '-',
          noKontrakSAP: ks?.no_kontrak_sap ?? '-',
          noInvoice: k.no_invoice_sap ?? '-',
          noBilling: k.no_billing_sap ?? '-',
          totalTagihan: k.total_tagihan ?? 0,
          cashIn: totalDibayar,
          pendapatanAkrual: match?.nominal ?? k.nominal ?? 0,
          sisa,
          status,
        }
      })
  }, [allKompensasi, daftarKS, daftarPDDM, allPengakuan, tahun])

  // ── Mitra list for dropdown ───────────────────────────────────────────────
  const mitraList = useMemo(() => {
    const seen = new Map<string, string>()
    allRows.forEach(r => { if (r.ksId) seen.set(r.ksId, r.namaMitra) })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allRows])

  // ── Apply filters + sort ──────────────────────────────────────────────────
  const rows = useMemo(() => {
    let data = allRows

    if (filterMitra !== 'all') data = data.filter(r => r.ksId === filterMitra)
    if (filterStatus === 'lunas') data = data.filter(r => r.status === 'lunas')
    else if (filterStatus === 'belum_lunas') data = data.filter(r => r.status !== 'lunas')
    if (selectedMonths.length < 12) {
      data = data.filter(r => selectedMonths.includes(parseTglParts(r.tglJatuhTempo).month))
    }

    if (periodeMode === 'terbaru') {
      const latestByKs = new Map<string, string>()
      data.forEach(r => {
        const cur = latestByKs.get(r.ksId)
        if (!cur || r.tglJatuhTempo > cur) latestByKs.set(r.ksId, r.tglJatuhTempo)
      })
      data = data.filter(r => latestByKs.get(r.ksId) === r.tglJatuhTempo)
    }

    if (periodeMode === 'terdekat') {
      const todayTs = new Date().getTime()
      const nearestByKs = new Map<string, string>()
      data.forEach(r => {
        const cur = nearestByKs.get(r.ksId)
        if (!cur) { nearestByKs.set(r.ksId, r.tglJatuhTempo); return }
        const curDiff = Math.abs(new Date(cur).getTime() - todayTs)
        const newDiff = Math.abs(new Date(r.tglJatuhTempo).getTime() - todayTs)
        if (newDiff < curDiff) nearestByKs.set(r.ksId, r.tglJatuhTempo)
      })
      data = data.filter(r => nearestByKs.get(r.ksId) === r.tglJatuhTempo)
    }

    // Mode filter "terdekat" paksa urut tanggal naik; "terbaru" (hanya 1 baris/mitra) urut tanggal turun
    let effectiveSortKey: SortKey = sortKey
    let effectiveSortDir: SortDir = sortDir
    if (periodeMode === 'terdekat') {
      effectiveSortKey = 'tglJatuhTempo'
      effectiveSortDir = 'asc'
    } else if (periodeMode === 'terbaru' && sortKey === 'tglJatuhTempo') {
      effectiveSortDir = sortDir
    }

    const effectiveDir = effectiveSortDir === 'asc' ? 1 : -1
    data = [...data].sort((a, b) => {
      const cmpNum = (x: number, y: number) => (x - y) * effectiveDir
      const cmpStr = (x: string, y: string) => x.localeCompare(y, 'id') * effectiveDir
      const cmpDate = (x: string, y: string) =>
        (new Date(x).getTime() - new Date(y).getTime()) * effectiveDir

      // Periode label di-sort by tanggal JT (bukan abjad "Agustus"/"Januari")
      if (effectiveSortKey === 'periodeLabel' || effectiveSortKey === 'tglJatuhTempo') {
        const primary = cmpDate(a.tglJatuhTempo, b.tglJatuhTempo)
        if (primary !== 0) return primary
        return cmpStr(a.namaMitra, b.namaMitra)
      }
      if (effectiveSortKey === 'totalTagihan') return cmpNum(a.totalTagihan, b.totalTagihan)
      if (effectiveSortKey === 'cashIn') return cmpNum(a.cashIn, b.cashIn)
      if (effectiveSortKey === 'sisa') return cmpNum(a.sisa, b.sisa)
      if (effectiveSortKey === 'pendapatanAkrual') return cmpNum(a.pendapatanAkrual, b.pendapatanAkrual)
      if (effectiveSortKey === 'status') {
        const primary = cmpStr(STATUS_LABEL[a.status] ?? a.status, STATUS_LABEL[b.status] ?? b.status)
        if (primary !== 0) return primary
        return cmpDate(b.tglJatuhTempo, a.tglJatuhTempo) // secondary: terbaru
      }
      if (effectiveSortKey === 'namaMitra') {
        const primary = cmpStr(a.namaMitra, b.namaMitra)
        if (primary !== 0) return primary
        return cmpDate(b.tglJatuhTempo, a.tglJatuhTempo)
      }
      if (effectiveSortKey === 'namaAset') {
        const primary = cmpStr(a.namaAset, b.namaAset)
        if (primary !== 0) return primary
        return cmpDate(b.tglJatuhTempo, a.tglJatuhTempo)
      }
      return 0
    })

    return data
  }, [allRows, filterMitra, filterStatus, selectedMonths, periodeMode, sortKey, sortDir])

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalTagihan = rows.reduce((s, r) => s + r.totalTagihan, 0)
  const totalCashIn = rows.reduce((s, r) => s + r.cashIn, 0)
  const totalSisa = rows.reduce((s, r) => s + r.sisa, 0)
  const totalAkrual = rows.reduce((s, r) => s + r.pendapatanAkrual, 0)
  const pctTertagih = totalTagihan > 0 ? (totalCashIn / totalTagihan) * 100 : 0

  // ── Per Proker (format Optimalisasi Aset / LM) ────────────────────────────
  const programRowsRaw = useMemo(
    () =>
      buildProgramLaporanRows({
        rkapRows: rkapRows.filter(r => r.tahun === tahun),
        allKompensasi,
        daftarKS,
        daftarAset,
        tahun,
        horizon: programHorizon,
      }),
    [rkapRows, allKompensasi, daftarKS, daftarAset, tahun, programHorizon],
  )

  const kategoriList = useMemo(() => {
    const s = new Set(programRowsRaw.map(r => r.kategori))
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'id'))
  }, [programRowsRaw])

  const programRows = useMemo(() => {
    let data = programRowsRaw
    if (filterKategori !== 'all') data = data.filter(r => r.kategori === filterKategori)
    const dir = programSortDir === 'asc' ? 1 : -1
    data = [...data].sort((a, b) => {
      if (programSort === 'no') return (a.no - b.no) * dir
      if (programSort === 'rkap') return (a.rkap - b.rkap) * dir
      if (programSort === 'pendapatan') return (a.pendapatan - b.pendapatan) * dir
      if (programSort === 'cashIn') return (a.cashIn - b.cashIn) * dir
      if (programSort === 'capaian') {
        const av = a.capaianPct ?? -1
        const bv = b.capaianPct ?? -1
        return (av - bv) * dir
      }
      if (programSort === 'kategori') {
        const c = a.kategori.localeCompare(b.kategori, 'id') * dir
        if (c !== 0) return c
        return a.no - b.no
      }
      return 0
    })
    return data
  }, [programRowsRaw, filterKategori, programSort, programSortDir])

  const programSummary = useMemo(() => summarizeProgramRows(programRows), [programRows])

  // ── Sort toggle (klik header kolom) ───────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    // Periode → sort by tanggal
    const resolved = key === 'periodeLabel' ? 'tglJatuhTempo' : key
    if (sortKey === resolved || (key === 'periodeLabel' && sortKey === 'tglJatuhTempo')) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
      setSortKey(resolved)
    } else {
      // Default arah: tanggal/angka → desc (terbaru/terbesar dulu); teks → asc
      const defaultDesc: SortKey[] = ['tglJatuhTempo', 'totalTagihan', 'cashIn', 'sisa', 'pendapatanAkrual']
      setSortKey(resolved)
      setSortDir(defaultDesc.includes(resolved) ? 'desc' : 'asc')
    }
  }

  // ── Inline edit ───────────────────────────────────────────────────────────
  const startEdit = (id: string, field: string, current: string) =>
    setEditing({ id, field, value: current === '-' ? '' : current })
  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.field === 'no_invoice_sap' || editing.field === 'no_billing_sap') {
        await supabase.from('kompensasi').update({ [editing.field]: editing.value || null }).eq('id', editing.id)
        await fetchAllKompensasi()
      } else if (editing.field === 'no_kontrak_sap') {
        const row = rows.find(r => r.id === editing.id)
        if (row) {
          await supabase.from('kerja_sama').update({ no_kontrak_sap: editing.value || null }).eq('id', row.ksId)
          await fetchKS()
        }
      }
    } catch (e: any) {
      console.error('[LaporanPendapatan2] Gagal simpan:', e)
    }
    setEditing(null)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Laporan Pendapatan — {tahun}</h1>
          <p className="text-xs text-gray-500 mt-1">
            {viewMode === 'detail'
              ? 'Satu baris = satu tahap kompensasi · Urutkan lewat dropdown / klik header · Akrual = nominal NKM · Cash In = pembayaran'
              : 'Mode Per Proker = sheet Optimalisasi Aset (LM) · Satu baris = satu program aset · Pendapatan (JT) · Cash In (tgl bayar) · Capaian = Cash In ÷ RKAP'}
          </p>
        </div>

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
            onClick={() => setViewMode('program')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              viewMode === 'program' ? 'bg-[#1B4F72] text-white' : 'text-gray-600 hover:bg-gray-50',
            )}
            title="Format seperti sheet Optimalisasi Aset (LM)"
          >
            <Table2 size={14} />
            Per Proker (Optimalisasi Aset)
          </button>
        </div>
      </div>

      {/* ── Shared: Tahun ─────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-gray-400 shrink-0" />

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Tahun</label>
          <select
            value={tahun}
            onChange={e => setTahun(Number(e.target.value))}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            {tahunList.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {viewMode === 'program' && (
          <>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Cakupan</label>
              <select
                value={programHorizon}
                onChange={e => setProgramHorizon(e.target.value as ProgramHorizon)}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
              >
                <option value="ytd">YTD s.d. hari ini (mirip LM)</option>
                <option value="full_year">Full Year {tahun}</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Kategori</label>
              <select
                value={filterKategori}
                onChange={e => setFilterKategori(e.target.value)}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
              >
                <option value="all">Semua kategori</option>
                {kategoriList.map(k => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Urutkan</label>
              <select
                value={`${programSort}_${programSortDir}`}
                onChange={e => {
                  const [k, d] = e.target.value.split('_') as [typeof programSort, SortDir]
                  setProgramSort(k)
                  setProgramSortDir(d)
                }}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72] min-w-[150px]"
              >
                <option value="no_asc">No. program (LM)</option>
                <option value="kategori_asc">Kategori A→Z</option>
                <option value="rkap_desc">RKAP terbesar</option>
                <option value="pendapatan_desc">Pendapatan terbesar</option>
                <option value="cashIn_desc">Cash In terbesar</option>
                <option value="capaian_desc">Capaian tertinggi</option>
                <option value="capaian_asc">Capaian terendah</option>
              </select>
            </div>
          </>
        )}

        {viewMode === 'detail' && (
          <>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Mitra</label>
              <SearchableSelect
                className="h-8 text-xs min-w-[180px] max-w-[240px]"
                value={filterMitra === 'all' ? '' : filterMitra}
                onValueChange={v => setFilterMitra(v || 'all')}
                options={mitraList.map(([id, nama]) => ({
                  value: id,
                  label: nama,
                  searchText: nama,
                }))}
                placeholder="Semua Mitra"
                searchPlaceholder="Cari mitra..."
                allowClear
                clearLabel="Semua Mitra"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as StatusFilter)}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
              >
                <option value="all">Semua</option>
                <option value="belum_lunas">Belum Lunas</option>
                <option value="lunas">Lunas</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Tampilkan</label>
              <select
                value={periodeMode}
                onChange={e => {
                  const mode = e.target.value as PeriodeMode
                  setPeriodeMode(mode)
                  // Saat pilih filter periode, sesuaikan urutan default
                  if (mode === 'terbaru') {
                    setSortKey('tglJatuhTempo')
                    setSortDir('desc')
                  } else if (mode === 'terdekat') {
                    setSortKey('tglJatuhTempo')
                    setSortDir('asc')
                  }
                }}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
                title="Filter baris per mitra"
              >
                <option value="semua">Semua periode</option>
                <option value="terbaru">Hanya periode terbaru / mitra</option>
                <option value="terdekat">Hanya tagihan terdekat / mitra</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs text-gray-500 whitespace-nowrap">Urutkan</label>
              <select
                value={sortPreset}
                onChange={e => {
                  const v = e.target.value
                  if (v === 'custom') return
                  applySortPreset(v as SortPreset)
                }}
                className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72] min-w-[160px]"
                title="Urutan baris laporan (atau klik header kolom)"
              >
                {sortPreset === 'custom' && (
                  <option value="custom">Kustom (dari header kolom)</option>
                )}
                {SORT_PRESETS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <span className="ml-auto text-xs text-gray-400">
          {viewMode === 'detail' ? `${rows.length} baris` : `${programRows.length} program`}
        </span>
      </div>

      {viewMode === 'program' ? (
        <ProgramView
          rows={programRows}
          summary={programSummary}
          tahun={tahun}
          horizon={programHorizon}
          programSort={programSort}
          programSortDir={programSortDir}
          onSort={(key) => {
            if (programSort === key) setProgramSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
            else {
              setProgramSort(key)
              setProgramSortDir(key === 'no' || key === 'kategori' ? 'asc' : 'desc')
            }
          }}
        />
      ) : (
        <>
          {/* ── Month filter ──────────────────────────────────────────────── */}
          <div className="bg-white border rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium mr-1">Bulan:</span>
            {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((label, idx) => {
              const active = selectedMonths.includes(idx)
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedMonths(prev => {
                      if (prev.length === 12) return [idx]
                      if (active) {
                        if (prev.length === 1) return prev
                        return prev.filter(m => m !== idx)
                      }
                      return [...prev, idx].sort((a, b) => a - b)
                    })
                  }}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded-md border transition-colors select-none',
                    active
                      ? 'bg-[#1B4F72] text-white border-[#1B4F72] font-medium'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  )}
                >
                  {label}
                </button>
              )
            })}
            {selectedMonths.length < 12 && (
              <button
                onClick={() => setSelectedMonths([0,1,2,3,4,5,6,7,8,9,10,11])}
                className="ml-1 text-[10px] text-blue-600 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {/* ── Summary cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label="Total Tagihan" value={totalTagihan} color="text-gray-800" />
            <SummaryCard label="Cash In" value={totalCashIn} color="text-green-700" />
            <SummaryCard label="Outstanding" value={totalSisa} color="text-red-600" />
            <div className="bg-white rounded-xl border px-4 py-3">
              <p className="text-xs text-gray-500">% Tertagih</p>
              <p className="text-lg font-bold text-[#1B4F72] mt-0.5">{pctTertagih.toFixed(1)}%</p>
              <p className="text-[11px] text-gray-400">Akrual: {formatRupiah(totalAkrual)}</p>
            </div>
          </div>

          {/* ── Detail table ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="overflow-auto max-h-[70vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-50 text-gray-500 uppercase shadow-[0_1px_0_#e5e7eb]">
                    <th className="text-left px-3 py-2.5 w-6">#</th>
                    <SortTh label="Mitra" col="namaMitra" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Aset" col="namaAset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <SortTh label="Periode" col="periodeLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="text-left px-3 py-2.5">No Perjanjian</th>
                    <SortTh label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    <th className="text-left px-3 py-2.5">Tgl Billing</th>
                    <th className="text-left px-3 py-2.5">No Kontrak SAP</th>
                    <th className="text-left px-3 py-2.5">No Invoice SAP</th>
                    <th className="text-left px-3 py-2.5">No Billing SAP</th>
                    <SortTh label="Total Tagihan" col="totalTagihan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <SortTh label="Cash In" col="cashIn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-500">Pendapatan Akrual</th>
                    <SortTh label="Sisa" col="sisa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-4 py-8 text-center text-gray-400">
                        Tidak ada data untuk filter yang dipilih
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.namaMitra}</td>
                      <td className="px-3 py-2 text-gray-600">{row.namaAset}</td>
                      <td className="px-3 py-2 text-gray-600">{row.periodeLabel}</td>
                      <td className="px-3 py-2 text-gray-500">{row.noPerjanjian}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[row.status]}`}>
                          {STATUS_LABEL[row.status]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatTanggal(row.tglBilling)}</td>

                      <td className="px-3 py-2">
                        <EditableCell
                          value={row.noKontrakSAP}
                          isEditing={editing?.id === row.id && editing?.field === 'no_kontrak_sap'}
                          editValue={editing?.value ?? ''}
                          onStartEdit={() => startEdit(row.id, 'no_kontrak_sap', row.noKontrakSAP)}
                          onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          saving={saving}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={row.noInvoice}
                          isEditing={editing?.id === row.id && editing?.field === 'no_invoice_sap'}
                          editValue={editing?.value ?? ''}
                          onStartEdit={() => startEdit(row.id, 'no_invoice_sap', row.noInvoice)}
                          onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          saving={saving}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <EditableCell
                          value={row.noBilling}
                          isEditing={editing?.id === row.id && editing?.field === 'no_billing_sap'}
                          editValue={editing?.value ?? ''}
                          onStartEdit={() => startEdit(row.id, 'no_billing_sap', row.noBilling)}
                          onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                          onSave={saveEdit}
                          onCancel={cancelEdit}
                          saving={saving}
                        />
                      </td>

                      <td className="px-3 py-2 text-right">
                        <CurrencyDisplay value={row.totalTagihan} size="sm" />
                      </td>
                      <td className="px-3 py-2 text-right text-green-700">
                        <CurrencyDisplay value={row.cashIn} size="sm" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CurrencyDisplay value={row.pendapatanAkrual} size="sm" className="text-[#5B2C6F]" />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <CurrencyDisplay value={row.sisa} size="sm" className={row.sisa > 0 ? 'text-red-600' : 'text-gray-400'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                      <td colSpan={10} className="px-3 py-2.5 text-gray-700">Total ({rows.length} tagihan)</td>
                      <td className="px-3 py-2.5 text-right"><CurrencyDisplay value={totalTagihan} size="sm" /></td>
                      <td className="px-3 py-2.5 text-right text-green-700"><CurrencyDisplay value={totalCashIn} size="sm" /></td>
                      <td className="px-3 py-2.5 text-right text-[#5B2C6F]"><CurrencyDisplay value={totalAkrual} size="sm" /></td>
                      <td className="px-3 py-2.5 text-right text-red-600"><CurrencyDisplay value={totalSisa} size="sm" /></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Per Proker (Optimalisasi Aset / LM) view ─────────────────────────────────

type ProgramSortKey = 'no' | 'rkap' | 'pendapatan' | 'cashIn' | 'capaian' | 'kategori'

function ProgramSortTh({
  label, col, sortKey, sortDir, onSort, align = 'left',
}: {
  label: string
  col: ProgramSortKey
  sortKey: ProgramSortKey
  sortDir: SortDir
  onSort: (k: ProgramSortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <th
      className={cn(
        'px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap',
        align === 'right' ? 'text-right' : 'text-left',
      )}
      onClick={() => onSort(col)}
      title="Klik untuk urutkan"
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <ChevronsUpDown size={11} className="opacity-50" />}
      </span>
    </th>
  )
}

function ProgramView({
  rows,
  summary,
  tahun,
  horizon,
  programSort,
  programSortDir,
  onSort,
}: {
  rows: ProgramLaporanRow[]
  summary: ReturnType<typeof summarizeProgramRows>
  tahun: number
  horizon: ProgramHorizon
  programSort: ProgramSortKey
  programSortDir: SortDir
  onSort: (k: ProgramSortKey) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total RKAP" value={summary.rkap} color="text-gray-800" />
        <SummaryCard label="Pendapatan" value={summary.pendapatan} color="text-[#5B2C6F]" />
        <SummaryCard label="Realisasi Cash In" value={summary.cashIn} color="text-green-700" />
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-xs text-gray-500">Capaian Cash In</p>
          <p className="text-lg font-bold text-[#1B4F72] mt-0.5">
            {summary.capaianPct != null ? `${summary.capaianPct.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-gray-400">
            {horizon === 'ytd' ? `YTD s.d. hari ini · ${tahun}` : `Full year ${tahun}`}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-2.5 border-b bg-gray-50 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-gray-800">Optimalisasi Aset — Per Proker</p>
            <p className="text-[11px] text-gray-500">
              Format LM: No · Kategori · Program Aset · RKAP · Pendapatan · Cash In · Capaian % · Proses Mitra · Monitoring.
              {' '}Pendapatan = Σ nominal NKM (JT) · Cash In = Σ pembayaran (tgl bayar).
            </p>
          </div>
          {rows.some(r => r.isOrphan) && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
              Ada proker di luar master RKAP
            </span>
          )}
        </div>
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#1B4F72] text-white shadow-[0_1px_0_#e5e7eb]">
                <ProgramSortTh label="No." col="no" sortKey={programSort} sortDir={programSortDir} onSort={onSort} />
                <ProgramSortTh label="Kategori" col="kategori" sortKey={programSort} sortDir={programSortDir} onSort={onSort} />
                <th className="text-left px-3 py-2.5 font-semibold min-w-[180px]">Program Aset</th>
                <ProgramSortTh label="RKAP (Rp)" col="rkap" sortKey={programSort} sortDir={programSortDir} onSort={onSort} align="right" />
                <ProgramSortTh label="Pendapatan (Rp)" col="pendapatan" sortKey={programSort} sortDir={programSortDir} onSort={onSort} align="right" />
                <ProgramSortTh label="Realisasi Cash In (Rp)" col="cashIn" sortKey={programSort} sortDir={programSortDir} onSort={onSort} align="right" />
                <ProgramSortTh label="Capaian Cash In (%)" col="capaian" sortKey={programSort} sortDir={programSortDir} onSort={onSort} align="right" />
                <th className="text-left px-3 py-2.5 font-semibold min-w-[160px]">Proses Pencarian Mitra</th>
                <th className="text-left px-3 py-2.5 font-semibold min-w-[160px]">Monitoring Kerja Sama</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                    Belum ada data RKAP / program untuk tahun {tahun}. Isi master RKAP terlebih dahulu.
                  </td>
                </tr>
              )}
              {rows.map(row => (
                <tr
                  key={row.key}
                  className={cn(
                    'hover:bg-gray-50 align-top',
                    row.isOrphan && 'bg-amber-50/40',
                    row.pendapatan === 0 && row.cashIn === 0 && row.rkap === 0 && 'opacity-70',
                  )}
                >
                  <td className="px-3 py-2.5 text-gray-400">{row.no}</td>
                  <td className="px-3 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700">
                      {row.kategori}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-800">{row.programAset}</p>
                    {row.kode && <p className="text-[10px] text-gray-400 mt-0.5">{row.kode}</p>}
                    {row.isOrphan && (
                      <p className="text-[10px] text-amber-600 mt-0.5">Di luar master RKAP</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <CurrencyDisplay value={row.rkap} size="sm" className="text-gray-700" />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <CurrencyDisplay
                      value={row.pendapatan}
                      size="sm"
                      className={row.pendapatan > 0 ? 'text-[#5B2C6F] font-medium' : 'text-gray-400'}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <CurrencyDisplay
                      value={row.cashIn}
                      size="sm"
                      className={row.cashIn > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {row.capaianPct == null ? (
                      <span className="text-gray-300">—</span>
                    ) : (
                      <span
                        className={cn(
                          'inline-block min-w-[3.5rem] px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums',
                          row.capaianPct >= 100
                            ? 'bg-green-100 text-green-800'
                            : row.capaianPct >= 50
                              ? 'bg-amber-100 text-amber-800'
                              : row.capaianPct > 0
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-500',
                        )}
                      >
                        {row.capaianPct.toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 leading-snug max-w-[220px]">
                    {row.prosesMitra}
                  </td>
                  <td className="px-3 py-2.5 text-gray-600 leading-snug max-w-[220px]">
                    {row.monitoring}
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                  <td colSpan={3} className="px-3 py-2.5 text-gray-800">Jumlah</td>
                  <td className="px-3 py-2.5 text-right">
                    <CurrencyDisplay value={summary.rkap} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#5B2C6F]">
                    <CurrencyDisplay value={summary.pendapatan} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-green-700">
                    <CurrencyDisplay value={summary.cashIn} size="sm" />
                  </td>
                  <td className="px-3 py-2.5 text-right text-[#1B4F72]">
                    {summary.capaianPct != null ? `${summary.capaianPct.toFixed(1)}%` : '—'}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color} mt-0.5`}>{formatRupiah(value)}</p>
    </div>
  )
}

// ─── Sortable TH ─────────────────────────────────────────────────────────────

function SortTh({ label, col, sortKey, sortDir, onSort, align = 'left' }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; align?: 'left' | 'right'
}) {
  // Periode header maps to tglJatuhTempo sort
  const active =
    sortKey === col ||
    (col === 'periodeLabel' && sortKey === 'tglJatuhTempo') ||
    (col === 'tglJatuhTempo' && sortKey === 'periodeLabel')
  return (
    <th
      className={`px-3 py-2.5 cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(col)}
      title="Klik untuk urutkan"
    >
      <span className={`inline-flex items-center gap-1 ${active ? 'text-[#1B4F72]' : ''}`}>
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  )
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditableCell({ value, isEditing, editValue, onStartEdit, onChange, onSave, onCancel, saving }: {
  value: string; isEditing: boolean; editValue: string
  onStartEdit: () => void; onChange: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  return (
    <div
      className={`cursor-pointer py-0.5 px-1 -mx-1 rounded text-xs ${isEditing ? 'ring-1 ring-[#1B4F72] bg-white' : 'hover:bg-gray-100'}`}
      onClick={() => !isEditing && onStartEdit()}
      title="Klik untuk edit"
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') onCancel() }}
          onBlur={onSave}
          className="w-full outline-none bg-transparent text-xs text-gray-700"
          disabled={saving}
          style={{ minWidth: '80px' }}
        />
      ) : (
        <span className={value === '-' ? 'text-gray-300' : 'text-gray-700'}>{value}</span>
      )}
    </div>
  )
}
