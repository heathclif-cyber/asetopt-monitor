import { Fragment, useEffect, useState, useMemo } from 'react'
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
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, formatRupiah } from '@/lib/utils'
import { api } from '@/lib/apiClient'
import { Plus, Pencil, Trash2, MessageSquare, FileWarning, FileText, ChevronDown, ChevronUp, Wand2, ArrowDownCircle, CalendarDays, List, GitBranch, ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { buatPesanWA } from '@/utils/notifikasiUtils'
import { useRKAPStore } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { hitungProgressPersen } from '@/utils/akrualUtils'
import type { Aset } from '@/types'

/** Opsi proker: master RKAP + aset/KS yang belum ada di RKAP (agar bisa di-tag). */
type ProgramOption = { kode: string; nama: string; inRkap: boolean }
type PaymentFilter = 'perlu_tindak_lanjut' | 'semua' | 'belum_bayar' | 'terlambat' | 'sebagian' | 'lunas'
type ViewMode = 'daftar' | 'kalender' | 'alur'
const PAGE_SIZE = 20



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
  /** Tanggal cetak tagihan (invoice_tgl) */
  invoice_tgl: string
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
  /** Hari setelah awal periode → tanggal cetak tagihan */
  offsetCetakTagihan: number
  /** Hari setelah awal periode → jatuh tempo */
  offsetJatuhTempo: number
}): (GeneratedPeriode & { ks_id: string; ppn_persen: number; pph_persen: number; maks_hari_bayar: number; persen_denda_per_hari: number; invoice_tgl: string })[] {
  const { tglMulai, tglSelesai, nominal, interval, ppnPersen, offsetJatuhTempo, offsetCetakTagihan } = params
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
    invoice_tgl: toISO(addDays(p.periodeStart, offsetCetakTagihan)),
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
  /** ID Monika — wajib agar realisasi tidak dobel by nama */
  rkap_kode: z.string().trim().min(1, 'ID Monika wajib dipilih'),
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
  // Grace denda setelah JT — default 0 (denda mulai H+1 lewat JT)
  maks_hari_bayar: z.coerce.number().min(0).default(0),
  persen_denda_per_hari: z.coerce.number().min(0).default(0.1),
  offset_cetak_tagihan: z.coerce.number().min(0).default(0),
  offset_jatuh_tempo: z.coerce.number().min(0).default(14),
})
type GenForm = z.infer<typeof genSchema>

const kompSchema = z.object({
  ks_id: z.string().min(1),
  rkap_kode: z.string().trim().min(1, 'ID Monika wajib dipilih'),
  periode_label: z.string().optional(),
  nominal: z.coerce.number().min(0),
  ppn_persen: z.coerce.number().min(0).default(11),
  pph_persen: z.coerce.number().min(0).default(10),
  pph_mode: z.enum(['none', 'bukti_potong']).default('none'),
  maks_hari_bayar: z.coerce.number().min(0).default(0),
  persen_denda_per_hari: z.coerce.number().min(0).default(0.1),
  /** Tanggal cetak tagihan (kolom DB: invoice_tgl) */
  invoice_tgl: z.string().optional().or(z.literal('')),
  tgl_jatuh_tempo: z.string().min(1),
  keterangan: z.string().optional(),
  pengurang: z.coerce.number().min(0).default(0),
  keterangan_pengurang: z.string().optional(),
})

type KompForm = z.infer<typeof kompSchema>

const cashInSchema = z.object({
  ks_id: z.string().min(1),
  rkap_kode: z.string().trim().min(1, 'ID Monika wajib dipilih'),
  jenis: z.enum(['denda', 'lainnya']),
  tgl_terima: z.string().min(1),
  nominal: z.coerce.number().min(1),
  keterangan: z.string().optional(),
})
type CashInForm = z.infer<typeof cashInSchema>

const paymentSchema = z.object({
  tgl_bayar: z.string().min(1, 'Tanggal bayar wajib diisi'),
  nominal_bayar: z.coerce.number().min(1, 'Nominal pembayaran harus lebih dari Rp0'),
  is_pph_disetor: z.boolean().optional(),
  bukti_url: z.string().optional(),
  keterangan: z.string().optional(),
})
type PaymentForm = z.infer<typeof paymentSchema>

