import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useCashInStore } from '@/store/cashInStore'
import { useRKAPStore, rowToRKAPItem, BULAN_COLS, RKAPTargetRow } from '@/store/rkapStore'
import { RKAP_2026, BULAN_LABELS } from '@/data/rkap2026'
import { hitungRKAP, getCashInPerBulanByYear, MonthSummary } from '@/utils/rkapUtils'
import { RKAPItem } from '@/data/rkap2026'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatRupiah } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Target, TrendingUp, AlertTriangle, CheckCircle, Plus, Pencil, Trash2, Upload, Download, ChevronLeft, ChevronRight, FileDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

// ── Excel export ──────────────────────────────────────────────────────────────
function exportRKAPExcel(
  tahun: number,
  rkapData: MonthSummary[],
  rkapItems: RKAPItem[],
  totalTarget: number,
  efektifBulan: number,   // bulan terakhir yang sudah berjalan (0–11), -1 jika tahun depan
  cashInPerNama: Record<string, number[]> // NEW PARAMETER
) {
  const wb = XLSX.utils.book_new()
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
  const rp = (v: number | null) => v != null && v !== 0 ? v : null
  const pct = (v: number, t: number) => t > 0 ? +((v / t) * 100).toFixed(1) : null

  const ytdReal = rkapData.slice(0, efektifBulan + 1).reduce((s, m) => s + m.realisasi, 0)
  const ytdTarget = rkapData.slice(0, efektifBulan + 1).reduce((s, m) => s + m.targetOriginal, 0)
  const carryAktif = rkapData[efektifBulan]?.carryOver ?? 0

  // ── Sheet 1: Ringkasan Prognosa ─────────────────────────────────────────────
  const sh1: any[][] = [
    [`RKAP Monitor ${tahun} — Laporan Prognosa`],
    [`Diekspor pada: ${now}`],
    [],
    ['Bulan', 'Target RKAP (Rp)', 'Carry-over (Rp)', 'Target Disesuaikan (Rp)',
      'Realisasi / Cash In (Rp)', 'Selisih (Rp)', 'Achievement (%)', 'Prognosa (Rp)', 'Status'],
  ]
  rkapData.forEach((m, i) => {
    const past = i < efektifBulan
    const current = i === efektifBulan
    const status = past ? (m.selisih >= 0 ? 'Tercapai' : 'Tidak Tercapai (carry-over)')
      : current ? 'Berjalan'
        : '—'
    sh1.push([
      m.label,
      rp(m.targetOriginal),
      rp(m.carryOver),
      rp(m.targetAdjusted),
      rp(m.realisasi),
      (past || current) ? m.selisih : null,
      m.targetAdjusted > 0 ? pct(m.realisasi, m.targetAdjusted) : null,
      rp(m.prognosa),
      status,
    ])
  })

  const totalPrognosa = rkapData.reduce((s, m) => s + m.prognosa, 0);

  sh1.push(
    [],
    ['TOTAL', rp(totalTarget), null, rp(totalTarget),
      rp(rkapData.reduce((s, m) => s + m.realisasi, 0)), null,
      pct(ytdReal, ytdTarget), rp(totalPrognosa), ''],
    [],
    [`Carry-over aktif: ${carryAktif > 0 ? formatRupiah(carryAktif) : 'Tidak ada'}`],
    ['Prognosa = realisasi bulan yang telah lewat/berjalan, dan target RKAP original untuk bulan-bulan mendatang.'],
  )

  const ws1 = XLSX.utils.aoa_to_sheet(sh1)
  ws1['!cols'] = [14, 22, 18, 26, 26, 20, 16, 22, 26].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws1, `Ringkasan ${tahun}`)

  // ── Sheet 2: Per Obyek ──────────────────────────────────────────────────────
  const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  const sh2: any[][] = [
    [`Target RKAP per Obyek Kerjasama ${tahun} (Rp)`],
    [`Diekspor pada: ${now}`],
    [],
    ['No', 'Obyek Kerjasama', ...BL, 'Total'],
  ]
  rkapItems.forEach(item =>
    sh2.push([item.no, item.nama, ...item.bulan.map(rp), rp(item.total)])
  )
  sh2.push(
    [],
    ['', 'TOTAL',
      ...BL.map((_, i) => rp(rkapItems.reduce((s, it) => s + (it.bulan[i] ?? 0), 0))),
      rp(totalTarget),
    ],
  )

  const ws2 = XLSX.utils.aoa_to_sheet(sh2)
  ws2['!cols'] = [{ wch: 5 }, { wch: 42 }, ...BL.map(() => ({ wch: 16 })), { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws2, `Target Per Obyek ${tahun}`)

  // ── Sheet 3: Prognosa Per Obyek ──────────────────────────────────────────────
  const sh3: any[][] = [
    [`Prognosa Per Obyek Kerjasama ${tahun} (Rp)`],
    [`Diekspor pada: ${now}`],
    [],
    ['No', 'Obyek Kerjasama', ...BL, 'Total Prognosa'],
  ]

  let totalPrognosaSeluruhObjek = 0;
  const prognosaPerBulanAll = Array(12).fill(0);

  rkapItems.forEach(item => {
    const realPerBulan = cashInPerNama[item.kode ?? ''] ?? cashInPerNama[item.nama] ?? Array(12).fill(0);
    const progBulan = item.bulan.map((target, i) => {
      const isFuture = i > efektifBulan;
      const prog = isFuture ? target : realPerBulan[i];
      prognosaPerBulanAll[i] += prog;
      return prog;
    });
    const totalProgObjek = progBulan.reduce((s, v) => s + v, 0);
    totalPrognosaSeluruhObjek += totalProgObjek;

    sh3.push([item.no, item.nama, ...progBulan.map(rp), rp(totalProgObjek)]);
  })

  sh3.push(
    [],
    ['', 'TOTAL',
      ...prognosaPerBulanAll.map(rp),
      rp(totalPrognosaSeluruhObjek),
    ],
  )

  const ws3 = XLSX.utils.aoa_to_sheet(sh3)
  ws3['!cols'] = [{ wch: 5 }, { wch: 42 }, ...BL.map(() => ({ wch: 16 })), { wch: 18 }]
  XLSX.utils.book_append_sheet(wb, ws3, `Prognosa Per Obyek ${tahun}`)

  XLSX.writeFile(wb, `RKAP_Prognosa_${tahun}_${new Date().toISOString().slice(0, 10)}.xlsx`)
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
  const { rows, tahunAktif, isLoading, fetchRKAP, upsertRow, deleteRow, bulkImport, setTahunAktif } = useRKAPStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<RKAPTargetRow | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [csvPreview, setCsvPreview] = useState<{ count: number; rows: ReturnType<typeof parseRKAPCsv> } | null>(null)
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // State untuk dialog breakdown cash-in per proker
  const [breakdownKode, setBreakdownKode] = useState<string | null>(null)
  const [breakdownNama, setBreakdownNama] = useState('')

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<RowForm>({
    resolver: zodResolver(rowSchema),
    defaultValues: { no: rows.length + 1 },
  })

  useEffect(() => { fetchAllKompensasi() }, [])
  useEffect(() => { fetchAllCashIn() }, [])
  useEffect(() => { fetchRKAP(tahunAktif) }, [tahunAktif])

  // ── Computed data ──────────────────────────────────────────────────────────
  const rkapItems = useMemo(() =>
    rows.length > 0 ? rows.map(rowToRKAPItem) : (tahunAktif === 2026 ? RKAP_2026 : []),
    [rows, tahunAktif]
  )

  const cashIn = useMemo(() =>
    getCashInPerBulanByYear(allKompensasi, tahunAktif, allCashIn),
    [allKompensasi, tahunAktif, allCashIn]
  )

  // Bulan terakhir yang sudah "berjalan" — tergantung tahun yang sedang dilihat
  const efektifBulan = tahunAktif < CURRENT_YEAR ? 11
    : tahunAktif === CURRENT_YEAR ? CURRENT_MONTH
      : -1

  const rkapData = useMemo(
    () => hitungRKAP(rkapItems, cashIn, efektifBulan),
    [rkapItems, cashIn, efektifBulan]
  )

  const totalTarget = useMemo(() => rkapItems.reduce((s, i) => s + i.total, 0), [rkapItems])

  const ytdTargetOri = rkapData.slice(0, efektifBulan + 1).reduce((s, m) => s + m.targetOriginal, 0)
  const ytdRealisasi = cashIn.slice(0, efektifBulan + 1).reduce((s, v) => s + v, 0)
  const ytdAchievement = ytdTargetOri > 0 ? (ytdRealisasi / ytdTargetOri) * 100 : 0
  const currentCarryOver = rkapData[efektifBulan]?.carryOver ?? 0
  // Prognosa tahunan = realisasi bulan lewat + target(+carry-over) bulan mendatang
  const totalPrognosa = rkapData.reduce((s, m) => s + m.prognosa, 0)

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

  // ── Helpers form ──────────────────────────────────────────────────────────
  const openAdd = () => {
    setEditTarget(null)
    reset({ no: (rows.length > 0 ? Math.max(...rows.map(r => r.no)) + 1 : 1) })
    setDialogOpen(true)
  }

  const openEdit = (row: RKAPTargetRow) => {
    setEditTarget(row)
    const toRibu = (v: number) => v / 1_000
    reset({
      no: row.no, nama: row.nama,
      jan: toRibu(row.jan), feb: toRibu(row.feb), mar: toRibu(row.mar), apr: toRibu(row.apr),
      mei: toRibu(row.mei), jun: toRibu(row.jun), jul: toRibu(row.jul), agu: toRibu(row.agu),
      sep: toRibu(row.sep), okt: toRibu(row.okt), nov: toRibu(row.nov), des: toRibu(row.des),
    })
    setDialogOpen(true)
  }

  const isSeedRow = (id: string) => id.startsWith('seed-')

  const onSubmit = async (values: RowForm) => {
    const toRp = (v: number) => v * 1_000
    const bulanVals = BULAN_COLS.map(col => toRp(values[col as keyof RowForm] as number))
    const total = bulanVals.reduce((a, b) => a + b, 0)
    const hasRealId = editTarget && !isSeedRow(editTarget.id)
    await upsertRow({
      ...(hasRealId ? { id: editTarget!.id } : {}),
      tahun: tahunAktif,
      no: values.no, nama: values.nama, total,
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

  // ── Seed dari hardcode 2026 ───────────────────────────────────────────────
  const seedFromHardcode = async () => {
    const items = RKAP_2026.map(item => {
      const [jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des] = item.bulan
      return {
        tahun: tahunAktif, no: item.no, kode: item.kode, nama: item.nama, total: item.total,
        jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des
      }
    })
    await bulkImport(tahunAktif, items)
  }

  const displayRows = rows.length > 0 ? rows : (tahunAktif === 2026 ? RKAP_2026.map((item, idx) => ({
    id: `seed-${idx}`, tahun: 2026, no: item.no, kode: item.kode, nama: item.nama, total: item.total,
    ...Object.fromEntries(BULAN_COLS.map((col, i) => [col, item.bulan[i]])),
  } as RKAPTargetRow)) : [])

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">RKAP Monitor</h1>
          <p className="text-xs text-gray-500 mt-0.5">Target RKAP vs Realisasi — defisit bulan lalu carry ke bulan berikutnya</p>
        </div>

        {/* Year nav */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setTahunAktif(tahunAktif - 1)} className="p-1 rounded hover:bg-gray-100">
            <ChevronLeft size={15} className="text-gray-500" />
          </button>
          <span className="text-sm font-bold text-gray-800 w-10 text-center">{tahunAktif}</span>
          <button onClick={() => setTahunAktif(tahunAktif + 1)} className="p-1 rounded hover:bg-gray-100">
            <ChevronRight size={15} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={openAdd}>
          <Plus size={14} /> Tambah Baris
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Upload CSV
        </Button>
        <Button
          size="sm" variant="outline"
          onClick={() => exportRKAPExcel(tahunAktif, rkapData, rkapItems, totalTarget, efektifBulan, cashInPerNama)}
        >
          <FileDown size={14} /> Export Excel
        </Button>
        {rows.length === 0 && tahunAktif === 2026 && (
          <Button size="sm" variant="outline" onClick={seedFromHardcode}>
            <Download size={14} /> Import Data 2026
          </Button>
        )}
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={onFileChange} />
        <span className="text-xs text-gray-400 flex items-center">
          {rows.length > 0 ? `${rows.length} baris di database` : tahunAktif === 2026 ? '(menampilkan data hardcode 2026)' : 'Belum ada data'}
        </span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Total Target {tahunAktif}</p>
                <CurrencyDisplay value={totalTarget} size="lg" className="text-[#1B4F72] mt-1 block" />
              </div>
              <Target size={18} className="text-[#1B4F72] mt-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">YTD Target (s.d. {BULAN_LABELS[CURRENT_MONTH]})</p>
                <CurrencyDisplay value={ytdTargetOri} size="lg" className="text-gray-800 mt-1 block" />
              </div>
              <Target size={18} className="text-gray-400 mt-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">YTD Realisasi</p>
                <CurrencyDisplay value={ytdRealisasi} size="lg" className="text-[#117A65] mt-1 block" />
              </div>
              <TrendingUp size={18} className="text-[#117A65] mt-0.5" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Achievement YTD</p>
                <p className={cn('text-2xl font-bold mt-1', pctColor(ytdAchievement))}>
                  {ytdAchievement.toFixed(1)}%
                </p>
              </div>
              {ytdAchievement >= 100
                ? <CheckCircle size={18} className="text-green-600 mt-0.5" />
                : <AlertTriangle size={18} className="text-red-500 mt-0.5" />}
            </div>
          </CardContent>
        </Card>

        <Card className={totalPrognosa >= totalTarget ? 'border-green-300' : 'border-orange-300'}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Prognosa Tahunan</p>
                <CurrencyDisplay value={totalPrognosa} size="lg" className={cn('mt-1 block', totalPrognosa >= totalTarget ? 'text-green-700' : 'text-orange-600')} />
                <p className="text-[10px] text-gray-400 mt-1">
                  {totalTarget > 0 ? `${((totalPrognosa / totalTarget) * 100).toFixed(1)}% dari target` : '—'}
                </p>
              </div>
              <TrendingUp size={18} className={cn('mt-0.5', totalPrognosa >= totalTarget ? 'text-green-600' : 'text-orange-500')} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carry-over alert */}
      {currentCarryOver > 0 && (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={15} className="text-orange-500 mt-0.5 flex-shrink-0" />
          <span className="text-orange-700">
            <strong className="text-orange-800">Carry-over aktif:</strong> Defisit{' '}
            <strong>{formatRupiah(currentCarryOver)}</strong> dari bulan lalu ditambahkan ke target{' '}
            {BULAN_LABELS[CURRENT_MONTH]}.
            Target bulan ini menjadi <strong>{formatRupiah(rkapData[CURRENT_MONTH]?.targetAdjusted ?? 0)}</strong>.
          </span>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Target RKAP vs Realisasi & Prognosa per Bulan (Juta Rp) — {tahunAktif}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}jt`} />
              <Tooltip formatter={(v: number) => `Rp ${v.toLocaleString('id-ID')}jt`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Target RKAP" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Target + C/O" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Realisasi" fill="#117A65" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Prognosa" fill="#3B82F6" radius={[4, 4, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabel bulanan */}
      <Card>
        <CardHeader>
          <CardTitle>Rincian Bulanan + Carry-over</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  {['Bulan', 'Target Ori', 'Carry-over', 'Target Adjusted', 'Realisasi', 'Prognosa', 'Selisih', '%'].map(h => (
                    <th key={h} className={cn('px-3 py-2 font-semibold text-gray-600 whitespace-nowrap', h === 'Bulan' ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rkapData.map((m, i) => {
                  const isFuture = m.isFuture
                  return (
                    <tr key={i} className={cn('border-b', isFuture ? 'text-gray-400' : '', i === CURRENT_MONTH ? 'bg-blue-50/40' : 'hover:bg-gray-50/50')}>
                      <td className="px-3 py-2 font-semibold">
                        {m.label}
                        {i === CURRENT_MONTH && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Sekarang</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{m.targetOriginal > 0 ? formatRupiah(m.targetOriginal) : '—'}</td>
                      <td className="px-3 py-2 text-right text-orange-600 font-medium">{m.carryOver > 0 ? `+${formatRupiah(m.carryOver)}` : '—'}</td>
                      <td className="px-3 py-2 text-right font-semibold">{m.targetAdjusted > 0 ? formatRupiah(m.targetAdjusted) : '—'}</td>
                      <td className="px-3 py-2 text-right text-green-700">{m.realisasi > 0 ? formatRupiah(m.realisasi) : '—'}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold',
                        m.isFuture ? 'text-blue-600 italic' : m.prognosa > 0 ? 'text-green-700' : 'text-gray-400'
                      )}>
                        {m.prognosa > 0
                          ? <span title={m.isFuture ? 'Proyeksi berdasarkan target RKAP + carry-over' : 'Realisasi aktual'}>
                            {formatRupiah(m.prognosa)}{m.isFuture ? ' *' : ''}
                          </span>
                          : '—'
                        }
                      </td>
                      <td className={cn('px-3 py-2 text-right font-semibold', m.selisih >= 0 ? 'text-green-700' : 'text-red-600')}>
                        {m.targetAdjusted === 0 && m.realisasi === 0 ? '—' : (m.selisih >= 0 ? '+' : '') + formatRupiah(m.selisih)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-bold', isFuture ? 'text-gray-400' : pctColor(m.achievement))}>
                        {m.targetAdjusted > 0 ? `${m.achievement.toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                  <td className="px-3 py-2 text-gray-800">Total {tahunAktif}</td>
                  <td className="px-3 py-2 text-right">{formatRupiah(totalTarget)}</td>
                  <td className="px-3 py-2 text-right text-orange-600">—</td>
                  <td className="px-3 py-2 text-right">{formatRupiah(totalTarget)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{formatRupiah(cashIn.reduce((s, v) => s + v, 0))}</td>
                  <td className={cn('px-3 py-2 text-right font-bold', totalPrognosa >= totalTarget ? 'text-green-700' : 'text-orange-600')}>
                    {formatRupiah(totalPrognosa)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabel per obyek */}
      <Card>
        <CardHeader>
          <CardTitle>Target per Obyek Kerjasama {tahunAktif} (Juta Rp)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs w-full" style={{ minWidth: 1400 }}>
              <thead>
                {/* Baris 1: Nama bulan (colspan 2 per bulan) */}
                <tr className="bg-gray-100 border-b">
                  <th className="px-2 py-1.5 text-left font-semibold text-gray-500 w-7" rowSpan={2}>No</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-gray-600 min-w-[160px]" rowSpan={2}>Obyek Kerjasama</th>
                  {BULAN_LABELS.map(b => (
                    <th key={b} colSpan={2} className="px-2 py-1.5 text-center font-semibold text-gray-600 border-l border-gray-200">
                      {b}
                    </th>
                  ))}
                  <th colSpan={2} className="px-2 py-1.5 text-center font-semibold text-[#1B4F72] border-l border-gray-200">
                    Total
                  </th>
                  <th className="px-2 py-1.5 w-14" rowSpan={2} />
                </tr>
                {/* Baris 2: T / R per bulan */}
                <tr className="bg-gray-50 border-b">
                  {BULAN_LABELS.map(b => (
                    <>
                      <th key={`${b}-t`} className="px-2 py-1 text-right text-[10px] font-medium text-gray-400 border-l border-gray-100 w-14">T</th>
                      <th key={`${b}-r`} className="px-2 py-1 text-right text-[10px] font-medium text-green-500 w-14">R</th>
                    </>
                  ))}
                  <th className="px-2 py-1 text-right text-[10px] font-medium text-gray-400 border-l border-gray-100 w-16">T</th>
                  <th className="px-2 py-1 text-right text-[10px] font-medium text-green-500 w-16">R</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => {
                  const realPerBulan: number[] = cashInPerNama[row.kode ?? ''] ?? cashInPerNama[row.nama] ?? Array(12).fill(0)
                  const totalReal = realPerBulan.reduce((s, v) => s + v, 0)
                  const totalTgt = row.total ?? 0
                  const pctTotal = totalTgt > 0 ? (totalReal / totalTgt) * 100 : null
                  const rowKode = row.kode || row.nama
                  return (
                    <tr key={row.id} className="border-b hover:bg-gray-50/60 group">
                      <td className="px-2 py-1.5 text-gray-400">{row.no}</td>
                      <td className="px-2 py-1.5 text-gray-700 font-medium">
                        <button
                          onClick={() => { setBreakdownKode(rowKode); setBreakdownNama(row.nama) }}
                          className="text-left hover:text-blue-700 transition-colors cursor-pointer"
                          title="Klik untuk lihat rincian cash in"
                        >
                          <div className="flex items-center gap-1.5">
                            <span>{row.nama}</span>
                            {row.kode && (
                              <Badge variant="outline" className="font-mono text-[10px] text-blue-600 bg-blue-50 border-blue-200 px-1.5 py-0">
                                {row.kode}
                              </Badge>
                            )}
                          </div>
                        </button>
                        {pctTotal != null && (
                          <div className={cn('text-[9px] font-semibold',
                            pctTotal >= 100 ? 'text-green-600' : pctTotal >= 75 ? 'text-yellow-600' : 'text-red-500'
                          )}>
                            {pctTotal.toFixed(1)}% tercapai
                          </div>
                        )}
                      </td>
                      {BULAN_COLS.map((col, i) => {
                        const tgt = row[col] ?? 0
                        const real = realPerBulan[i] ?? 0
                        const hit = tgt > 0 && real >= tgt
                        return (
                          <>
                            <td key={`${col}-t`} className={cn('px-2 py-1.5 text-right border-l border-gray-100',
                              tgt > 0 ? 'text-gray-600' : 'text-gray-200'
                            )}>
                              {tgt > 0 ? (tgt / 1_000_000).toFixed(2) : '—'}
                            </td>
                            <td key={`${col}-r`} className={cn('px-2 py-1.5 text-right',
                              real > 0
                                ? (hit ? 'text-green-700 font-semibold' : 'text-green-600')
                                : 'text-gray-200'
                            )}>
                              {real > 0 ? (real / 1_000_000).toFixed(2) : '—'}
                            </td>
                          </>
                        )
                      })}
                      {/* Total kolom */}
                      <td className="px-2 py-1.5 text-right font-semibold text-[#1B4F72] border-l border-gray-100">
                        {totalTgt > 0 ? (totalTgt / 1_000_000).toFixed(2) : '—'}
                      </td>
                      <td className={cn('px-2 py-1.5 text-right font-semibold',
                        totalReal > 0 ? 'text-green-700' : 'text-gray-200'
                      )}>
                        {totalReal > 0 ? (totalReal / 1_000_000).toFixed(2) : '—'}
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(row)} className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700" title="Edit">
                            <Pencil size={12} />
                          </button>
                          {!isSeedRow(row.id) && (
                            <button onClick={() => setDeleteId(row.id)} className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500" title="Hapus">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                {/* Total Target */}
                <tr className="border-t-2 bg-[#1B4F72]/5 font-bold text-xs">
                  <td /><td className="px-2 py-2 text-[#1B4F72]">Total Target</td>
                  {BULAN_COLS.map((col, i) => {
                    const tgt = displayRows.reduce((s, r) => s + (r[col] ?? 0), 0)
                    const real = cashIn[i] ?? 0
                    return (
                      <>
                        <td key={`${col}-t`} className={cn('px-2 py-2 text-right border-l border-gray-100', tgt > 0 ? 'text-[#1B4F72]' : 'text-gray-300')}>
                          {tgt > 0 ? (tgt / 1_000_000).toFixed(2) : '—'}
                        </td>
                        <td key={`${col}-r`} className={cn('px-2 py-2 text-right', real > 0 ? 'text-green-700' : 'text-gray-300')}>
                          {real > 0 ? (real / 1_000_000).toFixed(2) : '—'}
                        </td>
                      </>
                    )
                  })}
                  <td className="px-2 py-2 text-right text-[#1B4F72] border-l border-gray-100">{(totalTarget / 1_000_000).toFixed(2)}</td>
                  <td className="px-2 py-2 text-right text-green-700">{(cashIn.reduce((s, v) => s + v, 0) / 1_000_000).toFixed(2)}</td>
                  <td />
                </tr>
                {/* Achievement per bulan */}
                <tr className="bg-gray-50 text-[10px] italic">
                  <td /><td className="px-2 py-1.5 text-gray-400">Achievement</td>
                  {BULAN_COLS.map((col, i) => {
                    const tgt = displayRows.reduce((s, r) => s + (r[col] ?? 0), 0)
                    const real = cashIn[i] ?? 0
                    const pct = tgt > 0 ? (real / tgt) * 100 : null
                    const cls = pct == null ? 'text-gray-300' : pct >= 100 ? 'text-green-700' : pct >= 75 ? 'text-yellow-600' : 'text-red-600'
                    return (
                      <>
                        <td key={`${col}-t`} className="border-l border-gray-100" />
                        <td key={`${col}-r`} className={cn('px-2 py-1.5 text-right font-semibold', cls)}>
                          {pct != null ? `${pct.toFixed(0)}%` : '—'}
                        </td>
                      </>
                    )
                  })}
                  <td className="border-l border-gray-100" />
                  {(() => {
                    const totalReal = cashIn.reduce((s, v) => s + v, 0)
                    const pct = totalTarget > 0 ? (totalReal / totalTarget) * 100 : null
                    return (
                      <td className={cn('px-2 py-1.5 text-right font-bold',
                        pct == null ? 'text-gray-300' : pct >= 100 ? 'text-green-700' : pct >= 75 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {pct != null ? `${pct.toFixed(1)}%` : '—'}
                      </td>
                    )
                  })()}
                  <td />
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
            <div className="grid grid-cols-4 gap-3">
              <div>
                <Label>No</Label>
                <Input {...register('no')} type="number" className="mt-1" />
                {errors.no && <p className="text-xs text-red-500 mt-1">{errors.no.message}</p>}
              </div>
              <div className="col-span-3">
                <Label>Nama Obyek Kerjasama</Label>
                <Input {...register('nama')} className="mt-1" />
                {errors.nama && <p className="text-xs text-red-500 mt-1">{errors.nama.message}</p>}
              </div>
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

    </div>
  )
}
