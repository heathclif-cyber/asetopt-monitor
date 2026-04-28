import { useEffect, useState, useMemo } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { usePBBStore } from '@/store/pbbStore'
import { useCashInStore, CASH_IN_JENIS_LABEL } from '@/store/cashInStore'
import { Kompensasi as KType, Pembayaran, CashIn } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, formatRupiah } from '@/lib/utils'
import { Plus, Pencil, Trash2, MessageSquare, FileWarning, DollarSign, ChevronDown, ChevronUp, Wand2, ArrowDownCircle } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { buatPesanWA } from '@/utils/notifikasiUtils'

// ─── Helpers generate periode ─────────────────────────────────────────────────
const BULAN = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}
function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}
function toISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

type BaseInterval = 'bulanan' | 'triwulan' | 'semesteran' | 'tahunan'
type Interval = BaseInterval | 'campuran'

type GeneratedPeriode = {
  label: string
  tgl_jatuh_tempo: string
  nominal: number
  ppn_persen: number
  total_tagihan: number
}

interface RawPeriode {
  periodeStart: Date
  periodeEnd: Date
  label: string
  nominal: number
}

// Hitung selisih bulan antara dua tanggal (toExclusive tidak ikut dihitung)
function monthsBetween(from: Date, toExclusive: Date): number {
  const y = toExclusive.getFullYear() - from.getFullYear()
  const m = toExclusive.getMonth()    - from.getMonth()
  const d = toExclusive.getDate()     - from.getDate()
  return y * 12 + m + (d < 0 ? -1 : 0)
}

function applyGracePeriod(periods: RawPeriode[], graceMulai: Date, graceSelesai: Date): RawPeriode[] {
  return periods.flatMap(p => {
    const overlapStart = new Date(Math.max(p.periodeStart.getTime(), graceMulai.getTime()))
    const overlapEnd   = new Date(Math.min(p.periodeEnd.getTime(),   graceSelesai.getTime()))
    if (overlapStart > overlapEnd) return [p]  // tidak tumpang tindih

    // Hitung dalam bulan agar 3 bulan grace = 3/12, bukan X hari / Y hari
    const totalMonths  = monthsBetween(p.periodeStart, addDays(p.periodeEnd, 1))
    const graceMonths  = monthsBetween(overlapStart,   addDays(overlapEnd,   1))

    if (graceMonths >= totalMonths) return []  // seluruh periode dalam grace — hilangkan

    const payableMonths = totalMonths - graceMonths
    return [{ ...p,
      nominal: Math.round(p.nominal * payableMonths / totalMonths),
      label: `${p.label} (prop. ${payableMonths}/${totalMonths} bln)`,
    }]
  })
}

function generatePeriode(params: {
  ksId: string
  tglMulai: string
  tglSelesai: string
  nominal: number
  interval: Interval
  campuranIntervalAwal?: BaseInterval
  campuranTahunPeralihan?: number
  campuranNominalTahunan?: number
  graceMulai?: string
  graceSelesai?: string
  ppnPersen: number
  pphPersen: number
  maksHariBayar: number
  persenDenda: number
  offsetJatuhTempo: number
}): (GeneratedPeriode & { ks_id: string; ppn_persen: number; pph_persen: number; maks_hari_bayar: number; persen_denda_per_hari: number })[] {
  const { tglMulai, tglSelesai, nominal, interval, ppnPersen, offsetJatuhTempo } = params
  const end = new Date(tglSelesai)
  const raw: RawPeriode[] = []

  const pushPeriode = (start: Date, stepMonths: number, label: string, nom: number) => {
    raw.push({
      periodeStart: new Date(start),
      periodeEnd: addDays(addMonths(start, stepMonths), -1),
      label,
      nominal: nom,
    })
  }

  const labelFor = (interval: BaseInterval, current: Date, idx: number) => {
    if (interval === 'bulanan')    return `${BULAN[current.getMonth()]} ${current.getFullYear()}`
    if (interval === 'triwulan')   return `Triwulan ${['I','II','III','IV'][Math.floor(current.getMonth() / 3)]} ${current.getFullYear()}`
    if (interval === 'semesteran') return `Semester ${current.getMonth() < 6 ? 1 : 2} ${current.getFullYear()}`
    return `Tahun ke-${idx}`
  }

  if (interval === 'campuran') {
    const awal        = params.campuranIntervalAwal ?? 'bulanan'
    const nTahun      = params.campuranTahunPeralihan ?? 1
    const stepAwal    = { bulanan: 1, triwulan: 3, semesteran: 6 }[awal as 'bulanan'|'triwulan'|'semesteran']
    const batas       = addMonths(new Date(tglMulai), nTahun * 12)
    let current       = new Date(tglMulai)
    let idxAwal       = 1

    while (current < batas && current <= end) {
      pushPeriode(current, stepAwal, labelFor(awal, current, idxAwal), nominal)
      current = addMonths(current, stepAwal)
      idxAwal++
    }

    const nomTahunan = params.campuranNominalTahunan ?? nominal * (12 / stepAwal)
    let tahunIdx = nTahun + 1
    while (current <= end) {
      pushPeriode(current, 12, `Tahun ke-${tahunIdx}`, nomTahunan)
      current = addMonths(current, 12)
      tahunIdx++
    }
  } else {
    const step = { bulanan: 1, triwulan: 3, semesteran: 6, tahunan: 12 }[interval]
    let current = new Date(tglMulai)
    let idx = 1
    while (current <= end) {
      pushPeriode(current, step, labelFor(interval, current, idx), nominal)
      current = addMonths(current, step)
      idx++
    }
  }

  const final = params.graceMulai && params.graceSelesai
    ? applyGracePeriod(raw, new Date(params.graceMulai), new Date(params.graceSelesai))
    : raw

  return final.map(p => ({
    ks_id: params.ksId,
    periode_label: p.label,
    label: p.label,
    tgl_jatuh_tempo: toISO(addDays(p.periodeStart, offsetJatuhTempo)),
    nominal: p.nominal,
    ppn_persen: params.ppnPersen,
    pph_persen: params.pphPersen,
    maks_hari_bayar: params.maksHariBayar,
    persen_denda_per_hari: params.persenDenda,
    total_tagihan: p.nominal + (p.nominal * ppnPersen / 100),
  }))
}

