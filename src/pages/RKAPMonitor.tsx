import { useEffect, useMemo, useRef, useState } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useRKAPStore, rowToRKAPItem, BULAN_COLS, RKAPTargetRow } from '@/store/rkapStore'
import { RKAP_2026, BULAN_LABELS } from '@/data/rkap2026'
import { hitungRKAP, getCashInPerBulanByYear } from '@/utils/rkapUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatRupiah } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Target, TrendingUp, AlertTriangle, CheckCircle, Plus, Pencil, Trash2, Upload, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

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
    const [jan,feb,mar,apr,mei,jun,jul,agu,sep,okt,nov,des] = cols.slice(2, 14).map(toRp)
    const total = toRp(cols[14]) || [jan,feb,mar,apr,mei,jun,jul,agu,sep,okt,nov,des].reduce((a,b) => a+b, 0)
    results.push({ tahun, no, nama, total, jan,feb,mar,apr,mei,jun,jul,agu,sep,okt,nov,des })
  }
  return results
}

// ── Form schema ───────────────────────────────────────────────────────────────
const bulanField = z.coerce.number().min(0).default(0)
const rowSchema = z.object({
  no:   z.coerce.number().min(1, 'Wajib diisi'),
  nama: z.string().min(1, 'Wajib diisi'),
  jan: bulanField, feb: bulanField, mar: bulanField, apr: bulanField,
  mei: bulanField, jun: bulanField, jul: bulanField, agu: bulanField,
  sep: bulanField, okt: bulanField, nov: bulanField, des: bulanField,
})
type RowForm = z.infer<typeof rowSchema>

// ── Warna pct ─────────────────────────────────────────────────────────────────
function pctColor(pct: number) {
  if (pct >= 100) return 'text-green-700'
  if (pct >= 80)  return 'text-yellow-600'
  return 'text-red-600'
}

const CURRENT_MONTH = new Date().getMonth()

// ── Komponen utama ────────────────────────────────────────────────────────────
export function RKAPMonitor() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { rows, tahunAktif, isLoading, fetchRKAP, upsertRow, deleteRow, bulkImport, setTahunAktif } = useRKAPStore()

  const [dialogOpen, setDialogOpen]   = useState(false)
  const [editTarget, setEditTarget]   = useState<RKAPTargetRow | null>(null)
  const [deleteId, setDeleteId]       = useState<string | null>(null)
  const [csvPreview, setCsvPreview]   = useState<{ count: number; rows: ReturnType<typeof parseRKAPCsv> } | null>(null)
  const [csvDialogOpen, setCsvDialogOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<RowForm>({
    resolver: zodResolver(rowSchema),
    defaultValues: { no: rows.length + 1 },
  })

  useEffect(() => { fetchAllKompensasi() }, [])
  useEffect(() => { fetchRKAP(tahunAktif) }, [tahunAktif])

  // ── Computed data ──────────────────────────────────────────────────────────
  const rkapItems = useMemo(() =>
    rows.length > 0 ? rows.map(rowToRKAPItem) : (tahunAktif === 2026 ? RKAP_2026 : []),
    [rows, tahunAktif]
  )

  const cashIn = useMemo(() =>
    getCashInPerBulanByYear(allKompensasi, tahunAktif),
    [allKompensasi, tahunAktif]
  )

  const rkapData = useMemo(() => hitungRKAP(rkapItems, cashIn), [rkapItems, cashIn])

  const totalTarget = useMemo(() => rkapItems.reduce((s, i) => s + i.total, 0), [rkapItems])

  const ytdTargetOri  = rkapData.slice(0, CURRENT_MONTH + 1).reduce((s, m) => s + m.targetOriginal, 0)
  const ytdRealisasi  = cashIn.slice(0, CURRENT_MONTH + 1).reduce((s, v) => s + v, 0)
  const ytdAchievement = ytdTargetOri > 0 ? (ytdRealisasi / ytdTargetOri) * 100 : 0
  const currentCarryOver = rkapData[CURRENT_MONTH]?.carryOver ?? 0

  const chartData = rkapData.map(m => ({
    bulan: m.label,
    'Target Adj': Math.round(m.targetAdjusted / 1_000_000),
    'Realisasi':  Math.round(m.realisasi / 1_000_000),
  }))

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
      const [jan,feb,mar,apr,mei,jun,jul,agu,sep,okt,nov,des] = item.bulan
      return { tahun: tahunAktif, no: item.no, nama: item.nama, total: item.total,
               jan,feb,mar,apr,mei,jun,jul,agu,sep,okt,nov,des }
    })
    await bulkImport(tahunAktif, items)
  }

  const displayRows = rows.length > 0 ? rows : (tahunAktif === 2026 ? RKAP_2026.map((item, idx) => ({
    id: `seed-${idx}`, tahun: 2026, no: item.no, nama: item.nama, total: item.total,
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
          <CardTitle>Target (+ Carry-over) vs Realisasi per Bulan (Juta Rp) — {tahunAktif}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}jt`} />
              <Tooltip formatter={(v: number) => `Rp ${v.toLocaleString('id-ID')}jt`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Target Adj" fill="#94a3b8" radius={[4,4,0,0]} />
              <Bar dataKey="Realisasi"  fill="#117A65" radius={[4,4,0,0]} />
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
                  {['Bulan','Target Ori','Carry-over','Target Adj','Realisasi','Selisih','%'].map(h => (
                    <th key={h} className={cn('px-3 py-2 font-semibold text-gray-600', h === 'Bulan' ? 'text-left' : 'text-right')}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rkapData.map((m, i) => {
                  const isFuture = i > CURRENT_MONTH
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
                  <td className="px-3 py-2 text-right text-green-700">{formatRupiah(cashIn.reduce((s,v)=>s+v,0))}</td>
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
            <table className="text-xs" style={{ minWidth: 1000 }}>
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-2 py-2 text-left font-semibold text-gray-500 w-8">No</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[180px]">Obyek Kerjasama</th>
                  {BULAN_LABELS.map(b => (
                    <th key={b} className="px-2 py-2 text-right font-semibold text-gray-600 w-14">{b}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-[#1B4F72] w-20">Total</th>
                  <th className="px-2 py-2 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => (
                  <tr key={row.id} className="border-b hover:bg-gray-50/60 group">
                    <td className="px-2 py-1.5 text-gray-400">{row.no}</td>
                    <td className="px-2 py-1.5 text-gray-700 font-medium">{row.nama}</td>
                    {BULAN_COLS.map(col => {
                      const v = row[col] ?? 0
                      return (
                        <td key={col} className={cn('px-2 py-1.5 text-right', v > 0 ? 'text-gray-700' : 'text-gray-300')}>
                          {v > 0 ? (v / 1_000_000).toFixed(2) : '—'}
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right font-semibold text-[#1B4F72]">
                      {row.total > 0 ? (row.total / 1_000_000).toFixed(2) : '—'}
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
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-bold text-xs">
                  <td /><td className="px-2 py-2 text-gray-800">TOTAL</td>
                  {BULAN_COLS.map((col, i) => {
                    const tot = displayRows.reduce((s, r) => s + (r[col] ?? 0), 0)
                    return (
                      <td key={col} className={cn('px-2 py-2 text-right', tot > 0 ? 'text-[#1B4F72]' : 'text-gray-300')}>
                        {tot > 0 ? (tot / 1_000_000).toFixed(2) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-right text-[#1B4F72]">
                    {(totalTarget / 1_000_000).toFixed(2)}
                  </td>
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
    </div>
  )
}