export function Kompensasi() {
  const { allKompensasi, isLoading, fetchAllKompensasi, addKompensasi, updateKompensasi, deleteKompensasi, bulkAddKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { terbitkanSP, kirimNotifWA } = useNotifikasiStore()
  const { dataPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn, addCashIn, deleteCashIn } = useCashInStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarPDDM, fetchAll: fetchPDDM } = usePendapatanStore()

  const [kompDialog, setKompDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<KType | null>(null)
  const [adaPengurang, setAdaPengurang] = useState(false)


  const [deleteKompId, setDeleteKompId]       = useState<string | null>(null)


  // Cash In state
  const [cashInDialog, setCashInDialog] = useState(false)
  const [cashInKsId, setCashInKsId]   = useState<string | null>(null)
  const [deleteCashInId, setDeleteCashInId] = useState<string | null>(null)
  const [isSavingCashIn, setIsSavingCashIn] = useState(false)
  const [paymentDialog, setPaymentDialog] = useState(false)
  const [paymentTarget, setPaymentTarget] = useState<Pembayaran | null>(null)
  const [paymentKompensasi, setPaymentKompensasi] = useState<KType | null>(null)
  const [isSavingPayment, setIsSavingPayment] = useState(false)

  // Generate periode dialog
  const [genDialog, setGenDialog] = useState(false)
  const [genStep, setGenStep] = useState<1 | 2>(1)
  const [genPreview, setGenPreview] = useState<ReturnType<typeof generatePeriode>>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingKomp, setIsSavingKomp] = useState(false)
  const [filterKS, setFilterKS] = useState<string>('semua')
  const [filterBulan, setFilterBulan] = useState<string>('semua')
  const [filterStatus, setFilterStatus] = useState<PaymentFilter>('perlu_tindak_lanjut')
  const [sortBy, setSortBy] = useState<string>('jatuh_tempo_asc')
  const [viewMode, setViewMode] = useState<ViewMode>('daftar')
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const kompForm = useForm<KompForm>({
    resolver: zodResolver(kompSchema),
    defaultValues: { ppn_persen: 11, pph_persen: 10, pph_mode: 'none', maks_hari_bayar: 0, persen_denda_per_hari: 0.1 },
  })


  const cashInForm    = useForm<CashInForm>({
    resolver: zodResolver(cashInSchema),
    defaultValues: { jenis: 'denda' },
  })
  const paymentForm = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema) })

  const GEN_DEFAULTS = {
    interval: 'tahunan' as const,
    campuran_interval_awal: 'bulanan' as const,
    campuran_tahun_peralihan: 1,
    ada_grace_period: false,
    ppn_persen: 11, pph_persen: 10, pph_mode: 'none' as const,
    maks_hari_bayar: 0, persen_denda_per_hari: 0.1,
    offset_cetak_tagihan: 0,
    offset_jatuh_tempo: 14,
  }
  const genForm = useForm<GenForm>({ resolver: zodResolver(genSchema), defaultValues: GEN_DEFAULTS })

  const watchNominal       = kompForm.watch('nominal')
  const watchPPN           = kompForm.watch('ppn_persen')
  const watchPPH           = kompForm.watch('pph_persen')
  const watchPPHMode       = kompForm.watch('pph_mode')
  const watchPengurang     = kompForm.watch('pengurang')
  const watchKetPengurang  = kompForm.watch('keterangan_pengurang')
  const watchInterval  = genForm.watch('interval')
  const watchGrace      = genForm.watch('ada_grace_period')
  const watchGraceMulai = genForm.watch('grace_mulai')
  const watchGraceBulan = genForm.watch('grace_bulan')
  const watchCampTahun  = genForm.watch('campuran_tahun_peralihan')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchAset()
    fetchAllPBB()
    fetchAllCashIn()
    fetchRKAP(new Date().getFullYear())
    fetchPDDM()
  }, [])

  /** Proker dari RKAP + aset master + aset di KS (termasuk di luar RKAP). */
  const programOptions = useMemo(() => {
    const map = new Map<string, ProgramOption>()
    rkapRows.forEach(r => {
      const kode = r.kode?.trim()
      if (!kode) return
      map.set(kode, { kode, nama: r.nama, inRkap: true })
    })
    const addAset = (a: Aset | null | undefined) => {
      if (!a) return
      const kode = a.kode_aset?.trim()
      if (!kode) return
      if (!map.has(kode)) map.set(kode, { kode, nama: a.nama_aset, inRkap: false })
    }
    daftarAset.forEach(addAset)
    daftarKS.forEach(ks => addAset(ks.aset as Aset | undefined))
    return Array.from(map.values()).sort((a, b) => {
      if (a.inRkap !== b.inRkap) return a.inRkap ? -1 : 1
      return a.nama.localeCompare(b.nama, 'id')
    })
  }, [rkapRows, daftarAset, daftarKS])

  const resolveKodeFromKs = (ksId: string | undefined | null): string | undefined => {
    if (!ksId) return undefined
    const ks = daftarKS.find(x => x.id === ksId)
    const kode = (ks?.aset as Aset | undefined)?.kode_aset?.trim()
    return kode || undefined
  }

  const ksOptions = useMemo(
    () =>
      daftarKS.map(ks => {
        const asetNama = (ks.aset as Aset | undefined)?.nama_aset ?? '-'
        const kode = (ks.aset as Aset | undefined)?.kode_aset ?? ''
        return {
          value: ks.id,
          label: `${asetNama} — ${ks.nama_mitra}`,
          searchText: `${kode} ${asetNama} ${ks.nama_mitra} ${ks.no_perjanjian ?? ''}`,
          description: kode
            ? `${kode} · ${formatTanggal(ks.tgl_mulai)} s.d. ${formatTanggal(ks.tgl_selesai)}`
            : `${formatTanggal(ks.tgl_mulai)} s.d. ${formatTanggal(ks.tgl_selesai)}`,
        }
      }),
    [daftarKS],
  )

  const programSelectOptions = useMemo(
    () =>
      programOptions
        .filter(item => item.kode.trim()) // hanya opsi ber-ID Monika
        .map(item => ({
          value: item.kode,
          label: `${item.kode} — ${item.nama}`,
          searchText: `${item.kode} ${item.nama}`,
          description: item.inRkap ? 'ID Monika · terdaftar RKAP' : 'ID Monika · master Data Aset',
        })),
    [programOptions],
  )

  const availableBulan = useMemo(() => {
    const months = new Set(allKompensasi.map(k => k.tgl_jatuh_tempo.slice(0, 7)))
    return Array.from(months).sort()
  }, [allKompensasi])

  const filtered = useMemo(() => {
    let result = allKompensasi
    if (filterKS !== 'semua') result = result.filter(k => k.ks_id === filterKS)
    if (filterBulan !== 'semua') result = result.filter(k => k.tgl_jatuh_tempo.startsWith(filterBulan))
    result = result.filter(k => {
      const pembayaran = (k as any).pembayaran as Pembayaran[] ?? []
      const status = getKompensasiWithStatus(k, pembayaran).statusBayar
      if (filterStatus === 'semua') return true
      if (filterStatus === 'perlu_tindak_lanjut') return status === 'belum_bayar' || status === 'terlambat'
      return status === filterStatus
    })
    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'jatuh_tempo_asc':  return a.tgl_jatuh_tempo.localeCompare(b.tgl_jatuh_tempo)
        case 'jatuh_tempo_desc': return b.tgl_jatuh_tempo.localeCompare(a.tgl_jatuh_tempo)
        case 'tagihan_desc':     return (b.total_tagihan ?? 0) - (a.total_tagihan ?? 0)
        case 'tagihan_asc':      return (a.total_tagihan ?? 0) - (b.total_tagihan ?? 0)
        default: return 0
      }
    })
  }, [allKompensasi, filterKS, filterBulan, filterStatus, sortBy, getKompensasiWithStatus])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  useEffect(() => { setPage(1) }, [filterKS, filterBulan, filterStatus, sortBy])
  // Calendar and flow views open an item in the list; show the page holding it.
  useEffect(() => {
    if (!expandedId || viewMode !== 'daftar') return
    const index = filtered.findIndex(k => k.id === expandedId)
    if (index >= 0) setPage(Math.floor(index / PAGE_SIZE) + 1)
  }, [expandedId, viewMode])

  const ringkasan = useMemo(() => {
    let tagihan = 0, sisa = 0, terlambat = 0, denda = 0
    filtered.forEach(k => {
      const ws = getKompensasiWithStatus(k, (k as any).pembayaran ?? [])
      tagihan += ws.efektifTagihan
      sisa += ws.sisaTagihan
      if (ws.statusBayar === 'terlambat') { terlambat += 1; denda += ws.dendaAkumulasi.nominalDenda }
    })
    return { tagihan, sisa, terlambat, denda }
  }, [filtered, getKompensasiWithStatus])

  const calendarData = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const firstDay = new Date(year, month - 1, 1)
    const offset = (firstDay.getDay() + 6) % 7
    const dayCount = new Date(year, month, 0).getDate()
    const cellCount = Math.ceil((offset + dayCount) / 7) * 7
    const events = new Map<string, KType[]>()
    filtered.forEach(k => {
      const list = events.get(k.tgl_jatuh_tempo) ?? []
      list.push(k)
      events.set(k.tgl_jatuh_tempo, list)
    })
    return {
      label: `${BULAN[month - 1]} ${year}`,
      cells: Array.from({ length: cellCount }, (_, i) => {
        const day = i - offset + 1
        const iso = `${calendarMonth}-${String(day).padStart(2, '0')}`
        return { day, inMonth: day >= 1 && day <= dayCount, iso, events: events.get(iso) ?? [] }
      }),
    }
  }, [calendarMonth, filtered])

  const dueChartData = useMemo(() => filtered.map(k => {
    const ws = getKompensasiWithStatus(k, (k as any).pembayaran ?? [])
    const ks = daftarKS.find(x => x.id === k.ks_id)
    return {
      id: k.id,
      tanggal: k.tgl_jatuh_tempo,
      label: formatTanggal(k.tgl_jatuh_tempo),
      singkat: new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(`${k.tgl_jatuh_tempo}T00:00:00`)),
      nilai: ws.sisaTagihan,
      mitra: ks?.nama_mitra ?? '-',
      aset: (ks?.aset as any)?.nama_aset ?? '-',
      periode: k.periode_label ?? '-',
      status: ws.statusBayar,
    }
  }), [filtered, daftarKS, getKompensasiWithStatus])

  const shiftCalendarMonth = (delta: number) => {
    const [year, month] = calendarMonth.split('-').map(Number)
    const next = new Date(year, month - 1 + delta, 1)
    setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`)
  }

  const openAdd = () => {
    setEditTarget(null)
    setAdaPengurang(false)
    kompForm.reset({
      ppn_persen: 11, pph_persen: 10, pph_mode: 'none',
      maks_hari_bayar: 0, persen_denda_per_hari: 0.1,
      pengurang: 0, keterangan_pengurang: '',
      invoice_tgl: '', tgl_jatuh_tempo: '',
    })
    setKompDialog(true)
  }

  const openEdit = (k: KType) => {
    setEditTarget(k)
    setAdaPengurang((k.pengurang ?? 0) > 0)
    kompForm.reset({
      ks_id: k.ks_id,
      rkap_kode: k.rkap_kode ?? '',
      periode_label: k.periode_label ?? '',
      nominal: k.nominal,
      ppn_persen: k.ppn_persen,
      pph_persen: k.pph_persen,
      pph_mode: k.pph_mode ?? 'none',
      maks_hari_bayar: k.maks_hari_bayar,
      persen_denda_per_hari: k.persen_denda_per_hari,
      invoice_tgl: k.invoice_tgl ?? '',
      tgl_jatuh_tempo: k.tgl_jatuh_tempo,
      keterangan: k.keterangan ?? '',
      pengurang: k.pengurang ?? 0,
      keterangan_pengurang: k.keterangan_pengurang ?? '',
    })
    setKompDialog(true)
  }

  const onSubmit = async (data: KompForm) => {
    setIsSavingKomp(true)
    try {
      const payload = {
        ...data,
        // Tidak ada grace setelah JT — denda mulai H+1
        maks_hari_bayar: 0,
        invoice_tgl: data.invoice_tgl?.trim() ? data.invoice_tgl : null,
        pengurang: adaPengurang ? (data.pengurang ?? 0) : 0,
        keterangan_pengurang: adaPengurang ? (data.keterangan_pengurang ?? null) : null,
      }
      if (editTarget) {
        await updateKompensasi(editTarget.id, payload as any)
      } else {
        await addKompensasi(payload as any)
      }
      setKompDialog(false)
    } catch (e: any) {
      alert(e.message ?? 'Gagal menyimpan kompensasi.')
    } finally {
      setIsSavingKomp(false)
    }
  }

  const handleDeleteKomp = async () => {
    if (!deleteKompId) return
    await deleteKompensasi(deleteKompId)
    setDeleteKompId(null)
  }

  const openPaymentEdit = (pembayaran: Pembayaran, kompensasi: KType) => {
    if (kompensasi.superman?.trim()) {
      alert('Kompensasi sudah punya nomor Superman — pembayaran tidak bisa diubah.')
      return
    }
    setPaymentTarget(pembayaran)
    setPaymentKompensasi(kompensasi)
    paymentForm.reset({
      tgl_bayar: String(pembayaran.tgl_bayar).slice(0, 10),
      nominal_bayar: pembayaran.nominal_bayar,
      is_pph_disetor: pembayaran.is_pph_disetor ?? false,
      bukti_url: pembayaran.bukti_url ?? '',
      keterangan: pembayaran.keterangan ?? '',
    })
    setPaymentDialog(true)
  }

  const savePaymentEdit = async (data: PaymentForm) => {
    if (!paymentTarget) return
    setIsSavingPayment(true)
    try {
      await api.patch<Pembayaran>(`/api/pembayaran/${paymentTarget.id}`, {
        tgl_bayar: data.tgl_bayar,
        nominal_bayar: data.nominal_bayar,
        is_pph_disetor: data.is_pph_disetor ?? false,
        bukti_url: data.bukti_url?.trim() || null,
        keterangan: data.keterangan?.trim() || null,
      })
      await fetchAllKompensasi()
      setPaymentDialog(false)
      setPaymentTarget(null)
      setPaymentKompensasi(null)
    } catch (e: any) {
      alert(e.message ?? 'Gagal mengubah pembayaran.')
    } finally {
      setIsSavingPayment(false)
    }
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
    cashInForm.reset({
      ks_id: ksId,
      jenis: 'denda',
      rkap_kode: resolveKodeFromKs(ksId) ?? '',
    })
    setCashInDialog(true)
  }

  const onCashIn = async (data: CashInForm) => {
    setIsSavingCashIn(true)
    try {
      await addCashIn({ ...data, kompensasi_id: null, rkap_kode: data.rkap_kode ?? null, keterangan: data.keterangan ?? null })
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
      maksHariBayar: 0,
      persenDenda: data.persen_denda_per_hari,
      offsetCetakTagihan: data.offset_cetak_tagihan,
      offsetJatuhTempo: data.offset_jatuh_tempo,
    })
    setGenPreview(preview)
    setGenStep(2)
  }

  const onGenSimpan = async () => {
    setIsSaving(true)
    const rkapKode = genForm.getValues('rkap_kode') || null
    await bulkAddKompensasi(genPreview.map(({ label, total_tagihan, ...rest }) => ({
      ...rest,
      rkap_kode: rkapKode,
      invoice_tgl: rest.invoice_tgl || null,
    })) as any)

    setIsSaving(false)
    setGenDialog(false)
    setGenStep(1)
    genForm.reset(GEN_DEFAULTS)
  }

  const renderTags = (k: KType) => (k.rkap_kode || k.no_invoice || k.superman) ? (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {k.rkap_kode && <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] text-blue-600">{k.rkap_kode}</span>}
      {k.no_invoice && <span className="text-[10px] text-gray-500">{k.no_invoice}</span>}
      {k.superman && <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">{k.superman}</span>}
    </div>
  ) : null

  const renderLate = (ws: ReturnType<typeof getKompensasiWithStatus>) => ws.dendaAkumulasi.hariTerlambat > 0 ? (
    <p className="mt-1 text-xs text-red-600">
      {ws.statusBayar === 'lunas' ? 'Dibayar terlambat' : 'Terlambat'} {ws.dendaAkumulasi.hariTerlambat} hari
      {ws.dendaAkumulasi.nominalDenda > 0.5 && <span className="block">denda {formatRupiah(ws.dendaAkumulasi.nominalDenda)}</span>}
    </p>
  ) : null

  const renderPaymentProgress = (ws: ReturnType<typeof getKompensasiWithStatus>) => {
    const persen = ws.efektifTagihan > 0 ? Math.min(100, (ws.totalDibayar / ws.efektifTagihan) * 100) : 0
    return <div>
      <div className="flex justify-between gap-2 text-xs"><span className="text-green-700">{formatRupiah(ws.totalDibayar)}</span><span className="text-gray-400">{persen.toFixed(0)}%</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-green-500" style={{ width: `${persen}%` }} /></div>
      {ws.sisaTagihan > 0 && <p className="mt-1 text-xs text-red-700">Sisa {formatRupiah(ws.sisaTagihan)}</p>}
    </div>
  }

  const renderActions = (k: KType, ws: ReturnType<typeof getKompensasiWithStatus>, expanded: boolean) => (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit kompensasi" onClick={() => openEdit(k)}><Pencil size={14} /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Buat invoice" asChild><Link to={`/jalur-b/invoice?kompensasi_id=${k.id}`}><FileText size={14} /></Link></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title="Kirim WA" onClick={() => handleSendWA(k)}><MessageSquare size={14} /></Button>
      {ws.statusBayar === 'terlambat' && <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600" title="Terbitkan SP" onClick={() => handleSP(k)}><FileWarning size={14} /></Button>}
      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-600" title="Hapus kompensasi" onClick={() => setDeleteKompId(k.id)}><Trash2 size={14} /></Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" title={expanded ? 'Tutup rincian' : 'Lihat rincian'} onClick={() => setExpandedId(expanded ? null : k.id)}>{expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</Button>
    </div>
  )

  // Breakdown shown under an expanded row (desktop) or card (mobile).
  const renderDetail = (k: KType, ws: ReturnType<typeof getKompensasiWithStatus>, pembayaran: Pembayaran[], ks: (typeof daftarKS)[number] | undefined) => (
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
              <div className="flex justify-between text-gray-600 border-t pt-1 mt-1">
                <span>Bruto (sebelum pengurang)</span>
                <span>{formatRupiah(k.total_tagihan)}</span>
              </div>
              {(k.pengurang ?? 0) > 0 && (
                <div className="flex justify-between text-purple-700">
                  <span>− Pengurang {k.keterangan_pengurang ? `(${k.keterangan_pengurang})` : ''}</span>
                  <span>− {formatRupiah(k.pengurang!)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-[#1B4F72] border-t pt-1.5 mt-0.5">
                <span>Tagihan (efektif)</span>
                <span>{formatRupiah(ws.efektifTagihan)}</span>
              </div>
            </div>

            {ws.dendaAkumulasi.hariTerlambat > 0 && (
              <div className="mt-2 pt-2 border-t space-y-1">
                <p className="font-semibold text-red-700 text-[11px] uppercase tracking-wide">
                  Denda{ws.statusBayar === 'lunas' ? ' (saat pelunasan)' : ''}
                </p>
                <div className="flex justify-between text-red-600">
                  <span>
                    Terlambat {ws.dendaAkumulasi.hariTerlambat} hr
                    {' '}× {k.persen_denda_per_hari}%/hr
                  </span>
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
            <Link to={`/jalur-b/pembayaran?kompensasi_id=${k.id}`} className="text-[11px] text-[#1B4F72] hover:underline">
              Catat pembayaran di Input Pembayaran →
            </Link>
            {pembayaran.length === 0
              ? <p className="text-gray-400 italic">Belum ada pembayaran</p>
              : (
                <div className="space-y-1.5">
                  {pembayaran.map(p => (
                    <div key={p.id} className="group/payment flex items-center gap-2">
                      <span className="text-gray-400 shrink-0 w-24">{formatTanggal(p.tgl_bayar)}</span>
                      <span className="font-medium flex-1">{formatRupiah(p.nominal_bayar)}</span>
                      <div className="flex items-center gap-1.5">
                        {p.keterangan && <span className="text-gray-400 text-[10px]">{p.keterangan}</span>}
                        {p.bukti_url && <a href={p.bukti_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">Bukti</a>}
                        <button
                          type="button"
                          onClick={() => openPaymentEdit(p, k)}
                          className="rounded p-0.5 text-gray-400 hover:bg-blue-50 hover:text-[#1B4F72] opacity-0 transition-opacity group-hover/payment:opacity-100 focus:opacity-100"
                          title="Edit pembayaran"
                          aria-label="Edit pembayaran"
                        >
                          <Pencil size={12} />
                        </button>
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
                       {ci.rkap_kode && (
                         <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1 rounded shrink-0">{ci.rkap_kode}</span>
                       )}
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
          {/* ── PDDM / PSAK 73 ────────────────────────────── */}
          <div className="space-y-2">
            <p className="font-semibold text-gray-700 text-[11px] uppercase tracking-wide">Amortisasi PSAK 73</p>
            {(() => {
              const pddmList = daftarPDDM.filter(p => p.ks_id === k.ks_id)
              if (pddmList.length === 0)
                return <p className="text-gray-400 italic text-[11px]">Belum ada kontrak akrual untuk KS ini.</p>
              return (
                <div className="space-y-1.5">
                  {pddmList.map(p => {
                    const prog = hitungProgressPersen(p.total_nkm, p.sudah_diakui)
                    return (
                      <div key={p.id} className="flex items-center gap-2 text-[11px]">
                        <span className="flex-1 truncate font-medium text-gray-700">{p.nama_kontrak}</span>
                        <span className="text-gray-400">{formatRupiah(p.sudah_diakui)} / {formatRupiah(p.total_nkm)}</span>
                        <span className={`font-semibold ${prog >= 100 ? 'text-green-600' : 'text-[#5B2C6F]'}`}>{prog.toFixed(0)}%</span>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>

        </div>
  )

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kompensasi</h1>
          <p className="text-sm text-gray-500">Monitoring dan pencatatan kompensasi kerja sama</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => { setGenStep(1); setGenDialog(true) }}>
            <Wand2 size={15} /> Generate Periode
          </Button>
          <Button onClick={openAdd} className="bg-[#5B2C6F] hover:bg-[#5B2C6F]/90">
            <Plus size={16} /> Tambah Manual
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label className="w-14 shrink-0 text-xs text-gray-500 sm:w-auto">Status:</Label>
          <Select value={filterStatus} onValueChange={v => setFilterStatus(v as PaymentFilter)}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="perlu_tindak_lanjut">Perlu ditindaklanjuti</SelectItem>
              <SelectItem value="semua">Semua status</SelectItem>
              <SelectItem value="belum_bayar">Belum dibayar</SelectItem>
              <SelectItem value="terlambat">Terlambat</SelectItem>
              <SelectItem value="sebagian">Dibayar sebagian</SelectItem>
              <SelectItem value="lunas">Lunas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Filter KS */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label className="w-14 shrink-0 text-xs text-gray-500 sm:w-auto">KS:</Label>
          <SearchableSelect
            className="h-8 w-full text-xs sm:w-64"
            value={filterKS === 'semua' ? '' : filterKS}
            onValueChange={v => setFilterKS(v || 'semua')}
            options={ksOptions}
            placeholder="Semua Kerja Sama"
            searchPlaceholder="Cari mitra / aset / kode..."
            allowClear
            clearLabel="Semua Kerja Sama"
            emptyValue=""
          />
        </div>

        {/* Filter Bulan */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label className="w-14 shrink-0 text-xs text-gray-500 sm:w-auto">Bulan:</Label>
          <Select value={filterBulan} onValueChange={setFilterBulan}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="semua">Semua Bulan</SelectItem>
              {availableBulan.map(ym => {
                const [year, month] = ym.split('-')
                return (
                  <SelectItem key={ym} value={ym}>
                    {BULAN[parseInt(month) - 1]} {year}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label className="w-14 shrink-0 text-xs text-gray-500 sm:w-auto">Urutan:</Label>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-full text-xs sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jatuh_tempo_asc">Jatuh Tempo (Terdekat)</SelectItem>
              <SelectItem value="jatuh_tempo_desc">Jatuh Tempo (Terlama)</SelectItem>
              <SelectItem value="tagihan_desc">Total Tagihan Terbesar</SelectItem>
              <SelectItem value="tagihan_asc">Total Tagihan Terkecil</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Jumlah hasil */}
        {(filterKS !== 'semua' || filterBulan !== 'semua' || filterStatus !== 'semua') && (
          <span className="text-xs text-gray-400">{filtered.length} kompensasi ditampilkan</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {([
          ['Jumlah tagihan', filtered.length.toLocaleString('id-ID'), 'sesuai filter', 'text-gray-900'],
          ['Total tagihan', formatRupiah(ringkasan.tagihan), 'termasuk PPN, setelah pengurang', 'text-gray-900'],
          ['Sisa belum dibayar', formatRupiah(ringkasan.sisa), 'dari tagihan yang tampil', ringkasan.sisa > 0 ? 'text-red-700' : 'text-green-700'],
          ['Terlambat', `${ringkasan.terlambat} tagihan`, ringkasan.denda > 0.5 ? `denda ${formatRupiah(ringkasan.denda)}` : 'tanpa denda berjalan', ringkasan.terlambat ? 'text-red-700' : 'text-gray-900'],
        ] as const).map(([label, value, note, tone]) => (
          <div key={label} className="rounded-xl border bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
            <p className="text-[11px] text-gray-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Tampilan jadwal pembayaran</p>
          <p className="text-xs text-gray-500">Mengikuti filter status, kerja sama, dan bulan di atas.</p>
        </div>
        <div className="flex rounded-lg border bg-gray-50 p-1">
          <Button type="button" size="sm" variant={viewMode === 'daftar' ? 'default' : 'ghost'} className={viewMode === 'daftar' ? 'bg-[#5B2C6F] hover:bg-[#5B2C6F]/90' : ''} onClick={() => setViewMode('daftar')}><List size={14} /> Daftar</Button>
          <Button type="button" size="sm" variant={viewMode === 'kalender' ? 'default' : 'ghost'} className={viewMode === 'kalender' ? 'bg-[#5B2C6F] hover:bg-[#5B2C6F]/90' : ''} onClick={() => setViewMode('kalender')}><CalendarDays size={14} /> Kalender</Button>
          <Button type="button" size="sm" variant={viewMode === 'alur' ? 'default' : 'ghost'} className={viewMode === 'alur' ? 'bg-[#5B2C6F] hover:bg-[#5B2C6F]/90' : ''} onClick={() => setViewMode('alur')}><GitBranch size={14} /> Alur</Button>
        </div>
      </div>

      {viewMode === 'kalender' && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <Button type="button" variant="ghost" size="icon" aria-label="Bulan sebelumnya" onClick={() => shiftCalendarMonth(-1)}><ChevronLeft size={17} /></Button>
            <p className="font-semibold text-gray-800">{calendarData.label}</p>
            <Button type="button" variant="ghost" size="icon" aria-label="Bulan berikutnya" onClick={() => shiftCalendarMonth(1)}><ChevronRight size={17} /></Button>
          </div>
          <div className="grid grid-cols-7 border-b bg-gray-50 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(day => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {calendarData.cells.map((cell, idx) => (
              <div key={`${cell.iso}-${idx}`} className={`min-h-28 border-b border-r p-2 ${cell.inMonth ? 'bg-white' : 'bg-gray-50/70'}`}>
                {cell.inMonth && <p className="mb-1 text-xs font-medium text-gray-500">{cell.day}</p>}
                <div className="space-y-1">
                  {cell.events.slice(0, 2).map(k => {
                    const ws = getKompensasiWithStatus(k, (k as any).pembayaran ?? [])
                    const ks = daftarKS.find(x => x.id === k.ks_id)
                    return <button key={k.id} type="button" onClick={() => { setViewMode('daftar'); setExpandedId(k.id) }} className={`w-full rounded px-1.5 py-1 text-left text-[10px] leading-tight ${ws.statusBayar === 'terlambat' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`} title={`${ks?.nama_mitra ?? '-'} — ${formatRupiah(ws.sisaTagihan)}`}><span className="block truncate font-semibold">{ks?.nama_mitra ?? '-'}</span><span>{formatRupiah(ws.sisaTagihan)}</span></button>
                  })}
                  {cell.events.length > 2 && <p className="text-[10px] text-gray-500">+{cell.events.length - 2} tagihan lain</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'alur' && (
        <div className="rounded-xl border bg-white p-5">
          {dueChartData.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Tidak ada jadwal yang sesuai filter.</p> : <>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="font-semibold text-gray-800">Peta jatuh tempo pembayaran</p><p className="text-xs text-gray-500">Tinggi batang menunjukkan sisa tagihan pada setiap tanggal jatuh tempo.</p></div>
              <div className="flex items-center gap-3 text-xs text-gray-600"><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500" /> Terlambat</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Belum dibayar</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-400" /> Dibayar sebagian</span></div>
            </div>
            <div className="h-80 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dueChartData} margin={{ top: 12, right: 16, left: 8, bottom: 12 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="singkat" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                  <YAxis tickLine={false} axisLine={false} width={68} tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={v => v >= 1000000 ? `Rp${(v / 1000000).toFixed(0)}jt` : `Rp${(v / 1000).toFixed(0)}rb`} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} formatter={(value: number) => [formatRupiah(value), 'Sisa tagihan']} labelFormatter={(_, payload) => payload?.[0]?.payload ? `${payload[0].payload.label} · ${payload[0].payload.mitra}` : ''} contentStyle={{ borderRadius: 8, borderColor: '#e5e7eb', fontSize: 12 }} />
                  <Bar dataKey="nilai" radius={[6, 6, 0, 0]} maxBarSize={52}>
                    {dueChartData.map(item => <Cell key={item.id} fill={item.status === 'terlambat' ? '#ef4444' : item.status === 'sebagian' ? '#60a5fa' : '#fbbf24'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2 xl:grid-cols-3">
              {dueChartData.map(item => <button key={item.id} type="button" onClick={() => { setViewMode('daftar'); setExpandedId(item.id) }} className="rounded-lg border px-3 py-2 text-left transition-colors hover:border-[#5B2C6F] hover:bg-purple-50"><p className="text-xs font-semibold text-gray-700">{item.label}</p><p className="truncate text-xs text-gray-500">{item.mitra}</p><p className={`mt-1 text-sm font-semibold ${item.status === 'terlambat' ? 'text-red-700' : 'text-amber-700'}`}>{formatRupiah(item.nilai)}</p></button>)}
            </div>
          </>}
        </div>
      )}

      {viewMode === 'daftar' && <div className="space-y-3">
        {isLoading ? (
          <div className="rounded-xl border bg-white p-6"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border bg-white"><EmptyState title="Belum ada kompensasi" description="Tambahkan kompensasi untuk kerja sama aktif." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah</Button>} /></div>
        ) : <>
          <div className="hidden overflow-x-auto rounded-xl border bg-white md:block">
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-600">
                  <th className="px-4 py-3">Mitra / Aset</th>
                  <th className="px-4 py-3">Periode / jatuh tempo</th>
                  <th className="px-4 py-3 text-right">Tagihan</th>
                  <th className="px-4 py-3">Pembayaran</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="sticky right-0 bg-gray-50 px-3 py-3 text-right shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paged.map(k => {
                  const pembayaran = (k as any).pembayaran as Pembayaran[] ?? []
                  const ws = getKompensasiWithStatus(k, pembayaran)
                  const ks = daftarKS.find(x => x.id === k.ks_id)
                  const expanded = expandedId === k.id
                  return (
                    <Fragment key={k.id}>
                      <tr className={`align-top transition-colors hover:bg-gray-50 ${expanded ? 'bg-purple-50/40' : ''}`}>
                        <td className="min-w-[190px] max-w-[300px] px-4 py-3">
                          <p className="font-medium text-gray-900">{ks?.nama_mitra ?? '-'}</p>
                          <p className="text-xs text-gray-500">{(ks?.aset as any)?.nama_aset ?? '-'}</p>
                          {renderTags(k)}
                        </td>
                        <td className="min-w-[130px] px-4 py-3">
                          <p className="text-gray-700">{k.periode_label ?? '-'}</p>
                          <p className="whitespace-nowrap text-xs text-gray-500">JT {formatTanggal(k.tgl_jatuh_tempo)}</p>
                          {k.invoice_tgl && <p className="whitespace-nowrap text-[11px] text-gray-400">Invoice {formatTanggal(k.invoice_tgl)}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <CurrencyDisplay value={ws.efektifTagihan} size="sm" className="font-semibold" />
                          {(k.pengurang ?? 0) > 0 && <p className="text-[11px] text-gray-400">bruto {formatRupiah(k.total_tagihan)}</p>}
                          <p className="text-[11px] text-[#5B2C6F]">akrual {formatRupiah(k.nominal ?? 0)}</p>
                        </td>
                        <td className="min-w-[150px] px-4 py-3">{renderPaymentProgress(ws)}</td>
                        <td className="min-w-[150px] px-4 py-3">
                          <StatusBadge type="bayar" value={ws.statusBayar} />
                          {renderLate(ws)}
                        </td>
                        <td className={`sticky right-0 px-2 py-3 shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.15)] ${expanded ? 'bg-purple-50' : 'bg-white'}`}><div className="flex justify-end">{renderActions(k, ws, expanded)}</div></td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50/60">
                          <td colSpan={6} className="px-6 py-4">{renderDetail(k, ws, pembayaran, ks)}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-3 md:hidden">
            {paged.map(k => {
              const pembayaran = (k as any).pembayaran as Pembayaran[] ?? []
              const ws = getKompensasiWithStatus(k, pembayaran)
              const ks = daftarKS.find(x => x.id === k.ks_id)
              const expanded = expandedId === k.id
              return (
                <div key={k.id} className="rounded-xl border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900">{ks?.nama_mitra ?? '-'}</p>
                      <p className="text-xs text-gray-500">{(ks?.aset as any)?.nama_aset ?? '-'}</p>
                    </div>
                    <StatusBadge type="bayar" value={ws.statusBayar} />
                  </div>
                  {renderTags(k)}
                  <p className="mt-2 text-xs text-gray-500">{k.periode_label ?? '-'} · jatuh tempo {formatTanggal(k.tgl_jatuh_tempo)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <div><p className="text-[11px] text-gray-500">Tagihan</p><CurrencyDisplay value={ws.efektifTagihan} size="sm" className="font-semibold" /></div>
                    <div><p className="text-[11px] text-gray-500">Sisa</p><CurrencyDisplay value={ws.sisaTagihan} size="sm" className={ws.sisaTagihan > 0 ? 'font-semibold text-red-700' : 'font-semibold text-green-700'} /></div>
                  </div>
                  {renderLate(ws)}
                  <div className="mt-3 flex justify-end border-t pt-2">{renderActions(k, ws, expanded)}</div>
                  {expanded && <div className="mt-3 border-t pt-3">{renderDetail(k, ws, pembayaran, ks)}</div>}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
              <span>Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} dari {filtered.length}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
                <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
              </div>
            </div>
          )}
        </>}
      </div>}

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
                <div className="mt-1">
                  <SearchableSelect
                    value={genForm.watch('ks_id') ?? ''}
                    onValueChange={v => {
                      genForm.setValue('ks_id', v, { shouldValidate: true })
                      const kode = resolveKodeFromKs(v)
                      if (kode) genForm.setValue('rkap_kode', kode)
                    }}
                    options={ksOptions}
                    placeholder="Cari & pilih kerja sama..."
                    searchPlaceholder="Ketik mitra, aset, atau kode..."
                  />
                </div>
              </div>

              {/* ID Monika */}
              <div>
                <Label>ID Monika <span className="text-red-500">*</span></Label>
                <Controller control={genForm.control} name="rkap_kode" render={({ field }) => (
                  <div className="mt-1">
                    <SearchableSelect
                      value={field.value ?? ''}
                      onValueChange={v => field.onChange(v)}
                      options={programSelectOptions}
                      placeholder="Cari & pilih ID Monika..."
                      searchPlaceholder="Ketik ID Monika atau nama aset..."
                    />
                  </div>
                )} />
                {genForm.formState.errors.rkap_kode && (
                  <p className="text-xs text-red-500 mt-1">{genForm.formState.errors.rkap_kode.message}</p>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  Wajib. Hanya dari master Data Aset / RKAP — tidak boleh nama bebas.
                </p>
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
                    <Label className="text-xs text-gray-500">Cetak Tagihan (hari stlh awal periode)</Label>
                    <Input type="number" {...genForm.register('offset_cetak_tagihan')} className="mt-1 h-8 text-xs" />
                    <p className="text-[10px] text-gray-400 mt-0.5">0 = tgl cetak = awal periode</p>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Jatuh Tempo (hari setelah awal periode)</Label>
                    <Input type="number" {...genForm.register('offset_jatuh_tempo')} className="mt-1 h-8 text-xs" />
                  </div>
                </div>
                <p className="text-[10px] text-gray-400">Denda: mulai H+1 setelah jatuh tempo (tanpa grace).</p>
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
                      <th className="text-left px-3 py-2">Cetak Tagihan</th>
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
                        <td className="px-3 py-2 text-gray-600">{formatTanggal(p.invoice_tgl)}</td>
                        <td className="px-3 py-2 text-gray-600">{formatTanggal(p.tgl_jatuh_tempo)}</td>
                        <td className="px-3 py-2 text-right">{formatRupiah(p.nominal)}</td>
                        <td className="px-3 py-2 text-right font-semibold text-[#5B2C6F]">{formatRupiah(p.total_tagihan)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 border-t font-semibold">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 text-right text-xs text-gray-600">Total seluruh periode:</td>
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
          <form onSubmit={kompForm.handleSubmit(onSubmit)} className="space-y-4 max-h-[75vh] overflow-y-auto pr-2">
            <div>
              <Label>Kerja Sama</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={kompForm.watch('ks_id') ?? ''}
                  onValueChange={v => {
                    kompForm.setValue('ks_id', v, { shouldValidate: true })
                    if (!editTarget) {
                      const kode = resolveKodeFromKs(v)
                      if (kode) kompForm.setValue('rkap_kode', kode)
                    }
                  }}
                  options={ksOptions}
                  placeholder="Cari & pilih kerja sama..."
                  searchPlaceholder="Ketik mitra, aset, atau kode..."
                  disabled={!!editTarget}
                />
              </div>
            </div>
            <div>
              <Label>ID Monika <span className="text-red-500">*</span></Label>
              <Controller control={kompForm.control} name="rkap_kode" render={({ field }) => (
                <div className="mt-1">
                  <SearchableSelect
                    value={field.value ?? ''}
                    onValueChange={v => field.onChange(v)}
                    options={programSelectOptions}
                    placeholder="Cari & pilih ID Monika..."
                    searchPlaceholder="Ketik ID Monika atau nama aset..."
                  />
                </div>
              )} />
              {kompForm.formState.errors.rkap_kode && (
                <p className="text-xs text-red-500 mt-1">{kompForm.formState.errors.rkap_kode.message}</p>
              )}
              <p className="text-[11px] text-gray-400 mt-1">
                Otomatis dari ID Monika aset KS. Wajib ada — tidak boleh tanpa ID Monika.
              </p>
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
                  const penguranganNom = adaPengurang ? (watchPengurang ?? 0) : 0
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
                      <div className="flex justify-between text-gray-600 border-t pt-1">
                        <span>Bruto (sebelum pengurang)</span><span>{formatRupiah(total)}</span>
                      </div>
                      {penguranganNom > 0 && (
                        <div className="flex justify-between text-purple-700">
                          <span>− Pengurang {watchKetPengurang ? `(${watchKetPengurang})` : ''}</span>
                          <span>− {formatRupiah(penguranganNom)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-[#1B4F72] border-t pt-1.5 mt-0.5">
                        <span>Tagihan (efektif)</span>
                        <span>{formatRupiah(Math.max(0, total - penguranganNom))}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            )}
            <div>
              <Label>% Denda / Hari</Label>
              <Input type="number" step="0.001" {...kompForm.register('persen_denda_per_hari')} className="mt-1" />
              <p className="text-[10px] text-gray-400 mt-0.5">Denda dihitung sejak H+1 lewat JT (tanpa grace)</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Cetak Tagihan</Label>
                <Input type="date" {...kompForm.register('invoice_tgl')} className="mt-1" />
                <p className="text-[10px] text-gray-400 mt-0.5">Opsional · tgl penagihan/cetak invoice</p>
              </div>
              <div>
                <Label>Tanggal Jatuh Tempo <span className="text-red-500">*</span></Label>
                <Input type="date" {...kompForm.register('tgl_jatuh_tempo')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...kompForm.register('keterangan')} className="mt-1" rows={2} />
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={adaPengurang}
                  onChange={e => {
                    setAdaPengurang(e.target.checked)
                    if (!e.target.checked) {
                      kompForm.setValue('pengurang', 0)
                      kompForm.setValue('keterangan_pengurang', '')
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 accent-[#5B2C6F] cursor-pointer"
                />
                <span className="text-sm font-medium text-gray-700">Ada Pengurang Kompensasi?</span>
                <span className="text-xs text-gray-400">(uang muka, deposit, dll.)</span>
              </label>
              {adaPengurang && (
                <div className="space-y-3">
                  <div>
                    <Label>Nominal Pengurang (Rp)</Label>
                    <Controller control={kompForm.control} name="pengurang" render={({ field }) => (
                      <CurrencyInput value={field.value ?? 0} onChange={field.onChange} className="mt-1" />
                    )} />
                  </div>
                  <div>
                    <Label>Keterangan Pengurang</Label>
                    <Input
                      {...kompForm.register('keterangan_pengurang')}
                      className="mt-1"
                      placeholder="cth: Uang muka, Security deposit"
                    />
                  </div>
                </div>
              )}
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

      {/* ── Edit pembayaran dari rincian tagihan ─────────────────────────── */}
      <Dialog open={paymentDialog} onOpenChange={open => {
        setPaymentDialog(open)
        if (!open) { setPaymentTarget(null); setPaymentKompensasi(null) }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Pembayaran Diterima</DialogTitle>
          </DialogHeader>
          <form onSubmit={paymentForm.handleSubmit(savePaymentEdit)} className="space-y-4">
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <p className="font-semibold">{paymentKompensasi?.periode_label ?? 'Tagihan kompensasi'}</p>
              <p className="mt-0.5 text-blue-700">Nomor pembayaran: {paymentTarget?.no_pembayaran ?? '—'}</p>
            </div>
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...paymentForm.register('tgl_bayar')} className="mt-1" />
              {paymentForm.formState.errors.tgl_bayar && <p className="mt-1 text-xs text-red-600">{paymentForm.formState.errors.tgl_bayar.message}</p>}
            </div>
            <div>
              <Label>Nominal Diterima (Rp)</Label>
              <Controller control={paymentForm.control} name="nominal_bayar" render={({ field }) => (
                <CurrencyInput value={field.value ?? 0} onChange={field.onChange} className="mt-1" />
              )} />
              {paymentForm.formState.errors.nominal_bayar && <p className="mt-1 text-xs text-red-600">{paymentForm.formState.errors.nominal_bayar.message}</p>}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="rounded border-gray-300" {...paymentForm.register('is_pph_disetor')} />
              PPh sudah disetor
            </label>
            <div>
              <Label>Link bukti transfer <span className="font-normal text-gray-400">(opsional)</span></Label>
              <Input {...paymentForm.register('bukti_url')} placeholder="https://..." className="mt-1" />
            </div>
            <div>
              <Label>Keterangan <span className="font-normal text-gray-400">(opsional)</span></Label>
              <Textarea {...paymentForm.register('keterangan')} rows={2} className="mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaymentDialog(false)}>Batal</Button>
              <Button type="submit" disabled={isSavingPayment} className="bg-[#1E8449] hover:bg-[#196F3D]">
                {isSavingPayment ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </DialogFooter>
          </form>
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
              <Label>ID Monika <span className="text-red-500">*</span></Label>
              <Controller control={cashInForm.control} name="rkap_kode" render={({ field }) => (
                <div className="mt-1">
                  <SearchableSelect
                    value={field.value ?? ''}
                    onValueChange={v => field.onChange(v)}
                    options={programSelectOptions}
                    placeholder="Cari & pilih ID Monika..."
                    searchPlaceholder="Ketik ID Monika atau nama aset..."
                  />
                </div>
              )} />
              {cashInForm.formState.errors.rkap_kode && (
                <p className="text-xs text-red-500 mt-1">{cashInForm.formState.errors.rkap_kode.message}</p>
              )}
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