const genSchema = z.object({
  ks_id: z.string().min(1),
  nominal: z.coerce.number().min(1),
  interval: z.enum(['bulanan', 'triwulan', 'semesteran', 'tahunan', 'campuran']),
  campuran_interval_awal: z.enum(['bulanan', 'triwulan', 'semesteran']).default('bulanan'),
  campuran_tahun_peralihan: z.coerce.number().min(1).default(1),
  campuran_nominal_tahunan: z.coerce.number().min(0).optional(),
  ada_grace_period: z.boolean().default(false),
  grace_mulai: z.string().optional(),
  grace_bulan: z.coerce.number().min(1).optional(),
  ppn_persen: z.coerce.number().min(0).default(11),
  pph_persen: z.coerce.number().min(0).default(10),
  pph_mode: z.enum(['none', 'bukti_potong']).default('none'),
  maks_hari_bayar: z.coerce.number().min(1).default(14),
  persen_denda_per_hari: z.coerce.number().min(0).default(0.1),
  offset_jatuh_tempo: z.coerce.number().min(0).default(14),
})
type GenForm = z.infer<typeof genSchema>

const kompSchema = z.object({
  ks_id: z.string().min(1),
  periode_label: z.string().optional(),
  nominal: z.coerce.number().min(0),
  ppn_persen: z.coerce.number().min(0).default(11),
  pph_persen: z.coerce.number().min(0).default(10),
  pph_mode: z.enum(['none', 'bukti_potong']).default('none'),
  maks_hari_bayar: z.coerce.number().min(1).default(14),
  persen_denda_per_hari: z.coerce.number().min(0).default(0.1),
  tgl_jatuh_tempo: z.string().min(1),
  keterangan: z.string().optional(),
})

const bayarSchema = z.object({
  tgl_bayar: z.string().min(1),
  nominal_bayar: z.coerce.number().min(0),
  bukti_url: z.string().optional(),
  keterangan: z.string().optional(),
})

type KompForm = z.infer<typeof kompSchema>
type BayarForm = z.infer<typeof bayarSchema>

const cashInSchema = z.object({
  ks_id: z.string().min(1),
  jenis: z.enum(['denda', 'lainnya']),
  tgl_terima: z.string().min(1),
  nominal: z.coerce.number().min(1),
  keterangan: z.string().optional(),
})
type CashInForm = z.infer<typeof cashInSchema>

