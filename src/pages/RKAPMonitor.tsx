import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import * as XLSX from 'xlsx'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useCashInStore } from '@/store/cashInStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore, rowToRKAPItem, BULAN_COLS, RKAPTargetRow } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { BULAN_LABELS } from '@/data/rkap2026'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { hitungRKAP, getCashInPerBulanByYear, getPendapatanPerBulanByYear, getPendapatanPerKode, MonthSummary } from '@/utils/rkapUtils'
import { RKAPItem } from '@/data/rkap2026'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatRupiah } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Target, TrendingUp, AlertTriangle, CheckCircle, Plus, Pencil, Trash2, Upload, Download, ChevronLeft, ChevronRight, FileDown, X, Search, ChevronsUpDown, Check, Ban, CirclePlay } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// ── Excel export ──────────────────────────────────────────────────────────────
function exportRKAPExcel(
  tahun: number,
  rkapDataCashIn: MonthSummary[],
  rkapItems: RKAPItem[],
  totalTarget: number,
  efektifBulan: number,   // bulan terakhir yang sudah berjalan (0–11), -1 jika tahun depan
  cashInPerNama: Record<string, number[]>, // NEW PARAMETER
  rkapDataPendapatan?: MonthSummary[],
  pendapatanPerNama?: Record<string, number[]>,
  nonaktifCashIn?: Set<string>,
  nonaktifPsak?: Set<string>,
) {
  const nonaktifCI = nonaktifCashIn ?? new Set<string>()
  const nonaktifPD = nonaktifPsak ?? new Set<string>()
  const wb = XLSX.utils.book_new()
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmt = (v: number | null) => v != null && v !== 0 ? v : null
  const pct = (v: number, t: number) => t > 0 ? +((v / t) * 100).toFixed(1) : null

  const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

  // ── Helper: build ringkasan sheet ─────────────────────────────────────────
  function buildRingkasanSheet(
    data: MonthSummary[],
    titleLabel: string,
    sheetName: string,
    realisasiLabel: string,
  ) {
    const ytdReal = data.slice(0, efektifBulan + 1).reduce((s, m) => s + m.realisasi, 0)
    const ytdTarget = data.slice(0, efektifBulan + 1).reduce((s, m) => s + m.targetOriginal, 0)
    const carryAktif = data[efektifBulan]?.carryOver ?? 0
    const totalProg = data.reduce((s, m) => s + m.prognosa, 0)

    const sh: any[][] = [
      [`RKAP Monitor ${tahun} — ${titleLabel}`],
      [`Diekspor pada: ${now}`],
      [],
      ['Bulan', 'Target RKAP (Rp)', 'Carry-over (Rp)', 'Target Disesuaikan (Rp)',
        `${realisasiLabel} (Rp)`, 'Selisih (Rp)', 'Achievement (%)', 'Prognosa (Rp)', 'Status'],
    ]
    data.forEach((m, i) => {
      const past = i < efektifBulan
      const current = i === efektifBulan
      const status = past ? (m.selisih >= 0 ? 'Tercapai' : 'Tidak Tercapai (carry-over)')
        : current ? 'Berjalan'
          : '—'
      sh.push([
        m.label,
        fmt(m.targetOriginal),
        fmt(m.carryOver),
        fmt(m.targetAdjusted),
        fmt(m.realisasi),
        (past || current) ? m.selisih : null,
        m.targetAdjusted > 0 ? pct(m.realisasi, m.targetAdjusted) : null,
        fmt(m.prognosa),
        status,
      ])
    })

    sh.push(
      [],
      ['TOTAL', fmt(totalTarget), null, fmt(totalTarget),
        fmt(data.reduce((s, m) => s + m.realisasi, 0)), null,
        pct(ytdReal, ytdTarget), fmt(totalProg), ''],
      [],
      [`Carry-over aktif: ${carryAktif > 0 ? formatRupiah(carryAktif) : 'Tidak ada'}`],
      ['Prognosa = realisasi bulan yang telah lewat/berjalan, dan target RKAP original untuk bulan-bulan mendatang.'],
    )

    const ws = XLSX.utils.aoa_to_sheet(sh)
    ws['!cols'] = [14, 22, 18, 26, 26, 20, 16, 22, 26].map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // ── Helper: build prognosa per obyek sheet ─────────────────────────────────
  function buildPerObyekSheet(
    perNama: Record<string, number[]>,
    titleLabel: string,
    sheetName: string,
    nonaktif: Set<string> = new Set(),
  ) {
    const sh: any[][] = [
      [`${titleLabel} ${tahun} (Rp)`],
      [`Diekspor pada: ${now}`],
      [],
      ['No', 'ID Monika', 'Obyek Kerjasama', ...BL, 'Total Prognosa'],
    ]

    let totalProgObjek = 0
    const prognosaPerBulanAll = Array(12).fill(0)

    rkapItems.forEach(item => {
      const realPerBulan = perNama[item.kode ?? ''] ?? perNama[item.nama] ?? Array(12).fill(0)
      const isNonaktif = !!(item.kode && nonaktif.has(item.kode))
      const progBulan = item.bulan.map((target, i) => {
        const isFuture = i > efektifBulan
        const isCurrent = i === efektifBulan
        // Nonaktif: prognosa masa depan = 0, bulan lewat tetap realisasi
        const prog = isNonaktif && (isFuture || isCurrent) ? 0
          : isFuture ? target
          : isCurrent ? Math.max(realPerBulan[i], target)
          : realPerBulan[i]
        prognosaPerBulanAll[i] += prog
        return prog
      })
      const totalProg = progBulan.reduce((s, v) => s + v, 0)
      totalProgObjek += totalProg
      sh.push([item.no, item.kode, item.nama, ...progBulan.map(fmt), fmt(totalProg)])
    })

    sh.push(
      [],
      ['', '', 'TOTAL', ...prognosaPerBulanAll.map(fmt), fmt(totalProgObjek)],
    )

    const ws = XLSX.utils.aoa_to_sheet(sh)
    ws['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 42 }, ...BL.map(() => ({ wch: 16 })), { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
  }

  // ── Sheet 1: Ringkasan Prognosa Cash In ────────────────────────────────────
  buildRingkasanSheet(rkapDataCashIn, 'Laporan Prognosa Cash In', `Ringkasan Cash In ${tahun}`, 'Realisasi / Cash In')

  // ── Sheet 2: Target Per Obyek ──────────────────────────────────────────────
  const sh2: any[][] = [
    [`Target RKAP per Obyek Kerjasama ${tahun} (Rp)`],
    [`Diekspor pada: ${now}`],
    [],
    ['No', 'ID Monika', 'Obyek Kerjasama', ...BL, 'Total'],
  ]
  rkapItems.forEach(item =>
    sh2.push([item.no, item.kode, item.nama, ...item.bulan.map(fmt), fmt(item.total)])
  )
  sh2.push(
    [],
    ['', '', 'TOTAL',
      ...BL.map((_, i) => fmt(rkapItems.reduce((s, it) => s + (it.bulan[i] ?? 0), 0))),
      fmt(totalTarget),
    ],
  )

  const ws2 = XLSX.utils.aoa_to_sheet(sh2)
  ws2['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 42 }, ...BL.map(() => ({ wch: 16 })), { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws2, `Target Per Obyek ${tahun}`)

  // ── Sheet 3: Prognosa Per Obyek Cash In ────────────────────────────────────
  buildPerObyekSheet(cashInPerNama, 'Prognosa Per Obyek Cash In', `Prog Cash In Per Obyek ${tahun}`, nonaktifCI)

  // ── Sheet 4: Ringkasan Prognosa Pendapatan (PSAK 73) ───────────────────────
  if (rkapDataPendapatan) {
    buildRingkasanSheet(rkapDataPendapatan, 'Laporan Prognosa Pendapatan (PSAK 73)', `Ringkasan Pendapatan ${tahun}`, 'Realisasi / Pendapatan')
  }

  // ── Sheet 5: Prognosa Per Obyek Pendapatan (PSAK 73) ───────────────────────
  if (pendapatanPerNama) {
    buildPerObyekSheet(pendapatanPerNama, 'Prognosa Per Obyek Pendapatan (PSAK 73)', `Prog Pendapatan Per Obyek ${tahun}`, nonaktifPD)
  }

  XLSX.writeFile(wb, `RKAP_Prognosa_${tahun}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── Helper: fetch RKAP for arbitrary year (tanpa ubah store) ─────────────────
async function fetchRKAPForYear(tahun: number): Promise<RKAPTargetRow[]> {
  const { data } = await supabase
    .from('rkap_target')
    .select('*')
    .eq('tahun', tahun)
    .order('no', { ascending: true })
  return (data ?? []) as RKAPTargetRow[]
}

// ── Helper: ambil daftar objek unik dari tahun sebelumnya ─────────────────────
async function fetchPreviousRKAPObjects(currentTahun: number): Promise<{ kode: string; nama: string }[]> {
  if (currentTahun <= 0) return []
  const { data } = await supabase
    .from('rkap_target')
    .select('kode, nama, tahun')
    .lt('tahun', currentTahun)
    .not('kode', 'is', null)
    .neq('kode', '')
    .order('tahun', { ascending: false })

  if (!data) return []
  const seen = new Set<string>()
  const unique: { kode: string; nama: string }[] = []
  for (const item of data as { kode: string; nama: string; tahun: number }[]) {
    if (!seen.has(item.kode)) {
      seen.add(item.kode)
      unique.push({ kode: item.kode, nama: item.nama })
    }
  }
  return unique.sort((a, b) => a.kode.localeCompare(b.kode))
}

// ── Helper: realisasi per kode for arbitrary year (cash-in) ──────────────────
function getRealisasiPerKode(
  allKompensasi: { rkap_kode: string | null; pembayaran?: { tgl_bayar: string; nominal_bayar: number }[] }[],
  allCashIn: { rkap_kode: string | null; tgl_terima: string; nominal: number }[],
  tahun: number
): Record<string, number[]> {
  const byKey: Record<string, number[]> = {}
  allKompensasi.forEach(k => {
    const key = k.rkap_kode
    if (!key) return
    if (!byKey[key]) byKey[key] = Array(12).fill(0)
    ;(k.pembayaran ?? []).forEach(p => {
      const d = new Date(p.tgl_bayar)
      if (d.getFullYear() === tahun) byKey[key][d.getMonth()] += p.nominal_bayar
    })
  })
  allCashIn.forEach(ci => {
    const key = ci.rkap_kode
    if (!key) return
    if (!byKey[key]) byKey[key] = Array(12).fill(0)
    const d = new Date(ci.tgl_terima)
    if (d.getFullYear() === tahun) byKey[key][d.getMonth()] += ci.nominal
  })
  return byKey
}

// ── Export Perbandingan Multi-Tahun ───────────────────────────────────────────

interface PerbandinganRow {
  no: number
  kode: string
  nama: string
  realisasiPrev: number
  rkapCur: number
  progCur: number
  rkapNxt: number
}

async function fetchPerbandinganData(
  tahun: number,
  rkapItems: RKAPItem[],
  basis: 'cash_in' | 'pendapatan',
  cashInPerNama: Record<string, number[]>,
  pendapatanPerNama: Record<string, number[]>,
  allKompensasi: any[],
  allCashIn: any[],
  allPengakuan: any[],
  daftarPDDM: any[],
  efektifBulan: number,
  nonaktifKodes: Set<string>,
): Promise<{ rows: PerbandinganRow[]; total: PerbandinganRow; tahunPrev: number; tahunNext: number; basisLabel: string }> {
  const tahunPrev = tahun - 1
  const tahunNext = tahun + 1
  const basisLabel = basis === 'cash_in' ? 'Cash In' : 'Pendapatan (PSAK 73)'

  const [rowsPrev, rowsNext] = await Promise.all([
    fetchRKAPForYear(tahunPrev),
    fetchRKAPForYear(tahunNext),
  ])
  const itemsPrev = rowsPrev.map(rowToRKAPItem)
  const itemsNext = rowsNext.map(rowToRKAPItem)

  const allKodes = new Set<string>()
  rkapItems.forEach(it => { if (it.kode) allKodes.add(it.kode) })
  itemsPrev.forEach(it => { if (it.kode) allKodes.add(it.kode) })
  itemsNext.forEach(it => { if (it.kode) allKodes.add(it.kode) })
  const kodeList = Array.from(allKodes).sort()

  const realisasiPrevPerKode: Record<string, number[]> = basis === 'cash_in'
    ? getRealisasiPerKode(allKompensasi, allCashIn, tahunPrev)
    : getPendapatanPerKode(allPengakuan, daftarPDDM, allKompensasi, tahunPrev)

  const activePerNama = basis === 'cash_in' ? cashInPerNama : pendapatanPerNama
  const prognosaPerKode: Record<string, number[]> = {}
  rkapItems.forEach(item => {
    const key = item.kode
    if (!key) return
    const real = activePerNama[key] ?? Array(12).fill(0)
    const isNonaktif = nonaktifKodes.has(key)
    prognosaPerKode[key] = item.bulan.map((target, i) => {
      const isFuture = i > efektifBulan
      const isCurrent = i === efektifBulan
      if (isNonaktif && (isFuture || isCurrent)) return 0
      if (isFuture) return target
      if (isCurrent) return Math.max(real[i], target)
      return real[i]
    })
  })

  function getBulan(items: RKAPItem[], kode: string): number[] {
    const found = items.find(it => it.kode === kode)
    return found ? found.bulan : Array(12).fill(0)
  }

  let tRealisasi = 0, tRKAP = 0, tPrognosa = 0, tRKAPNext = 0
  const rows: PerbandinganRow[] = kodeList.map((kode, idx) => {
    const nama = rkapItems.find(it => it.kode === kode)?.nama
      ?? itemsPrev.find(it => it.kode === kode)?.nama
      ?? itemsNext.find(it => it.kode === kode)?.nama
      ?? kode

    const realisasiPrev = (realisasiPrevPerKode[kode] ?? Array(12).fill(0)).reduce((s: number, v: number) => s + v, 0)
    const rkapCur = getBulan(rkapItems, kode).reduce((s, v) => s + v, 0)
    const progCur = (prognosaPerKode[kode] ?? Array(12).fill(0)).reduce((s: number, v: number) => s + v, 0)
    const rkapNxt = getBulan(itemsNext, kode).reduce((s, v) => s + v, 0)

    tRealisasi += realisasiPrev
    tRKAP += rkapCur
    tPrognosa += progCur
    tRKAPNext += rkapNxt

    return { no: idx + 1, kode, nama, realisasiPrev, rkapCur, progCur, rkapNxt }
  })

  return {
    rows,
    total: { no: 0, kode: '', nama: 'TOTAL', realisasiPrev: tRealisasi, rkapCur: tRKAP, progCur: tPrognosa, rkapNxt: tRKAPNext },
    tahunPrev,
    tahunNext,
    basisLabel,
  }
}

function downloadPerbandinganExcel(
  data: { rows: PerbandinganRow[]; total: PerbandinganRow; tahunPrev: number; tahunNext: number; basisLabel: string },
  tahun: number,
) {
  const wb = XLSX.utils.book_new()
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const fmt = (v: number | null) => v != null && v !== 0 ? v : null

  const sh: any[][] = [
    [`Perbandingan RKAP ${data.tahunPrev}–${data.tahunNext} — Basis: ${data.basisLabel}`],
    [`Diekspor pada: ${now}`],
    [],
    ['No', 'ID Monika', 'Obyek Kerjasama', `Realisasi ${data.tahunPrev}`, `RKAP ${tahun}`, `Prognosa ${tahun}`, `RKAP ${data.tahunNext}`],
  ]

  data.rows.forEach(r => {
    sh.push([r.no, r.kode, r.nama, fmt(r.realisasiPrev), fmt(r.rkapCur), fmt(r.progCur), fmt(r.rkapNxt)])
  })

  sh.push(
    [],
    ['', '', 'TOTAL', fmt(data.total.realisasiPrev), fmt(data.total.rkapCur), fmt(data.total.progCur), fmt(data.total.rkapNxt)],
  )

  const ws = XLSX.utils.aoa_to_sheet(sh)
  ws['!cols'] = [
    { wch: 5 }, { wch: 10 }, { wch: 48 },
    { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, `Perbandingan ${data.tahunPrev}-${data.tahunNext}`)

  XLSX.writeFile(wb, `RKAP_Perbandingan_${data.tahunPrev}-${data.tahunNext}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseRKAPCsv(text: string, tahun: number): Array<Omit<RKAPTargetRow, 'id' | 'created_at'>> {
  const lines = text.trim().split(/\r?\n/)
  const results: Array<Omit<RKAPTargetRow, 'id' | 'created_at'>> = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length < 15) continue
    const no = parseInt(cols[0])
    if (isNaN(no) || no <= 0) continue
    const nama = cols[1].trim()
    if (!nama) continue
    const toRp = (v: string) => (parseFloat(v) || 0) * 1_000 // CSV dalam ribuan Rp
    // Format CSV: No, Nama, Jan, Feb, ..., Des, Total  (bulan di col[2..13], total di col[14])
    const [jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des] = cols.slice(2, 14).map(toRp)
    const total = toRp(cols[14]) || [jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des].reduce((a, b) => a + b, 0)
    results.push({ tahun, no, nama, total, jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des })
  }
  return results
}

// ── Form schema ───────────────────────────────────────────────────────────────
const bulanField = z.coerce.number().min(0).default(0)
const rowSchema = z.object({
  no: z.coerce.number().min(1, 'Wajib diisi'),
  /** ID Monika = kode aset master — tidak boleh kosong / free-text semena-mena */
  kode: z.string().trim().min(1, 'ID Monika wajib dipilih dari master aset'),
  basis: z.enum(['cash_in', 'pendapatan']).default('cash_in'),
  nama: z.string().min(1, 'Wajib diisi'),
  jan: bulanField, feb: bulanField, mar: bulanField, apr: bulanField,
  mei: bulanField, jun: bulanField, jul: bulanField, agu: bulanField,
  sep: bulanField, okt: bulanField, nov: bulanField, des: bulanField,
})
type RowForm = z.infer<typeof rowSchema>

// ── Warna pct ─────────────────────────────────────────────────────────────────
function pctColor(pct: number) {
  if (pct >= 100) return 'text-green-700'
  if (pct >= 80) return 'text-yellow-600'
  return 'text-red-600'
}

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth()

// ── Komponen utama ────────────────────────────────────────────────────────────
export function RKAPMonitor() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPendapatan } = usePendapatanStore()
  const { rows, tahunAktif, isLoading, fetchRKAP, upsertRow, deleteRow, bulkImport, setTahunAktif } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RKAPTargetRow | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [previousRKAPItems, setPreviousRKAPItems] = useState<{ kode: string; nama: string }[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [csvPreview, setCsvPreview] = useState<{ count: number; rows: ReturnType<typeof parseRKAPCsv> } | null>(null)
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // State untuk dialog breakdown cash-in per proker
  const [breakdownKode, setBreakdownKode] = useState<string | null>(null)
  const [breakdownNama, setBreakdownNama] = useState('')

  // Toggle prognosa type
  const [prognosaType, setPrognosaType] = useState<'cash_in' | 'pendapatan'>('cash_in')

  // Preview perbandingan
  const [perbandinganOpen, setPerbandinganOpen] = useState(false)
  const [perbandinganData, setPerbandinganData] = useState<Awaited<ReturnType<typeof fetchPerbandinganData>> | null>(null)
  const [perbandinganLoading, setPerbandinganLoading] = useState(false)

  // Nonaktif proker — terpisah per mode (Cash In vs PSAK 73)
  const [nonaktifCashIn, setNonaktifCashIn] = useState<Set<string>>(new Set())
  const [nonaktifPsak, setNonaktifPsak] = useState<Set<string>>(new Set())

  const nonaktifAktif = prognosaType === 'cash_in' ? nonaktifCashIn : nonaktifPsak
  const setNonaktifAktif = prognosaType === 'cash_in' ? setNonaktifCashIn : setNonaktifPsak

  const toggleNonaktif = (kode: string) => {
    setNonaktifAktif(prev => {
      const next = new Set(prev)
      if (next.has(kode)) next.delete(kode)
      else next.add(kode)
      return next
    })
  }

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<RowForm>({
    resolver: zodResolver(rowSchema),
    defaultValues: { no: rows.length + 1 },
  })

  useEffect(() => { fetchAllKompensasi() }, [])
  useEffect(() => { fetchAllCashIn() }, [])
  useEffect(() => { fetchPendapatan() }, [])
  useEffect(() => { fetchAset() }, [])
  useEffect(() => { fetchRKAP(tahunAktif) }, [tahunAktif])

  const monikaOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; searchText: string; description?: string }>()
    daftarAset.forEach(a => {
      const k = a.kode_aset?.trim()
      if (!k) return
      map.set(k, {
        value: k,
        label: `${k} — ${a.nama_aset}`,
        searchText: `${k} ${a.nama_aset} ${a.alamat ?? ''}`,
        description: a.alamat ?? undefined,
      })
    })
    // Sertakan ID Monika yang sudah ada di RKAP (jika belum di master aset)
    rows.forEach(r => {
      const k = r.kode?.trim()
      if (!k || map.has(k)) return
      map.set(k, {
        value: k,
        label: `${k} — ${r.nama} (dari RKAP)`,
        searchText: `${k} ${r.nama}`,
        description: 'Ada di RKAP; daftarkan ke Data Aset jika belum ada',
      })
    })
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'id'))
  }, [daftarAset, rows])

  const asetByMonika = useMemo(() => {
    const m = new Map<string, string>()
    daftarAset.forEach(a => {
      const k = a.kode_aset?.trim()
      if (k) m.set(k, a.nama_aset)
    })
    return m
  }, [daftarAset])

  const rkapMissingMonika = useMemo(
    () => rows.filter(r => !r.kode?.trim()),
    [rows],
  )

  // ── Computed data ──────────────────────────────────────────────────────────
  const rkapItems = useMemo(() => rows.map(rowToRKAPItem), [rows])

  const cashIn = useMemo(() =>
    getCashInPerBulanByYear(allKompensasi, tahunAktif, allCashIn),
    [allKompensasi, tahunAktif, allCashIn]
  )

  const pendapatanPerBulan = useMemo(() =>
    getPendapatanPerBulanByYear(allPengakuan, tahunAktif),
    [allPengakuan, tahunAktif]
  )

  // Bulan terakhir yang sudah "berjalan" — tergantung tahun yang sedang dilihat
  const efektifBulan = tahunAktif < CURRENT_YEAR ? 11
    : tahunAktif === CURRENT_YEAR ? CURRENT_MONTH
      : -1

  // Items aktif per mode — nonaktif Cash In ≠ nonaktif PSAK 73
  const activeItemsCashIn = useMemo(
    () => rkapItems.filter(item => !nonaktifCashIn.has(item.kode)),
    [rkapItems, nonaktifCashIn]
  )
  const activeItemsPsak = useMemo(
    () => rkapItems.filter(item => !nonaktifPsak.has(item.kode)),
    [rkapItems, nonaktifPsak]
  )

  const rkapDataCashIn = useMemo(
    () => hitungRKAP(activeItemsCashIn, cashIn, efektifBulan),
    [activeItemsCashIn, cashIn, efektifBulan]
  )

  const rkapDataPendapatan = useMemo(
    () => hitungRKAP(activeItemsPsak, pendapatanPerBulan, efektifBulan),
    [activeItemsPsak, pendapatanPerBulan, efektifBulan]
  )

  const rkapData = prognosaType === 'cash_in' ? rkapDataCashIn : rkapDataPendapatan
  const activeRealisasiPerBulan = prognosaType === 'cash_in' ? cashIn : pendapatanPerBulan

  const totalTarget = useMemo(() => rkapItems.reduce((s, i) => s + i.total, 0), [rkapItems])

  const ytdTargetOri = rkapData.slice(0, efektifBulan + 1).reduce((s, m) => s + m.targetOriginal, 0)
  const ytdRealisasi = activeRealisasiPerBulan.slice(0, efektifBulan + 1).reduce((s, v) => s + v, 0)
  const ytdAchievement = ytdTargetOri > 0 ? (ytdRealisasi / ytdTargetOri) * 100 : 0
  const currentCarryOver = rkapData[efektifBulan]?.carryOver ?? 0
  // Prognosa tahunan = realisasi bulan lewat + target(+carry-over) bulan mendatang
  const totalPrognosa = rkapData.reduce((s, m) => s + m.prognosa, 0)
  const totalPrognosaPendapatan = rkapDataPendapatan.reduce((s, m) => s + m.prognosa, 0)

  const chartData = rkapData.map(m => ({
    bulan: m.label,
    'Target RKAP': Math.round(m.targetOriginal / 1_000_000),
    'Target + C/O': Math.round(m.targetAdjusted / 1_000_000),
    'Realisasi': Math.round(m.realisasi / 1_000_000),
    'Prognosa': Math.round(m.prognosa / 1_000_000),
  }))

  // Agregasi realisasi per kode RKAP per bulan (untuk tabel per obyek)
  // Prioritas: rkap_kode pada kompensasi → fallback nama_aset (untuk data lama)
  const cashInPerNama = useMemo(() => {
    const byKey: Record<string, number[]> = {}
    allKompensasi.forEach(k => {
      const rkapKode = (k as any).rkap_kode as string | null | undefined
      const namaAset = (k.kerja_sama as any)?.aset?.nama_aset as string | undefined
      const key = rkapKode || namaAset
      if (!key) return
      if (!byKey[key]) byKey[key] = Array(12).fill(0)
        ; (k.pembayaran ?? []).forEach(p => {
          const d = new Date(p.tgl_bayar)
          if (d.getFullYear() === tahunAktif) {
            byKey[key][d.getMonth()] += p.nominal_bayar
          }
        })
    })
    allCashIn.forEach(ci => {
      const namaAset = (ci.kerja_sama as any)?.aset?.nama_aset as string | undefined
      if (!namaAset) return
      const d = new Date(ci.tgl_terima)
      if (d.getFullYear() === tahunAktif) {
        if (!byKey[namaAset]) byKey[namaAset] = Array(12).fill(0)
        byKey[namaAset][d.getMonth()] += ci.nominal
      }
    })
    return byKey
  }, [allKompensasi, allCashIn, tahunAktif])

  // Agregasi pendapatan diakui per rkap_kode per bulan (untuk tabel & Excel)
  const pendapatanPerNama = useMemo(() => {
    const byKey: Record<string, number[]> = {}
    allPengakuan
      .filter(pp => pp.status === 'diakui')
      .forEach(pp => {
        const pddm = daftarPDDM.find(p => p.id === pp.pddm_id)
        if (!pddm?.ks_id) return
        const komp = allKompensasi.find(
          k => k.ks_id === pddm.ks_id && k.tgl_jatuh_tempo === pp.tgl_awal
        )
        const key = komp?.rkap_kode
        if (!key) return
        if (!byKey[key]) byKey[key] = Array(12).fill(0)
        const d = new Date(pp.tgl_awal)
        if (d.getFullYear() === tahunAktif) {
          byKey[key][d.getMonth()] += pp.nominal
        }
      })
    return byKey
  }, [allPengakuan, daftarPDDM, allKompensasi, tahunAktif])

  const activePerNama = prognosaType === 'cash_in' ? cashInPerNama : pendapatanPerNama

  // ── Helpers form ──────────────────────────────────────────────────────────
  const openAdd = async () => {
    setEditTarget(null)
    reset({
      no: (rows.length > 0 ? Math.max(...rows.map(r => r.no)) + 1 : 1),
      kode: '', basis: 'cash_in' as const, nama: '',
      jan: 0, feb: 0, mar: 0, apr: 0,
      mei: 0, jun: 0, jul: 0, agu: 0,
      sep: 0, okt: 0, nov: 0, des: 0,
    })
    setSearchQuery('')
    setDropdownOpen(false)
    const items = await fetchPreviousRKAPObjects(tahunAktif)
    setPreviousRKAPItems(items)
    setDialogOpen(true)
  }

  const openEdit = (row: RKAPTargetRow) => {
    setEditTarget(row)
    const toRibu = (v: number) => v / 1_000
    reset({
      no: row.no, kode: row.kode ?? '', basis: (row.basis || 'cash_in') as 'cash_in' | 'pendapatan', nama: row.nama,
      jan: toRibu(row.jan), feb: toRibu(row.feb), mar: toRibu(row.mar), apr: toRibu(row.apr),
      mei: toRibu(row.mei), jun: toRibu(row.jun), jul: toRibu(row.jul), agu: toRibu(row.agu),
      sep: toRibu(row.sep), okt: toRibu(row.okt), nov: toRibu(row.nov), des: toRibu(row.des),
    })
    setSearchQuery('')
    setDropdownOpen(false)
    setDialogOpen(true)
  }

  const isSeedRow = (id: string) => id.startsWith('seed-')

  const onSubmit = async (values: RowForm) => {
    const monikaId = values.kode.trim()
    if (!monikaId) {
      alert('ID Monika wajib diisi. Pilih dari master Data Aset.')
      return
    }
    if (!asetByMonika.has(monikaId)) {
      alert(
        `ID Monika "${monikaId}" tidak ada di master Data Aset.\n`
        + 'Daftarkan aset dulu (Master → Data Aset) lalu pilih ID Monika-nya di sini.',
      )
      return
    }
    const toRp = (v: number) => v * 1_000
    const bulanVals = BULAN_COLS.map(col => toRp(values[col as keyof RowForm] as number))
    const total = bulanVals.reduce((a, b) => a + b, 0)
    const hasRealId = editTarget && !isSeedRow(editTarget.id)
    // Nama boleh diedit, tapi default dari master aset; ID Monika tidak boleh kosong
    const nama = values.nama.trim() || asetByMonika.get(monikaId) || monikaId
    await upsertRow({
      ...(hasRealId ? { id: editTarget!.id } : {}),
      tahun: tahunAktif,
      no: values.no, kode: monikaId, basis: values.basis, nama, total,
      jan: toRp(values.jan), feb: toRp(values.feb), mar: toRp(values.mar), apr: toRp(values.apr),
      mei: toRp(values.mei), jun: toRp(values.jun), jul: toRp(values.jul), agu: toRp(values.agu),
      sep: toRp(values.sep), okt: toRp(values.okt), nov: toRp(values.nov), des: toRp(values.des),
    } as any)
    setDialogOpen(false)
  }

  // ── CSV handlers ──────────────────────────────────────────────────────────
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseRKAPCsv(text, tahunAktif)
      setCsvPreview({ count: parsed.length, rows: parsed })
      setCsvDialogOpen(true)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const confirmImport = async () => {
    if (!csvPreview) return
    await bulkImport(tahunAktif, csvPreview.rows)
    setCsvDialogOpen(false)
    setCsvPreview(null)
  }

  // Seed dipicu otomatis oleh fetchRKAP jika DB kosong; tombol ini reload ulang
  const seedFromHardcode = async () => { await fetchRKAP(tahunAktif) }

  const displayRows = rows

  const ytdBulanLabel = efektifBulan >= 0 ? BULAN_LABELS[efektifBulan] : '—'
  const prognosaPct = totalTarget > 0 ? (totalPrognosa / totalTarget) * 100 : 0
  const ytdRealisasiPctOfAnnual = totalTarget > 0 ? (ytdRealisasi / totalTarget) * 100 : 0

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border bg-gradient-to-br from-[#0f3a57] via-[#1B4F72] to-[#2a6a8f] text-white px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15">
                <Target size={16} />
              </span>
              <p className="text-[11px] uppercase tracking-wider text-blue-100/90 font-medium">Optimalisasi Aset</p>
            </div>
            <h1 className="text-xl font-bold tracking-tight">RKAP Monitor</h1>
            <p className="text-sm text-blue-100/90 mt-1 max-w-xl">
              Target vs realisasi per ID Monika · carry-over defisit otomatis · prognosa Cash In / PSAK 73
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl bg-white/10 border border-white/15 p-1 backdrop-blur-sm">
              <button
                type="button"
                onClick={() => setTahunAktif(tahunAktif - 1)}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
                title="Tahun sebelumnya"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-base font-bold tabular-nums w-14 text-center">{tahunAktif}</span>
              <button
                type="button"
                onClick={() => setTahunAktif(tahunAktif + 1)}
                className="p-1.5 rounded-lg hover:bg-white/15 transition-colors"
                title="Tahun berikutnya"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <p className="text-[11px] text-blue-100/80">
              {rows.length > 0 ? `${rows.length} proker · ID Monika` : 'Belum ada data RKAP'}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-white text-[#1B4F72] hover:bg-blue-50 border-0 shadow-sm" onClick={openAdd}>
            <Plus size={14} /> Tambah Proker
          </Button>
          <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => fileRef.current?.click()}>
            <Upload size={14} /> Upload CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={() => exportRKAPExcel(tahunAktif, rkapDataCashIn, rkapItems, totalTarget, efektifBulan, cashInPerNama, rkapDataPendapatan, pendapatanPerNama, nonaktifCashIn, nonaktifPsak)}
          >
            <FileDown size={14} /> Export Excel
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={async () => {
              setPerbandinganOpen(true)
              setPerbandinganLoading(true)
              setPerbandinganData(null)
              const data = await fetchPerbandinganData(
                tahunAktif, rkapItems, prognosaType,
                cashInPerNama, pendapatanPerNama,
                allKompensasi, allCashIn, allPengakuan, daftarPDDM,
                efektifBulan, nonaktifAktif,
              )
              setPerbandinganData(data)
              setPerbandinganLoading(false)
            }}
          >
            <FileDown size={14} /> Perbandingan
          </Button>
          {rows.length === 0 && tahunAktif === 2026 && (
            <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={seedFromHardcode}>
              <Download size={14} /> Import Data 2026
            </Button>
          )}
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />

          <div className="ml-auto inline-flex rounded-lg border border-white/20 bg-black/10 p-0.5">
            <button
              type="button"
              onClick={() => setPrognosaType('cash_in')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                prognosaType === 'cash_in'
                  ? 'bg-white text-[#1B4F72] shadow-sm'
                  : 'text-blue-100 hover:text-white',
              )}
            >
              Cash In
            </button>
            <button
              type="button"
              onClick={() => setPrognosaType('pendapatan')}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                prognosaType === 'pendapatan'
                  ? 'bg-white text-[#5B2C6F] shadow-sm'
                  : 'text-blue-100 hover:text-white',
              )}
            >
              PSAK 73
            </button>
          </div>
        </div>
      </div>

      {rkapMissingMonika.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <div>
            <p className="font-semibold">Ada {rkapMissingMonika.length} baris RKAP tanpa ID Monika</p>
            <p className="text-xs mt-1 text-red-700">
              Proker harus terikat ID Monika dari master Data Aset. Edit:{' '}
              {rkapMissingMonika.map(r => r.nama).join('; ')}
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Target {tahunAktif}</p>
              <CurrencyDisplay value={totalTarget} size="lg" className="text-[#1B4F72] mt-1.5 block truncate" />
              <p className="text-[10px] text-gray-400 mt-1">{rows.length} proker</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#1B4F72]">
              <Target size={16} />
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">YTD Target</p>
              <CurrencyDisplay value={ytdTargetOri} size="lg" className="text-gray-800 mt-1.5 block truncate" />
              <p className="text-[10px] text-gray-400 mt-1">s.d. {ytdBulanLabel}</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Target size={16} />
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">YTD Realisasi</p>
              <CurrencyDisplay value={ytdRealisasi} size="lg" className="text-[#117A65] mt-1.5 block truncate" />
              <p className="text-[10px] text-gray-400 mt-1">{ytdRealisasiPctOfAnnual.toFixed(1)}% dari target tahunan</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#117A65]">
              <TrendingUp size={16} />
            </span>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 w-full">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Achievement YTD</p>
              <p className={cn('text-2xl font-bold mt-1.5 tabular-nums', pctColor(ytdAchievement))}>
                {ytdAchievement.toFixed(1)}%
              </p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    ytdAchievement >= 100 ? 'bg-green-500' : ytdAchievement >= 80 ? 'bg-amber-400' : 'bg-red-400',
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, ytdAchievement))}%` }}
                />
              </div>
            </div>
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              ytdAchievement >= 100 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500',
            )}>
              {ytdAchievement >= 100 ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
            </span>
          </div>
        </div>

        <div className={cn(
          'rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow col-span-2 xl:col-span-1',
          totalPrognosa >= totalTarget ? 'border-green-200 ring-1 ring-green-100' : 'border-orange-200 ring-1 ring-orange-100',
        )}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                Prognosa {tahunAktif}
                <span className={cn('ml-1 normal-case font-semibold',
                  prognosaType === 'cash_in' ? 'text-[#1B4F72]' : 'text-[#5B2C6F]',
                )}>
                  · {prognosaType === 'cash_in' ? 'Cash In' : 'PSAK 73'}
                </span>
              </p>
              <CurrencyDisplay
                value={totalPrognosa}
                size="lg"
                className={cn('mt-1.5 block truncate', totalPrognosa >= totalTarget ? 'text-green-700' : 'text-orange-600')}
              />
              <p className="text-[10px] text-gray-400 mt-1">
                {prognosaPct.toFixed(1)}% target
                {prognosaType === 'cash_in' && totalTarget > 0 && (
                  <span className="text-[#5B2C6F]"> · PSAK {(totalPrognosaPendapatan / totalTarget * 100).toFixed(1)}%</span>
                )}
              </p>
            </div>
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              totalPrognosa >= totalTarget ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-500',
            )}>
              <TrendingUp size={16} />
            </span>
          </div>
        </div>
      </div>

      {currentCarryOver > 0 && efektifBulan >= 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 text-sm shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
            <AlertTriangle size={15} />
          </span>
          <div className="text-orange-800">
            <p className="font-semibold text-orange-900">Carry-over aktif — {BULAN_LABELS[efektifBulan]}</p>
            <p className="text-xs mt-0.5 text-orange-700">
              Defisit <strong>{formatRupiah(currentCarryOver)}</strong> dari bulan lalu ditambahkan ke target bulan ini →{' '}
              <strong>{formatRupiah(rkapData[efektifBulan]?.targetAdjusted ?? 0)}</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm border-gray-200/80">
        <CardHeader className="border-b bg-gray-50/80 py-3 px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-800">
                Target vs Realisasi & Prognosa
              </CardTitle>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {tahunAktif} · satuan juta Rp · mode {prognosaType === 'cash_in' ? 'Cash In' : 'Pendapatan PSAK 73'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-[10px] text-gray-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-300" /> Target</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-slate-400" /> Target+C/O</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#117A65]" /> Realisasi</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3B82F6]" /> Prognosa</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 px-2 sm:px-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }} barGap={2} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="bulan" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}`} width={36} />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                formatter={(v: number) => [`Rp ${Number(v).toLocaleString('id-ID')} jt`, '']}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <Bar dataKey="Target RKAP" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Target + C/O" fill="#94a3b8" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Realisasi" fill="#117A65" radius={[3, 3, 0, 0]} maxBarSize={22} />
              <Bar dataKey="Prognosa" fill="#3B82F6" radius={[3, 3, 0, 0]} maxBarSize={22} fillOpacity={0.75} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Tabel bulanan ─────────────────────────────────────────────────── */}
      <Card className="overflow-hidden shadow-sm border-gray-200/80">
        <CardHeader className="border-b bg-gray-50/80 py-3 px-5">
          <CardTitle className="text-sm font-semibold text-gray-800">Rincian Bulanan + Carry-over</CardTitle>
          <p className="text-[11px] text-gray-500 mt-0.5">T = target · C/O = carry-over · * prognosa = proyeksi bulan mendatang</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-[#f8fafc]">
                  {['Bulan', 'Target Ori', 'Carry-over', 'Target Adjusted', 'Realisasi', 'Prognosa', 'Selisih', '%'].map(h => (
                    <th
                      key={h}
                      className={cn(
                        'px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap text-[11px] uppercase tracking-wide',
                        h === 'Bulan' ? 'text-left' : 'text-right',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rkapData.map((m, i) => {
                  const isFuture = m.isFuture
                  const isNow = tahunAktif === CURRENT_YEAR && i === CURRENT_MONTH
                  return (
                    <tr
                      key={i}
                      className={cn(
                        'transition-colors',
                        isFuture && 'text-gray-400',
                        isNow && 'bg-blue-50/60',
                        !isNow && !isFuture && 'hover:bg-slate-50/80',
                        i % 2 === 1 && !isNow && 'bg-slate-50/30',
                      )}
                    >
                      <td className="px-3 py-2.5 font-semibold text-gray-800">
                        {m.label}
                        {isNow && (
                          <span className="ml-1.5 text-[10px] bg-[#1B4F72] text-white px-1.5 py-0.5 rounded-full font-medium">
                            Sekarang
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{m.targetOriginal > 0 ? formatRupiah(m.targetOriginal) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-orange-600 font-medium tabular-nums">{m.carryOver > 0 ? `+${formatRupiah(m.carryOver)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{m.targetAdjusted > 0 ? formatRupiah(m.targetAdjusted) : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-green-700 tabular-nums">{m.realisasi > 0 ? formatRupiah(m.realisasi) : '—'}</td>
                      <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums',
                        m.isFuture ? 'text-blue-600 italic' : m.prognosa > 0 ? 'text-green-700' : 'text-gray-400'
                      )}>
                        {m.prognosa > 0
                          ? <span title={m.isFuture ? 'Proyeksi berdasarkan target RKAP + carry-over' : 'Realisasi aktual'}>
                            {formatRupiah(m.prognosa)}{m.isFuture ? ' *' : ''}
                          </span>
                          : '—'
                        }
                      </td>
                      <td className={cn('px-3 py-2.5 text-right font-semibold tabular-nums', m.selisih >= 0 ? 'text-green-700' : 'text-red-600')}>
                        {m.targetAdjusted === 0 && m.realisasi === 0 ? '—' : (m.selisih >= 0 ? '+' : '') + formatRupiah(m.selisih)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right font-bold tabular-nums', isFuture ? 'text-gray-400' : pctColor(m.achievement))}>
                        {m.targetAdjusted > 0 ? (
                          <span className={cn(
                            'inline-block min-w-[2.75rem] px-1.5 py-0.5 rounded-full text-[11px]',
                            m.achievement >= 100 ? 'bg-green-100 text-green-800'
                              : m.achievement >= 80 ? 'bg-amber-100 text-amber-800'
                                : m.achievement > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-500',
                          )}>
                            {m.achievement.toFixed(0)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1B4F72]/20 bg-[#f0f5f9] font-semibold text-xs">
                  <td className="px-3 py-2.5 text-[#1B4F72]">Total {tahunAktif}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiah(totalTarget)}</td>
                  <td className="px-3 py-2.5 text-right text-orange-600">—</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatRupiah(totalTarget)}</td>
                  <td className="px-3 py-2.5 text-right text-green-700 tabular-nums">{formatRupiah(activeRealisasiPerBulan.reduce((s, v) => s + v, 0))}</td>
                  <td className={cn('px-3 py-2.5 text-right font-bold tabular-nums', totalPrognosa >= totalTarget ? 'text-green-700' : 'text-orange-600')}>
                    {formatRupiah(totalPrognosa)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabel per obyek — sticky left cols + header alignment fixed */}
      <Card className="overflow-hidden shadow-sm border-gray-200/80">
        <CardHeader className="border-b bg-white py-3.5 px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-gray-900">
                Target per Proker · {tahunAktif}
              </CardTitle>
              <p className="text-[11px] text-gray-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>Nilai dalam <strong className="font-medium text-gray-700">juta Rupiah</strong></span>
                <span className="inline-flex items-center gap-1"><span className="text-gray-400 font-semibold">T</span> Target</span>
                <span className="inline-flex items-center gap-1"><span className="text-emerald-600 font-semibold">R</span> Realisasi</span>
                <span className="text-gray-400">· Scroll horizontal — kolom ID Monika & nama tetap terlihat</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {nonaktifAktif.size > 0 && (
                <span className="text-xs text-red-600 font-medium bg-red-50 border border-red-100 rounded-full px-2.5 py-1">
                  {nonaktifAktif.size} nonaktif {prognosaType === 'cash_in' ? 'Cash In' : 'PSAK 73'}
                  <button
                    type="button"
                    onClick={() => setNonaktifAktif(new Set())}
                    className="ml-1.5 text-blue-600 hover:underline"
                  >
                    Reset
                  </button>
                </span>
              )}
              <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 tabular-nums">
                {displayRows.length} proker
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rkap-proker-scroll overflow-auto max-h-[min(70vh,640px)]">
            <table className="rkap-proker-table text-[12px] w-max min-w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="rkap-sticky-col rkap-sticky-0 rkap-th rkap-th-dark w-10 text-center" rowSpan={2}>No</th>
                  <th className="rkap-sticky-col rkap-sticky-1 rkap-th rkap-th-dark min-w-[118px] text-left" rowSpan={2}>ID Monika</th>
                  <th className="rkap-sticky-col rkap-sticky-2 rkap-th rkap-th-dark min-w-[200px] text-left shadow-[2px_0_6px_-2px_rgba(0,0,0,0.12)]" rowSpan={2}>Obyek Kerjasama</th>
                  {BULAN_LABELS.map(b => (
                    <th key={b} colSpan={2} className="rkap-th rkap-th-dark text-center border-l border-white/10 min-w-[88px]">
                      {b}
                    </th>
                  ))}
                  <th colSpan={2} className="rkap-th rkap-th-dark-alt text-center border-l border-white/10 min-w-[100px]">
                    Total
                  </th>
                  <th className="rkap-th rkap-th-dark w-[104px] text-center" rowSpan={2}>Aksi</th>
                </tr>
                <tr>
                  {BULAN_LABELS.map(b => (
                    <Fragment key={`${b}-sub`}>
                      <th className="rkap-th rkap-th-sub text-right w-11 border-l border-white/10">T</th>
                      <th className="rkap-th rkap-th-sub text-right w-11 text-emerald-200">R</th>
                    </Fragment>
                  ))}
                  <th className="rkap-th rkap-th-sub-alt text-right w-12 border-l border-white/10">T</th>
                  <th className="rkap-th rkap-th-sub-alt text-right w-12 text-emerald-200">R</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row, rowIdx) => {
                  const realPerBulan: number[] = activePerNama[row.kode ?? ''] ?? activePerNama[row.nama] ?? Array(12).fill(0)
                  const totalReal = realPerBulan.reduce((s, v) => s + v, 0)
                  const totalTgt = row.total ?? 0
                  const pctTotal = totalTgt > 0 ? (totalReal / totalTgt) * 100 : null
                  const rowKode = row.kode || row.nama
                  const inactive = !!(row.kode && nonaktifAktif.has(row.kode))
                  const zebra = rowIdx % 2 === 1
                  const stickyBg = inactive ? 'bg-gray-100' : zebra ? 'bg-slate-50' : 'bg-white'
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'group transition-colors',
                        inactive ? 'opacity-55' : 'hover:bg-blue-50/50',
                        zebra ? 'bg-slate-50/80' : 'bg-white',
                      )}
                    >
                      <td className={cn('rkap-sticky-col rkap-sticky-0 rkap-td text-center text-gray-400 tabular-nums', stickyBg)}>
                        {row.no}
                      </td>
                      <td className={cn('rkap-sticky-col rkap-sticky-1 rkap-td whitespace-nowrap', stickyBg)}>
                        {row.kode?.trim() ? (
                          <span className="font-mono text-[11px] font-semibold text-[#1B4F72] tracking-tight">
                            {row.kode}
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">
                            Belum diisi
                          </span>
                        )}
                      </td>
                      <td className={cn(
                        'rkap-sticky-col rkap-sticky-2 rkap-td max-w-[220px] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]',
                        stickyBg,
                      )}>
                        <button
                          type="button"
                          onClick={() => { setBreakdownKode(rowKode); setBreakdownNama(row.nama) }}
                          className="text-left w-full min-w-0 group/name"
                          title={`${row.nama} — klik breakdown`}
                        >
                          <span className="block truncate font-medium text-gray-800 group-hover/name:text-[#1B4F72]">
                            {row.nama}
                          </span>
                          {pctTotal != null && (
                            <span className={cn(
                              'inline-flex mt-0.5 text-[10px] font-semibold tabular-nums',
                              pctTotal >= 100 ? 'text-green-600' : pctTotal >= 75 ? 'text-amber-600' : 'text-red-500',
                            )}>
                              {pctTotal.toFixed(1)}%
                            </span>
                          )}
                        </button>
                      </td>
                      {BULAN_COLS.map((col, i) => {
                        const tgt = row[col] ?? 0
                        const real = realPerBulan[i] ?? 0
                        const hit = tgt > 0 && real >= tgt
                        const isNow = tahunAktif === CURRENT_YEAR && i === CURRENT_MONTH
                        return (
                          <Fragment key={`${row.id}-${col}`}>
                            <td className={cn(
                              'rkap-td text-right tabular-nums border-l border-gray-100/80',
                              isNow && 'bg-blue-50/40',
                              tgt > 0 ? 'text-gray-600' : 'text-gray-300',
                            )}>
                              {tgt > 0 ? (tgt / 1_000_000).toFixed(1) : '·'}
                            </td>
                            <td className={cn(
                              'rkap-td text-right tabular-nums',
                              isNow && 'bg-blue-50/40',
                              real > 0
                                ? (hit ? 'text-green-700 font-semibold' : 'text-emerald-600')
                                : 'text-gray-300',
                            )}>
                              {real > 0 ? (real / 1_000_000).toFixed(1) : '·'}
                            </td>
                          </Fragment>
                        )
                      })}
                      <td className="rkap-td text-right font-semibold text-[#1B4F72] border-l border-gray-200 tabular-nums bg-slate-50/50">
                        {totalTgt > 0 ? (totalTgt / 1_000_000).toFixed(1) : '·'}
                      </td>
                      <td className={cn(
                        'rkap-td text-right font-semibold tabular-nums bg-slate-50/50',
                        totalReal > 0 ? 'text-green-700' : 'text-gray-300',
                      )}>
                        {totalReal > 0 ? (totalReal / 1_000_000).toFixed(1) : '·'}
                      </td>
                      <td className="rkap-td">
                        <div className="flex items-center justify-center gap-1">
                          {row.kode && (
                            <button
                              type="button"
                              onClick={() => toggleNonaktif(row.kode!)}
                              className={cn(
                                'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors',
                                nonaktifAktif.has(row.kode)
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
                              )}
                              title={
                                nonaktifAktif.has(row.kode)
                                  ? `Aktifkan kembali di ${prognosaType === 'cash_in' ? 'Cash In' : 'PSAK 73'} (ikut carry-over)`
                                  : `Nonaktifkan di ${prognosaType === 'cash_in' ? 'Cash In' : 'PSAK 73'} saja (prognosa 0, tidak carry-over)`
                              }
                            >
                              {nonaktifAktif.has(row.kode)
                                ? <CirclePlay size={14} strokeWidth={2} />
                                : <Ban size={14} strokeWidth={2} />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEdit(row)}
                            className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                            title="Edit proker"
                          >
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          {!isSeedRow(row.id) && (
                            <button
                              type="button"
                              onClick={() => setDeleteId(row.id)}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                              title="Hapus proker"
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[#e8f0f6] font-semibold">
                  <td className="rkap-sticky-col rkap-sticky-0 rkap-td-foot bg-[#e8f0f6]" />
                  <td className="rkap-sticky-col rkap-sticky-1 rkap-td-foot bg-[#e8f0f6]" />
                  <td className="rkap-sticky-col rkap-sticky-2 rkap-td-foot text-[#1B4F72] bg-[#e8f0f6] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)]">
                    Total Target / Realisasi
                  </td>
                  {BULAN_COLS.map((col, i) => {
                    const tgt = displayRows.reduce((s, r) => s + (r[col] ?? 0), 0)
                    const real = activeRealisasiPerBulan[i] ?? 0
                    return (
                      <Fragment key={`${col}-ft`}>
                        <td className={cn('rkap-td-foot text-right border-l border-[#1B4F72]/10 tabular-nums', tgt > 0 ? 'text-[#1B4F72]' : 'text-gray-400')}>
                          {tgt > 0 ? (tgt / 1_000_000).toFixed(1) : '·'}
                        </td>
                        <td className={cn('rkap-td-foot text-right tabular-nums', real > 0 ? 'text-green-700' : 'text-gray-400')}>
                          {real > 0 ? (real / 1_000_000).toFixed(1) : '·'}
                        </td>
                      </Fragment>
                    )
                  })}
                  <td className="rkap-td-foot text-right text-[#1B4F72] border-l border-[#1B4F72]/15 tabular-nums">
                    {(totalTarget / 1_000_000).toFixed(1)}
                  </td>
                  <td className="rkap-td-foot text-right text-green-700 tabular-nums">
                    {(activeRealisasiPerBulan.reduce((s, v) => s + v, 0) / 1_000_000).toFixed(1)}
                  </td>
                  <td className="rkap-td-foot" />
                </tr>
                <tr className="bg-[#f8fafc] text-[11px]">
                  <td className="rkap-sticky-col rkap-sticky-0 rkap-td-foot bg-[#f8fafc]" />
                  <td className="rkap-sticky-col rkap-sticky-1 rkap-td-foot bg-[#f8fafc]" />
                  <td className="rkap-sticky-col rkap-sticky-2 rkap-td-foot text-gray-500 bg-[#f8fafc] shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)]">
                    Achievement
                  </td>
                  {BULAN_COLS.map((col, i) => {
                    const tgt = displayRows.reduce((s, r) => s + (r[col] ?? 0), 0)
                    const real = activeRealisasiPerBulan[i] ?? 0
                    const pct = tgt > 0 ? (real / tgt) * 100 : null
                    return (
                      <Fragment key={`${col}-fa`}>
                        <td className="rkap-td-foot border-l border-gray-100" />
                        <td className={cn(
                          'rkap-td-foot text-right font-semibold tabular-nums',
                          pct == null ? 'text-gray-300' : pct >= 100 ? 'text-green-700' : pct >= 75 ? 'text-amber-600' : 'text-red-600',
                        )}>
                          {pct != null ? `${pct.toFixed(0)}%` : '·'}
                        </td>
                      </Fragment>
                    )
                  })}
                  <td className="rkap-td-foot border-l border-gray-100" />
                  {(() => {
                    const totalReal = activeRealisasiPerBulan.reduce((s, v) => s + v, 0)
                    const pct = totalTarget > 0 ? (totalReal / totalTarget) * 100 : null
                    return (
                      <td className={cn(
                        'rkap-td-foot text-right font-bold tabular-nums',
                        pct == null ? 'text-gray-300' : pct >= 100 ? 'text-green-700' : pct >= 75 ? 'text-amber-600' : 'text-red-600',
                      )}>
                        {pct != null ? `${pct.toFixed(1)}%` : '·'}
                      </td>
                    )
                  })()}
                  <td className="rkap-td-foot" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Dialog tambah/edit ────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Obyek RKAP' : 'Tambah Obyek RKAP'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* ── Carry-over selector ── */}
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Pilih dari RKAP sebelumnya (opsional)</Label>
              <Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={dropdownOpen}
                    className="w-full justify-between text-sm font-normal"
                    type="button"
                  >
                    {(() => {
                      const selectedKode = watch('kode')
                      const selectedNama = watch('nama')
                      if (selectedKode) {
                        return <span className="truncate">{selectedKode} — {selectedNama}</span>
                      }
                      return <span className="text-gray-400">Cari atau pilih objek RKAP...</span>
                    })()}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="flex items-center border-b px-3">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <input
                      className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-gray-400"
                      placeholder="Cari kode atau nama objek..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto p-1">
                    {previousRKAPItems.length === 0 ? (
                      <p className="py-6 text-center text-sm text-gray-400">Tidak ada data RKAP tahun sebelumnya</p>
                    ) : (
                      (() => {
                        const filtered = previousRKAPItems.filter(
                          item =>
                            item.kode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            item.nama.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        if (filtered.length === 0) {
                          return <p className="py-6 text-center text-sm text-gray-400">Tidak ditemukan</p>
                        }
                        return filtered.map(item => (
                          <button
                            key={item.kode}
                            type="button"
                            className={cn(
                              'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors',
                              watch('kode') === item.kode && 'bg-accent text-accent-foreground'
                            )}
                            onClick={() => {
                              setValue('kode', item.kode, { shouldValidate: false })
                              setValue('nama', item.nama, { shouldValidate: true })
                              setSearchQuery('')
                              setDropdownOpen(false)
                            }}
                          >
                            <span className="font-mono text-xs text-blue-600 mr-2 min-w-[8rem]">{item.kode}</span>
                            <span className="text-gray-700 truncate">{item.nama}</span>
                            {watch('kode') === item.kode && (
                              <Check className="ml-auto h-4 w-4 shrink-0 opacity-70" />
                            )}
                          </button>
                        ))
                      })()
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label>No</Label>
                <Input {...register('no')} type="number" className="mt-1" />
                {errors.no && <p className="text-xs text-red-500 mt-1">{errors.no.message}</p>}
              </div>
              <div className="col-span-2">
                <Label>ID Monika <span className="text-red-400">*</span></Label>
                <div className="mt-1">
                  <SearchableSelect
                    value={watch('kode') ?? ''}
                    onValueChange={v => {
                      setValue('kode', v, { shouldValidate: true })
                      const namaAset = asetByMonika.get(v)
                      if (namaAset) setValue('nama', namaAset, { shouldValidate: true })
                    }}
                    options={monikaOptions}
                    placeholder="Cari & pilih ID Monika dari master aset..."
                    searchPlaceholder="Ketik ID Monika atau nama aset..."
                  />
                </div>
                {errors.kode && <p className="text-xs text-red-500 mt-1">{errors.kode.message}</p>}
                <p className="text-[11px] text-gray-400 mt-1">
                  Wajib dari master Data Aset. Tidak boleh isi nama proker tanpa ID Monika.
                </p>
              </div>
              <div>
                <Label>Basis</Label>
                <select
                  {...register('basis')}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <option value="cash_in">Cash In</option>
                  <option value="pendapatan">Pendapatan (PSAK 73)</option>
                </select>
              </div>
            </div>
            <div>
              <Label>Nama Obyek Kerjasama</Label>
              <Input {...register('nama')} className="mt-1" placeholder="Otomatis dari master aset (bisa disesuaikan)" />
              {errors.nama && <p className="text-xs text-red-500 mt-1">{errors.nama.message}</p>}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-700 mb-2">Target per Bulan <span className="font-normal text-gray-400">(dalam ribuan Rp — contoh: 7500 = Rp 7.500.000)</span></p>
              <div className="grid grid-cols-4 gap-2">
                {BULAN_COLS.map((col, i) => (
                  <div key={col}>
                    <Label className="text-[11px] text-gray-500">{BULAN_LABELS[i]}</Label>
                    <Input {...register(col as keyof RowForm)} type="number" className="mt-0.5 h-8 text-xs" placeholder="0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Preview total */}
            {(() => {
              const vals = watch()
              const tot = BULAN_COLS.reduce((s, col) => s + ((parseFloat(String(vals[col as keyof RowForm])) || 0) * 1000), 0)
              return tot > 0 ? (
                <p className="text-xs text-gray-500">Total otomatis: <strong className="text-[#1B4F72]">{formatRupiah(tot)}</strong></p>
              ) : null
            })()}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" disabled={isLoading}>Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog konfirmasi import CSV ──────────────────────────────────── */}
      <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Import CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Ditemukan <strong>{csvPreview?.count ?? 0} baris</strong> data untuk tahun <strong>{tahunAktif}</strong>.</p>
            <div className="bg-orange-50 border border-orange-200 rounded-md px-3 py-2 text-orange-700 text-xs">
              <strong>Perhatian:</strong> Seluruh data RKAP {tahunAktif} yang ada di database akan <strong>diganti</strong> dengan data dari CSV ini.
            </div>
            {csvPreview && csvPreview.count > 0 && (
              <div className="max-h-40 overflow-y-auto text-xs border rounded">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-2 py-1 text-left">No</th>
                      <th className="px-2 py-1 text-left">Nama</th>
                      <th className="px-2 py-1 text-right">Total (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.rows.map(r => (
                      <tr key={r.no} className="border-t">
                        <td className="px-2 py-1">{r.no}</td>
                        <td className="px-2 py-1">{r.nama}</td>
                        <td className="px-2 py-1 text-right">{formatRupiah(r.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvDialogOpen(false)}>Batal</Button>
            <Button onClick={confirmImport} disabled={isLoading}>
              {isLoading ? 'Mengimpor...' : 'Ya, Impor Sekarang'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog konfirmasi hapus ───────────────────────────────────────── */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Baris RKAP?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Tindakan ini tidak dapat diurungkan.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Batal</Button>
            <Button variant="destructive" onClick={async () => {
              if (deleteId) { await deleteRow(deleteId, tahunAktif); setDeleteId(null) }
            }}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Dialog Rincian Cash In per Proker ──────────────────────────────── */}
      <Dialog open={!!breakdownKode} onOpenChange={() => { setBreakdownKode(null); setBreakdownNama('') }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <div>
                <DialogTitle>Rincian Cash In</DialogTitle>
                <p className="text-sm text-gray-500 mt-1">{breakdownNama}</p>
              </div>
            </div>
          </DialogHeader>

          {(() => {
            const kode = breakdownKode
            if (!kode) return null

            // Filter kompensasi by rkap_kode
            const kompensasiList = allKompensasi.filter(k => k.rkap_kode === kode)
            // Filter cash_in by rkap_kode
            const cashInList = allCashIn.filter(ci => ci.rkap_kode === kode)

            const hasData = kompensasiList.length > 0 || cashInList.length > 0
            if (!hasData) {
              return (
                <div className="py-8 text-center text-sm text-gray-400">
                  Belum ada data cash in untuk program ini.
                </div>
              )
            }

            // ── Hitung total per komponen ──
            let totalPokok = 0
            let totalPPN = 0
            let totalPPh = 0
            let totalPengurang = 0
            let totalRealisasi = 0
            let totalDenda = 0
            let totalCashInLain = 0

            // Baris kompensasi
            const kompRows = kompensasiList.map(k => {
              const pokok = k.nominal
              const ppn = k.nominal_ppn
              const pph = k.nominal_pph
              const pengurang = k.pengurang ?? 0
              const totalTagihan = k.total_tagihan
              const realisasi = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
              totalPokok += pokok
              totalPPN += ppn
              totalPPh += pph
              totalPengurang += pengurang
              totalRealisasi += realisasi
              return { k, pokok, ppn, pph, pengurang, totalTagihan, realisasi }
            })

            // Baris cash in
            const dendaRows = cashInList.filter(ci => ci.jenis === 'denda')
            const lainRows = cashInList.filter(ci => ci.jenis === 'lainnya')
            dendaRows.forEach(d => { totalDenda += d.nominal })
            lainRows.forEach(l => { totalCashInLain += l.nominal })

            return (
              <div className="space-y-4">
                {/* ── Tabel Kompensasi ── */}
                {kompRows.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
                      Kompensasi / Tagihan
                    </h4>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="px-3 py-2 text-left font-semibold text-gray-500">Periode</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-500">Pokok</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-500">PPN</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-500">PPh</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-500">Pengurang</th>
                            <th className="px-3 py-2 text-right font-semibold text-[#1B4F72]">Total Tagihan</th>
                            <th className="px-3 py-2 text-right font-semibold text-green-700">Realisasi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {kompRows.map(({ k, pokok, ppn, pph, pengurang, totalTagihan, realisasi }) => (
                            <tr key={k.id} className="border-b hover:bg-gray-50/60">
                              <td className="px-3 py-2 text-gray-700">
                                <div className="flex items-center gap-1.5">
                                  <span>{k.periode_label || '-'}</span>
                                  {k.rkap_kode && (
                                    <Badge variant="outline" className="font-mono text-[9px] text-blue-600 bg-blue-50 border-blue-200 px-1 py-0">
                                      {k.rkap_kode}
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right text-gray-700">{formatRupiah(pokok)}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{formatRupiah(ppn)}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{formatRupiah(pph)}</td>
                              <td className="px-3 py-2 text-right text-red-600">{pengurang > 0 ? `(${formatRupiah(pengurang)})` : '—'}</td>
                              <td className="px-3 py-2 text-right font-semibold text-[#1B4F72]">{formatRupiah(totalTagihan)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-green-700">{realisasi > 0 ? formatRupiah(realisasi) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-gray-50/80 border-t-2 font-semibold text-xs">
                            <td className="px-3 py-2 text-gray-600">Subtotal</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(totalPokok)}</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(totalPPN)}</td>
                            <td className="px-3 py-2 text-right">{formatRupiah(totalPPh)}</td>
                            <td className="px-3 py-2 text-right text-red-600">{totalPengurang > 0 ? `(${formatRupiah(totalPengurang)})` : '—'}</td>
                            <td className="px-3 py-2 text-right text-[#1B4F72]">{formatRupiah(kompRows.reduce((s, r) => s + r.totalTagihan, 0))}</td>
                            <td className="px-3 py-2 text-right text-green-700">{formatRupiah(totalRealisasi)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* ── Denda ── */}
                  {dendaRows.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Denda</h4>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Tanggal</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-500">Nominal</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dendaRows.map(ci => (
                              <tr key={ci.id} className="border-b hover:bg-gray-50/60">
                                <td className="px-3 py-2 text-gray-700">{new Date(ci.tgl_terima).toLocaleDateString('id-ID')}</td>
                                <td className="px-3 py-2 text-right text-orange-600 font-medium">{formatRupiah(ci.nominal)}</td>
                                <td className="px-3 py-2 text-gray-500">{ci.keterangan || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50/80 border-t-2 font-semibold text-xs">
                              <td className="px-3 py-2 text-gray-600">Subtotal Denda</td>
                              <td className="px-3 py-2 text-right text-orange-600">{formatRupiah(totalDenda)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* ── Cash In Lainnya ── */}
                  {lainRows.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Cash In Lainnya</h4>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-gray-50 border-b">
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Tanggal</th>
                              <th className="px-3 py-2 text-right font-semibold text-gray-500">Nominal</th>
                              <th className="px-3 py-2 text-left font-semibold text-gray-500">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lainRows.map(ci => (
                              <tr key={ci.id} className="border-b hover:bg-gray-50/60">
                                <td className="px-3 py-2 text-gray-700">{new Date(ci.tgl_terima).toLocaleDateString('id-ID')}</td>
                                <td className="px-3 py-2 text-right text-green-600 font-medium">{formatRupiah(ci.nominal)}</td>
                                <td className="px-3 py-2 text-gray-500">{ci.keterangan || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50/80 border-t-2 font-semibold text-xs">
                              <td className="px-3 py-2 text-gray-600">Subtotal Lainnya</td>
                              <td className="px-3 py-2 text-right text-green-600">{formatRupiah(totalCashInLain)}</td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Grand Total ── */}
                {(dendaRows.length > 0 || lainRows.length > 0) && (
                  <div className="bg-blue-50/60 rounded-lg border border-blue-200 p-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                      <div>
                        <span className="text-gray-500">Total Pokok</span>
                        <p className="font-bold text-gray-800">{formatRupiah(totalPokok)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Total PPN</span>
                        <p className="font-bold text-gray-800">{formatRupiah(totalPPN)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Total PPh</span>
                        <p className="font-bold text-gray-800">{formatRupiah(totalPPh)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Denda</span>
                        <p className="font-bold text-orange-600">{formatRupiah(totalDenda)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Cash In Lain</span>
                        <p className="font-bold text-green-600">{formatRupiah(totalCashInLain)}</p>
                      </div>
                    </div>
                    <div className="border-t border-blue-200 mt-3 pt-3 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 font-semibold">Total Penerimaan</span>
                        <p className="text-sm font-bold text-[#1B4F72]">
                          {formatRupiah(totalRealisasi + totalDenda + totalCashInLain)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setBreakdownKode(null); setBreakdownNama('') }}>
              <X size={14} className="mr-1" /> Tutup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Preview Perbandingan ─────────────────────────────────── */}
      <Dialog open={perbandinganOpen} onOpenChange={setPerbandinganOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {perbandinganData
                ? `Perbandingan RKAP ${perbandinganData.tahunPrev}–${perbandinganData.tahunNext} — ${perbandinganData.basisLabel}`
                : 'Perbandingan RKAP'}
            </DialogTitle>
          </DialogHeader>

          {perbandinganLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">Memuat data...</div>
          ) : perbandinganData ? (
            <>
              <div className="overflow-auto flex-1 -mx-6 px-6">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b">
                      <th className="text-left px-3 py-2 w-8">No</th>
                      <th className="text-left px-3 py-2">ID Monika</th>
                      <th className="text-left px-3 py-2">Obyek Kerjasama</th>
                      <th className="text-right px-3 py-2">Realisasi {perbandinganData.tahunPrev}</th>
                      <th className="text-right px-3 py-2">RKAP {tahunAktif}</th>
                      <th className="text-right px-3 py-2">Prognosa {tahunAktif}</th>
                      <th className="text-right px-3 py-2">RKAP {perbandinganData.tahunNext}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {perbandinganData.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60">
                        <td className="px-3 py-1.5 text-gray-400">{r.no}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-blue-600">{r.kode || '—'}</td>
                        <td className="px-3 py-1.5 font-medium text-gray-700">{r.nama}</td>
                        <td className="px-3 py-1.5 text-right text-green-700">{formatRupiah(r.realisasiPrev)}</td>
                        <td className="px-3 py-1.5 text-right text-[#1B4F72]">{formatRupiah(r.rkapCur)}</td>
                        <td className="px-3 py-1.5 text-right text-blue-600">{formatRupiah(r.progCur)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{formatRupiah(r.rkapNxt)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 bg-gray-50 font-bold text-xs">
                      <td colSpan={3} className="px-3 py-2 text-gray-700">TOTAL</td>
                      <td className="px-3 py-2 text-right text-green-700">{formatRupiah(perbandinganData.total.realisasiPrev)}</td>
                      <td className="px-3 py-2 text-right text-[#1B4F72]">{formatRupiah(perbandinganData.total.rkapCur)}</td>
                      <td className="px-3 py-2 text-right text-blue-600">{formatRupiah(perbandinganData.total.progCur)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{formatRupiah(perbandinganData.total.rkapNxt)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPerbandinganOpen(false)}>
                  <X size={14} className="mr-1" /> Tutup
                </Button>
                <Button onClick={() => downloadPerbandinganExcel(perbandinganData, tahunAktif)}>
                  <FileDown size={14} className="mr-1" /> Download Excel
                </Button>
              </DialogFooter>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-gray-400">Gagal memuat data.</div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