export function Kompensasi() {
  const { allKompensasi, isLoading, fetchAllKompensasi, addKompensasi, updateKompensasi, deleteKompensasi, bulkAddKompensasi, getKompensasiWithStatus, catatPembayaran, updatePembayaran, deletePembayaran } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { terbitkanSP, kirimNotifWA } = useNotifikasiStore()
  const { dataPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn, addCashIn, deleteCashIn } = useCashInStore()

  const [kompDialog, setKompDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<KType | null>(null)
  const [bayarDialog, setBayarDialog] = useState(false)
  const [bayarTarget, setBayarTarget] = useState<KType | null>(null)

  const [deleteKompId, setDeleteKompId]       = useState<string | null>(null)
  const [editBayarTarget, setEditBayarTarget]   = useState<Pembayaran | null>(null)
  const [editBayarDialog, setEditBayarDialog]   = useState(false)
  const [deleteBayarId, setDeleteBayarId]       = useState<string | null>(null)

  // Cash In state
  const [cashInDialog, setCashInDialog] = useState(false)
  const [cashInKsId, setCashInKsId]   = useState<string | null>(null)
  const [deleteCashInId, setDeleteCashInId] = useState<string | null>(null)
  const [isSavingCashIn, setIsSavingCashIn] = useState(false)

  // Generate periode dialog
  const [genDialog, setGenDialog] = useState(false)
  const [genStep, setGenStep] = useState<1 | 2>(1)
  const [genPreview, setGenPreview] = useState<ReturnType<typeof generatePeriode>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingKomp, setIsSavingKomp] = useState(false)
  const [filterKS, setFilterKS] = useState<string>('semua')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const kompForm = useForm<KompForm>({
    resolver: zodResolver(kompSchema),
    defaultValues: { ppn_persen: 11, pph_persen: 10, pph_mode: 'none', maks_hari_bayar: 14, persen_denda_per_hari: 0.1 },
  })

  const bayarForm     = useForm<BayarForm>({ resolver: zodResolver(bayarSchema) })
  const editBayarForm = useForm<BayarForm>({ resolver: zodResolver(bayarSchema) })
  const cashInForm    = useForm<CashInForm>({
    resolver: zodResolver(cashInSchema),
    defaultValues: { jenis: 'denda' },
  })

  const GEN_DEFAULTS = {
    interval: 'tahunan' as const,
    campuran_interval_awal: 'bulanan' as const,
    campuran_tahun_peralihan: 1,
    ada_grace_period: false,
    ppn_persen: 11, pph_persen: 10, pph_mode: 'none' as const, maks_hari_bayar: 14, persen_denda_per_hari: 0.1, offset_jatuh_tempo: 14,
  }
  const genForm = useForm<GenForm>({ resolver: zodResolver(genSchema), defaultValues: GEN_DEFAULTS })

  const watchNominal   = kompForm.watch('nominal')
  const watchPPN       = kompForm.watch('ppn_persen')
  const watchPPH       = kompForm.watch('pph_persen')
  const watchPPHMode   = kompForm.watch('pph_mode')
  const watchInterval  = genForm.watch('interval')
  const watchGrace      = genForm.watch('ada_grace_period')
  const watchGraceMulai = genForm.watch('grace_mulai')
  const watchGraceBulan = genForm.watch('grace_bulan')
  const watchCampTahun  = genForm.watch('campuran_tahun_peralihan')

  useEffect(() => { fetchAllKompensasi(); fetchKS(); fetchAllPBB(); fetchAllCashIn() }, [])

  const filtered = filterKS === 'semua' ? allKompensasi : allKompensasi.filter(k => k.ks_id === filterKS)

  const openAdd = () => {
    setEditTarget(null)
    kompForm.reset({ ppn_persen: 11, pph_persen: 10, pph_mode: 'none', maks_hari_bayar: 14, persen_denda_per_hari: 0.1 })
    setKompDialog(true)
  }

  const openEdit = (k: KType) => {
    setEditTarget(k)
    kompForm.reset({
      ks_id: k.ks_id,
      periode_label: k.periode_label ?? '',
      nominal: k.nominal,
      ppn_persen: k.ppn_persen,
      pph_persen: k.pph_persen,
      pph_mode: k.pph_mode ?? 'none',
      maks_hari_bayar: k.maks_hari_bayar,
      persen_denda_per_hari: k.persen_denda_per_hari,
      tgl_jatuh_tempo: k.tgl_jatuh_tempo,
      keterangan: k.keterangan ?? '',
    })
    setKompDialog(true)
  }

  const onSubmit = async (data: KompForm) => {
    setIsSavingKomp(true)
    try {
      if (editTarget) {
        await updateKompensasi(editTarget.id, data as any)
      } else {
        await addKompensasi(data as any)
      }
      setKompDialog(false)
    } catch (e: any) {
      alert(e.message ?? 'Gagal menyimpan kompensasi.')
    } finally {
      setIsSavingKomp(false)
    }
  }

  const openBayar = (k: KType) => {
    setBayarTarget(k)
    bayarForm.reset()
    setBayarDialog(true)
  }

  const onBayar = async (data: BayarForm) => {
    if (!bayarTarget) return
    try {
      await catatPembayaran({ ...data, kompensasi_id: bayarTarget.id } as Omit<Pembayaran, 'id' | 'created_at'>)
      setBayarDialog(false)
    } catch (e: any) {
      alert(e.message ?? 'Gagal mencatat pembayaran.')
    }
  }

  const openEditBayar = (p: Pembayaran) => {
    setEditBayarTarget(p)
    editBayarForm.reset({
      tgl_bayar: p.tgl_bayar,
      nominal_bayar: p.nominal_bayar,
      bukti_url: p.bukti_url ?? '',
      keterangan: p.keterangan ?? '',
    })
    setEditBayarDialog(true)
  }

  const onEditBayar = async (data: BayarForm) => {
    if (!editBayarTarget) return
    try {
      await updatePembayaran(editBayarTarget.id, data)
      setEditBayarDialog(false)
    } catch (e: any) {
      alert(e.message ?? 'Gagal update pembayaran.')
    }
  }

  const handleDeleteBayar = async () => {
    if (!deleteBayarId) return
    await deletePembayaran(deleteBayarId)
    setDeleteBayarId(null)
  }

  const handleDeleteKomp = async () => {
    if (!deleteKompId) return
    await deleteKompensasi(deleteKompId)
    setDeleteKompId(null)
  }

  const handleSendWA = async (k: KType) => {
    const ks = daftarKS.find(x => x.id === k.ks_id)
    if (!ks?.no_wa_mitra) { alert('No. WhatsApp mitra belum diisi di data kerja sama.'); return }
    const pesan = buatPesanWA({
      namaAset: (ks.aset as any)?.nama_aset ?? '',
      namaMitra: ks.nama_mitra,
      nominal: k.total_tagihan,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      jenisPesan: 'jatuh_tempo_h14',
    })
    const ok = await kirimNotifWA({ noWA: ks.no_wa_mitra, pesan, ksId: ks.id, jenis: 'jatuh_tempo_h14' })
    alert(ok ? 'Notifikasi WA berhasil dikirim' : 'Gagal mengirim notifikasi WA')
  }

  const handleSP = async (k: KType) => {
    const ks = daftarKS.find(x => x.id === k.ks_id)
    if (!ks) return
    const spStatus = ks.status
    const jenisSP = spStatus === 'aktif' ? 'SP1' : spStatus === 'sp1' ? 'SP2' : spStatus === 'sp2' ? 'SP3' : 'PUTUS'
    if (confirm(`Terbitkan ${jenisSP} untuk ${ks.nama_mitra}?`)) {
      await terbitkanSP(k.ks_id, k.id, jenisSP as any)
      await fetchAllKompensasi()
    }
  }

  const openCashIn = (ksId: string) => {
    setCashInKsId(ksId)
    cashInForm.reset({ ks_id: ksId, jenis: 'denda' })
    setCashInDialog(true)
  }

  const onCashIn = async (data: CashInForm) => {
    setIsSavingCashIn(true)
    try {
      await addCashIn({ ...data, kompensasi_id: null, keterangan: data.keterangan ?? null })
      setCashInDialog(false)
    } catch (e: any) {
      alert(e.message ?? 'Gagal menyimpan cash in.')
    } finally {
      setIsSavingCashIn(false)
    }
  }

  const onGenPreview = (data: GenForm) => {
    const ks = daftarKS.find(x => x.id === data.ks_id)
    if (!ks) return
    const graceSelesai = data.ada_grace_period && data.grace_mulai && data.grace_bulan
      ? toISO(addDays(addMonths(new Date(data.grace_mulai), data.grace_bulan), -1))
      : undefined
    const preview = generatePeriode({
      ksId: data.ks_id,
      tglMulai: ks.tgl_mulai,
      tglSelesai: ks.tgl_selesai,
      nominal: data.nominal,
      interval: data.interval,
      campuranIntervalAwal: data.campuran_interval_awal,
      campuranTahunPeralihan: data.campuran_tahun_peralihan,
      campuranNominalTahunan: data.campuran_nominal_tahunan,
      graceMulai:   data.ada_grace_period ? data.grace_mulai : undefined,
      graceSelesai: data.ada_grace_period ? graceSelesai     : undefined,
      ppnPersen: data.ppn_persen,
      pphPersen: data.pph_persen,
      maksHariBayar: data.maks_hari_bayar,
      persenDenda: data.persen_denda_per_hari,
      offsetJatuhTempo: data.offset_jatuh_tempo,
    })
    setGenPreview(preview)
    setGenStep(2)
  }

  const onGenSimpan = async () => {
    setIsSaving(true)
    await bulkAddKompensasi(genPreview.map(({ label, total_tagihan, ...rest }) => rest) as any)
    setIsSaving(false)
    setGenDialog(false)
    setGenStep(1)
    genForm.reset(GEN_DEFAULTS)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kompensasi</h1>
          <p className="text-sm text-gray-500">Monitoring dan pencatatan kompensasi kerja sama</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { setGenStep(1); setGenDialog(true) }}>
            <Wand2 size={15} /> Generate Periode
          </Button>
          <Button onClick={openAdd} className="bg-[#5B2C6F] hover:bg-[#5B2C6F]/90">
            <Plus size={16} /> Tambah Manual
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">Filter KS:</Label>
        <Select value={filterKS} onValueChange={setFilterKS}>
          <SelectTrigger className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Kerja Sama</SelectItem>
            {daftarKS.map(ks => (
              <SelectItem key={ks.id} value={ks.id}>{(ks.aset as any)?.nama_aset ?? '-'} — {ks.nama_mitra}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada kompensasi" description="Tambahkan kompensasi untuk kerja sama aktif." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah</Button>} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3">Mitra / Aset</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Periode</th>
                <th className="text-right px-4 py-3">Total Tagihan</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Sudah Dibayar</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Sisa</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Jatuh Tempo</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(k => {
                const pembayaran = (k as any).pembayaran as Pembayaran[] ?? []
                const ws = getKompensasiWithStatus(k, pembayaran)
                const ks = daftarKS.find(x => x.id === k.ks_id)
                const expanded = expandedId === k.id

                return (
                  <>
                    <tr key={k.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{ks?.nama_mitra ?? '-'}</p>
                        <p className="text-xs text-gray-500">{(ks?.aset as any)?.nama_aset ?? '-'}</p>
                        {ws.dendaAkumulasi.hariTerlambat > 0 && ws.statusBayar !== 'lunas' && (
                          <p className="text-xs text-red-600 mt-0.5">Terlambat {ws.dendaAkumulasi.hariTerlambat} hari</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600">{k.periode_label ?? '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <CurrencyDisplay value={k.total_tagihan} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-green-700">
                        <CurrencyDisplay value={ws.totalDibayar} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell text-red-700">
                        <CurrencyDisplay value={ws.sisaTagihan} size="sm" />
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-gray-600 text-xs">{formatTanggal(k.tgl_jatuh_tempo)}</td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge type="bayar" value={ws.statusBayar} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit kompensasi" onClick={() => openEdit(k)}>
                            <Pencil size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Hapus kompensasi" className="text-gray-400 hover:text-red-600" onClick={() => setDeleteKompId(k.id)}>
                            <Trash2 size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Catat Pembayaran" onClick={() => openBayar(k)}>
                            <DollarSign size={14} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Kirim WA" onClick={() => handleSendWA(k)}>
                            <MessageSquare size={14} />
                          </Button>
                          {ws.statusBayar === 'terlambat' && (
                            <Button variant="ghost" size="icon" title="Terbitkan SP" className="text-orange-600" onClick={() => handleSP(k)}>
                              <FileWarning size={14} />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Lihat breakdown" onClick={() => setExpandedId(expanded ? null : k.id)}>
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${k.id}-detail`} className="bg-gray-50/60">
                        <td colSpan={8} className="px-6 py-4">
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 text-xs">

                            {/* ── Rincian Tagihan + Denda ───────────────────── */}
                            <div className="space-y-3">
                              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wide">Rincian Tagihan</p>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Kompensasi</span>
                                  <span className="font-medium">{formatRupiah(k.nominal)}</span>
                                </div>
                                <div className="flex justify-between text-blue-700">
                                  <span>+ PPN ({k.ppn_persen}%)</span>
                                  <span>+ {formatRupiah(k.nominal_ppn)}</span>
                                </div>
                                {k.pph_mode === 'bukti_potong' && k.pph_persen > 0 && (
                                  <div className="flex justify-between text-orange-700">
                                    <span>− PPh ({k.pph_persen}%) <span className="text-[10px] bg-orange-100 px-1 rounded">Bukti Potong</span></span>
                                    <span>− {formatRupiah(k.nominal_pph)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                                  <span>Total Tagihan</span>
                                  <span>{formatRupiah(k.total_tagihan)}</span>
                                </div>
                              </div>

                              {ws.dendaAkumulasi.hariTerlambat > 0 && ws.statusBayar !== 'lunas' && (
                                <div className="mt-2 pt-2 border-t space-y-1">
                                  <p className="font-semibold text-red-700 text-[11px] uppercase tracking-wide">Denda</p>
                                  <div className="flex justify-between text-red-600">
                                    <span>Terlambat {ws.dendaAkumulasi.hariTerlambat} hr (denda: {Math.max(0, ws.dendaAkumulasi.hariTerlambat - k.maks_hari_bayar)} hr × {k.persen_denda_per_hari}%/hr)</span>
                                    <span className="font-medium">{formatRupiah(ws.dendaAkumulasi.nominalDenda)}</span>
                                  </div>
                                  <div className="flex justify-between text-red-500">
                                    <span>Kumulatif</span>
                                    <span>{ws.dendaAkumulasi.persenAkumulasi.toFixed(2)}%</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* ── Pembayaran ────────────────────────────────── */}
                            <div className="space-y-2">
                              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wide">Pembayaran Diterima</p>
                              {pembayaran.length === 0
                                ? <p className="text-gray-400 italic">Belum ada pembayaran</p>
                                : (
                                  <div className="space-y-1.5">
                                    {pembayaran.map(p => (
                                      <div key={p.id} className="flex items-center gap-2 group/p">
                                        <span className="text-gray-400 shrink-0 w-24">{formatTanggal(p.tgl_bayar)}</span>
                                        <span className="font-medium flex-1">{formatRupiah(p.nominal_bayar)}</span>
                                        <div className="flex items-center gap-1.5">
                                          {p.keterangan && <span className="text-gray-400 text-[10px]">{p.keterangan}</span>}
                                          {p.bukti_url && <a href={p.bukti_url} target="_blank" className="text-blue-600 hover:underline">Bukti</a>}
                                          <button
                                            onClick={() => openEditBayar(p)}
                                            className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-blue-600 opacity-0 group-hover/p:opacity-100 transition-opacity"
                                            title="Edit pembayaran"
                                          ><Pencil size={11} /></button>
                                          <button
                                            onClick={() => setDeleteBayarId(p.id)}
                                            className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 opacity-0 group-hover/p:opacity-100 transition-opacity"
                                            title="Hapus pembayaran"
                                          ><Trash2 size={11} /></button>
                                        </div>
                                      </div>
                                    ))}
                                    <div className="border-t pt-1.5 space-y-0.5">
                                      <div className="flex justify-between text-green-700 font-semibold">
                                        <span>Total Dibayar</span>
                                        <span>{formatRupiah(ws.totalDibayar)}</span>
                                      </div>
                                      <div className="flex justify-between text-red-700 font-semibold">
                                        <span>Sisa Tagihan</span>
                                        <span>{formatRupiah(ws.sisaTagihan)}</span>
                                      </div>
                                    </div>
                                  </div>
                                )
                              }
                            </div>


                             {/* -- Cash In Lainnya (denda, dll) -- */}
                             <div className="space-y-2">
                               <div className="flex items-center justify-between">
                                 <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wide">Cash In Lainnya</p>
                                 <button
                                   onClick={() => openCashIn(k.ks_id)}
                                   className="flex items-center gap-1 text-[10px] text-[#5B2C6F] hover:underline"
                                   title="Tambah denda / pendapatan lain"
                                 >
                                   <Plus size={10} /> Tambah
                                 </button>
                               </div>
                               {(() => {
                                 const ciList = allCashIn.filter(ci => ci.ks_id === k.ks_id)
                                 if (ciList.length === 0)
                                   return <p className="text-gray-400 italic">Belum ada catatan</p>
                                 return (
                                   <div className="space-y-1.5">
                                     {ciList.map(ci => (
                                       <div key={ci.id} className="flex items-center gap-2 group/ci">
                                         <ArrowDownCircle size={11} className="text-green-600 shrink-0" />
                                         <span className="text-gray-400 shrink-0 w-20 text-[10px]">{formatTanggal(ci.tgl_terima)}</span>
                                         <span className="text-[10px] text-purple-700 bg-purple-50 px-1 rounded shrink-0">
                                           {CASH_IN_JENIS_LABEL[ci.jenis]}
                                         </span>
                                         <span className="font-medium flex-1 text-green-700">{formatRupiah(ci.nominal)}</span>
                                         {ci.keterangan && <span className="text-gray-400 text-[10px]">{ci.keterangan}</span>}
                                         <button
                                           onClick={() => setDeleteCashInId(ci.id)}
                                           className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 opacity-0 group-hover/ci:opacity-100 transition-opacity"
                                           title="Hapus cash in"
                                         ><Trash2 size={10} /></button>
                                       </div>
                                     ))}
                                     <div className="border-t pt-1 flex justify-between text-green-700 font-semibold text-[11px]">
                                       <span>Total Cash In Lain</span>
                                       <span>{formatRupiah(ciList.reduce((s, ci) => s + ci.nominal, 0))}</span>
                                     </div>
                                   </div>
                                 )
                               })()}
                             </div>
                            {/* ── PBB Aset ──────────────────────────────────── */}
                            <div className="space-y-2">
                              <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wide">PBB Aset Terkait</p>
                              {(() => {
                                const asetId = (ks?.aset as any)?.id
                                const pbbList = asetId ? (dataPBB[asetId] ?? []) : []
                                if (!asetId || pbbList.length === 0)
                                  return <p className="text-gray-400 italic">Tidak ada data PBB</p>
                                return (
                                  <div className="space-y-1.5">
                                    {pbbList.map(p => (
                                      <div key={p.id} className="flex items-center gap-2">
                                        <span className="text-gray-500 w-10">{p.tahun}</span>
                                        <span className="flex-1 font-medium">{formatRupiah(p.nilai_pbb)}</span>
                                        <span className={p.status_bayar === 'lunas' ? 'text-green-600' : 'text-red-500'}>
                                          {p.status_bayar}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )
                              })()}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Dialog generate periode */}
      <Dialog open={genDialog} onOpenChange={open => { setGenDialog(open); if (!open) setGenStep(1) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {genStep === 1 ? 'Generate Periode Kompensasi' : `Preview — ${genPreview.length} periode akan dibuat`}
            </DialogTitle>
          </DialogHeader>

          {genStep === 1 && (
            <form onSubmit={genForm.handleSubmit(onGenPreview)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {/* KS */}
              <div>
                <Label>Kerja Sama</Label>
                <Select onValueChange={v => genForm.setValue('ks_id', v)}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih KS..." /></SelectTrigger>
                  <SelectContent>
                    {daftarKS.map(ks => (
                      <SelectItem key={ks.id} value={ks.id}>
                        {(ks.aset as any)?.nama_aset ?? '-'} — {ks.nama_mitra}
                        <span className="text-gray-400 ml-1 text-xs">({formatTanggal(ks.tgl_mulai)} s.d. {formatTanggal(ks.tgl_selesai)})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pola pembayaran */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Pola Pembayaran</p>

                <div>
                  <Label className="text-xs text-gray-500">Interval</Label>
                  <Select defaultValue="tahunan" onValueChange={v => genForm.setValue('interval', v as any)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bulanan">Bulanan</SelectItem>
                      <SelectItem value="triwulan">Triwulan (3 bulan)</SelectItem>
                      <SelectItem value="semesteran">Semesteran (6 bulan)</SelectItem>
                      <SelectItem value="tahunan">Tahunan</SelectItem>
                      <SelectItem value="campuran">Campuran (beberapa tahun awal berbeda)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Campuran settings */}
                {watchInterval === 'campuran' && (
                  <div className="bg-blue-50 rounded-md p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-600">Interval tahun-tahun awal</Label>
                        <Select defaultValue="bulanan" onValueChange={v => genForm.setValue('campuran_interval_awal', v as any)}>
                          <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bulanan">Bulanan</SelectItem>
                            <SelectItem value="triwulan">Triwulan</SelectItem>
                            <SelectItem value="semesteran">Semesteran</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600">Berapa tahun?</Label>
                        <Input type="number" min={1} {...genForm.register('campuran_tahun_peralihan')} className="mt-1 h-8 text-xs" />
                      </div>
                    </div>
                    <p className="text-[11px] text-blue-700">
                      Ab tahun ke-<strong>{(watchCampTahun ?? 1) + 1}</strong>: interval berubah menjadi <strong>Tahunan</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Nominal */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{watchInterval === 'campuran' ? `Nominal per Periode (${genForm.watch('campuran_interval_awal') ?? 'bulanan'})` : 'Nominal per Periode'} (Rp)</Label>
                  <Controller control={genForm.control} name="nominal" render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
                  )} />
                </div>
                {watchInterval === 'campuran' && (
                  <div>
                    <Label>Nominal Tahunan (ab tahun ke-{(watchCampTahun ?? 1) + 1}) (Rp)</Label>
                    <Controller control={genForm.control} name="campuran_nominal_tahunan" render={({ field }) => (
                      <CurrencyInput value={field.value ?? 0} onChange={field.onChange} className="mt-1" />
                    )} />
                  </div>
                )}
              </div>

              {/* Grace period */}
              <div className="border rounded-lg p-3 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Controller control={genForm.control} name="ada_grace_period" render={({ field }) => (
                    <input type="checkbox" checked={field.value} onChange={e => field.onChange(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 accent-[#5B2C6F] cursor-pointer" />
                  )} />
                  <span className="text-sm font-medium text-gray-700">Ada Grace Period?</span>
                </label>

                {watchGrace && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-gray-600">Tanggal Mulai Grace Period</Label>
                        <Input type="date" {...genForm.register('grace_mulai')} className="mt-1 h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600">Durasi Grace Period (bulan)</Label>
                        <Input type="number" min={1} placeholder="cth: 3" {...genForm.register('grace_bulan')} className="mt-1 h-8 text-xs" />
                      </div>
                    </div>
                    {watchGraceMulai && (watchGraceBulan ?? 0) > 0 && (
                      <div className="bg-white border border-orange-200 rounded px-2 py-1.5 text-[11px] text-orange-800 flex items-center gap-2">
                        <span>Grace period:</span>
                        <span className="font-semibold">{formatTanggal(watchGraceMulai)}</span>
                        <span>s.d.</span>
                        <span className="font-semibold">
                          {formatTanggal(toISO(addDays(addMonths(new Date(watchGraceMulai), watchGraceBulan ?? 0), -1)))}
                        </span>
                        <span className="text-orange-500">({watchGraceBulan} bulan)</span>
                      </div>
                    )}
                    <p className="text-[11px] text-orange-700 bg-orange-50 rounded px-2 py-1.5">
                      Periode yang seluruhnya dalam grace period tidak dikenakan kompensasi.
                      Periode yang terpotong dihitung proporsional per bulan.
                    </p>
                  </div>
                )}
              </div>

              {/* Parameter */}
              <div className="border rounded-lg p-3 space-y-3">
                <p className="text-xs font-semibold text-gray-700">Parameter</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">PPN (%)</Label>
                    <Input type="number" step="0.01" {...genForm.register('ppn_persen')} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">PPh (%)</Label>
                    <Input type="number" step="0.01" {...genForm.register('pph_persen')} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">% Denda/Hari</Label>
                    <Input type="number" step="0.001" {...genForm.register('persen_denda_per_hari')} className="mt-1 h-8 text-xs" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Mode PPh</Label>
                  <Select defaultValue="none" onValueChange={v => genForm.setValue('pph_mode', v as any)}>
                    <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak dipotong dari invoice (PPh = 0 atau ditanggung perusahaan)</SelectItem>
                      <SelectItem value="bukti_potong">Bukti Potong — PPh mengurangi nilai invoice</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-gray-500">Maks Hari Bayar</Label>
                    <Input type="number" {...genForm.register('maks_hari_bayar')} className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Jatuh Tempo (hari setelah awal periode)</Label>
                    <Input type="number" {...genForm.register('offset_jatuh_tempo')} className="mt-1 h-8 text-xs" />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGenDialog(false)}>Batal</Button>
                <Button type="submit" className="bg-[#5B2C6F]">Lihat Preview →</Button>
              </DialogFooter>
            </form>
          )}

          {genStep === 2 && (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b text-gray-600 text-xs uppercase">
                      <th className="text-left px-3 py-2">No</th>
                      <th className="text-left px-3 py-2">Label Periode</th>
                      <th className="text-left px-3 py-2">Jatuh Tempo</th>
                      <th className="text-right px-3 py-2">Nominal</th>
                      <th className="text-right px-3 py-2">Total Tagihan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {genPreview.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{p.label}</td>
                        <td className="px-3 py-2 text-gray-600">{formatTanggal(p.tgl_jatuh_tempo)}</td>
                        <td className="px-3 py-2 text-right">{formatRupiah(p.nominal)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#5B2C6F]">{formatRupiah(p.total_tagihan)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t font-semibold">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right text-xs text-gray-600">Total seluruh periode:</td>
                      <td className="px-3 py-2 text-right text-[#5B2C6F]">
                        {formatRupiah(genPreview.reduce((s, p) => s + p.total_tagihan, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setGenStep(1)}>← Kembali</Button>
                <Button onClick={onGenSimpan} disabled={isSaving} className="bg-[#5B2C6F]">
                  {isSaving ? 'Menyimpan...' : `Simpan ${genPreview.length} Periode`}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog tambah / edit kompensasi */}
      <Dialog key={editTarget?.id ?? 'new'} open={kompDialog} onOpenChange={setKompDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Kompensasi' : 'Tambah Kompensasi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={kompForm.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Kerja Sama</Label>
              <Select
                value={kompForm.watch('ks_id') ?? ''}
                onValueChange={v => kompForm.setValue('ks_id', v, { shouldValidate: true })}
                disabled={!!editTarget}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih KS..." /></SelectTrigger>
                <SelectContent>
                  {daftarKS.map(ks => <SelectItem key={ks.id} value={ks.id}>{(ks.aset as any)?.nama_aset ?? '-'} — {ks.nama_mitra}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Label Periode</Label>
              <Input {...kompForm.register('periode_label')} className="mt-1" placeholder="cth: Tahun ke-1 2025" />
            </div>
            <div>
              <Label>Nominal Kompensasi (Rp)</Label>
              <Controller control={kompForm.control} name="nominal" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>PPN (%)</Label>
                <Input type="number" step="0.01" {...kompForm.register('ppn_persen')} className="mt-1" />
              </div>
              <div>
                <Label>PPh (%)</Label>
                <Input type="number" step="0.01" {...kompForm.register('pph_persen')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Mode PPh</Label>
              <Select
                value={watchPPHMode ?? 'none'}
                onValueChange={v => kompForm.setValue('pph_mode', v as any)}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak dipotong dari invoice</SelectItem>
                  <SelectItem value="bukti_potong">Bukti Potong — PPh mengurangi nilai invoice</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {watchNominal > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                {(() => {
                  const nom = watchNominal ?? 0
                  const ppn = nom * (watchPPN ?? 11) / 100
                  const pph = nom * (watchPPH ?? 10) / 100
                  const isBuktiPotong = watchPPHMode === 'bukti_potong'
                  const total = nom + ppn - (isBuktiPotong ? pph : 0)
                  return (
                    <>
                      <div className="flex justify-between text-gray-500">
                        <span>Kompensasi</span><span>{formatRupiah(nom)}</span>
                      </div>
                      <div className="flex justify-between text-blue-700">
                        <span>+ PPN ({watchPPN ?? 11}%)</span><span>+ {formatRupiah(ppn)}</span>
                      </div>
                      {isBuktiPotong && (
                        <div className="flex justify-between text-orange-700">
                          <span>− PPh ({watchPPH ?? 10}%) [Bukti Potong]</span><span>− {formatRupiah(pph)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold border-t pt-1">
                        <span>Total Tagihan</span><span>{formatRupiah(total)}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Maks Hari Bayar</Label>
                <Input type="number" {...kompForm.register('maks_hari_bayar')} className="mt-1" />
              </div>
              <div>
                <Label>% Denda / Hari</Label>
                <Input type="number" step="0.001" {...kompForm.register('persen_denda_per_hari')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Tanggal Jatuh Tempo</Label>
              <Input type="date" {...kompForm.register('tgl_jatuh_tempo')} className="mt-1" />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...kompForm.register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setKompDialog(false)}>Batal</Button>
              <Button type="submit" disabled={isSavingKomp} className="bg-[#5B2C6F]">
                {isSavingKomp ? 'Menyimpan...' : editTarget ? 'Simpan' : 'Tambah'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog catat pembayaran */}
      {/* ── Catat pembayaran baru ────────────────────────────────────────── */}
      <Dialog open={bayarDialog} onOpenChange={setBayarDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Catat Pembayaran</DialogTitle></DialogHeader>
          <form onSubmit={bayarForm.handleSubmit(onBayar)} className="space-y-4">
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...bayarForm.register('tgl_bayar')} className="mt-1" />
            </div>
            <div>
              <Label>Nominal Dibayarkan (Rp)</Label>
              <Controller control={bayarForm.control} name="nominal_bayar" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Link Bukti Transfer</Label>
              <Input {...bayarForm.register('bukti_url')} className="mt-1" placeholder="https://..." />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...bayarForm.register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBayarDialog(false)}>Batal</Button>
              <Button type="submit" className="bg-[#1E8449]">Catat Pembayaran</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit pembayaran ───────────────────────────────────────────────── */}
      <Dialog open={editBayarDialog} onOpenChange={setEditBayarDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Pembayaran</DialogTitle></DialogHeader>
          <form onSubmit={editBayarForm.handleSubmit(onEditBayar)} className="space-y-4">
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...editBayarForm.register('tgl_bayar')} className="mt-1" />
            </div>
            <div>
              <Label>Nominal Dibayarkan (Rp)</Label>
              <Controller control={editBayarForm.control} name="nominal_bayar" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Link Bukti Transfer</Label>
              <Input {...editBayarForm.register('bukti_url')} className="mt-1" placeholder="https://..." />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...editBayarForm.register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditBayarDialog(false)}>Batal</Button>
              <Button type="submit" className="bg-[#1E8449]">Simpan Perubahan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi hapus pembayaran ───────────────────────────────────── */}
      <Dialog open={!!deleteBayarId} onOpenChange={() => setDeleteBayarId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Catatan Pembayaran?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Data pembayaran ini akan dihapus permanen dan tidak dapat dikembalikan.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteBayarId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteBayar}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi hapus kompensasi ───────────────────────────────────── */}
      <Dialog open={!!deleteKompId} onOpenChange={() => setDeleteKompId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Kompensasi?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Kompensasi beserta seluruh catatan pembayarannya akan dihapus permanen.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteKompId(null)}>Batal</Button>
            <Button variant="destructive" onClick={handleDeleteKomp}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog tambah cash in ──────────────────────────────────────────── */}
      <Dialog open={cashInDialog} onOpenChange={open => { setCashInDialog(open) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tambah Cash In Lainnya</DialogTitle></DialogHeader>
          <form onSubmit={cashInForm.handleSubmit(onCashIn)} className="space-y-4">
            <div>
              <Label>Kerja Sama</Label>
              <p className="mt-1 text-sm font-medium text-gray-800">
                {cashInKsId ? (() => { const ks = daftarKS.find(x => x.id === cashInKsId); return `${(ks?.aset as any)?.nama_aset ?? '-'} — ${ks?.nama_mitra ?? '-'}` })() : '-'}
              </p>
            </div>
            <div>
              <Label>Jenis Pemasukan</Label>
              <Controller control={cashInForm.control} name="jenis" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="denda">Denda Keterlambatan</SelectItem>
                    <SelectItem value="lainnya">Pendapatan Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div>
              <Label>Tanggal Diterima</Label>
              <Input type="date" {...cashInForm.register('tgl_terima')} className="mt-1" />
            </div>
            <div>
              <Label>Nominal (Rp)</Label>
              <Controller control={cashInForm.control} name="nominal" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...cashInForm.register('keterangan')} className="mt-1" rows={2}
                placeholder="cth: Denda keterlambatan Januari 2025 (15 hari)" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCashInDialog(false)}>Batal</Button>
              <Button type="submit" className="bg-[#1E8449]" disabled={isSavingCashIn}>
                {isSavingCashIn ? 'Menyimpan...' : 'Simpan Cash In'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Konfirmasi hapus cash in ───────────────────────────────────────── */}
      <Dialog open={!!deleteCashInId} onOpenChange={() => setDeleteCashInId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Hapus Cash In?</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Data cash in ini akan dihapus permanen.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCashInId(null)}>Batal</Button>
            <Button variant="destructive" onClick={async () => { if (deleteCashInId) { await deleteCashIn(deleteCashInId); setDeleteCashInId(null) } }}>Hapus</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
