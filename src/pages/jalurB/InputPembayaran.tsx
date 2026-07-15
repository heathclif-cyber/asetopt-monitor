import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Save, FileText, Zap, Pencil, Trash2, X, Search,
  Banknote, ListChecks, ChevronDown, Building2, CalendarDays,
  PlusCircle, LayoutList,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { SupermanDocChecklist } from '@/components/common/SupermanDocChecklist'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { SupermanProgressDialog } from '@/components/common/SupermanProgressDialog'
import { KuitansiDialog } from '@/components/common/KuitansiDialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/apiClient'
import { cn, formatRupiah, formatTanggal } from '@/lib/utils'
import { Kompensasi, Pembayaran, SupermanStatus } from '@/types'

const schema = z.object({
  kompensasi_id: z.string().min(1, 'Pilih tahap tagihan'),
  tgl_bayar: z.string().min(1, 'Tanggal bayar wajib'),
  nominal_bayar: z.coerce.number().min(1, 'Nominal wajib > 0'),
  is_pph_disetor: z.boolean().optional(),
  keterangan: z.string().optional(),
  bukti_url: z.string().optional(),
})

type FormData = z.infer<typeof schema>
type ViewMode = 'input' | 'daftar'

export function InputPembayaran() {
  const [params, setSearchParams] = useSearchParams()
  const { allKompensasi, fetchAllKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()

  const initialView: ViewMode = params.get('tab') === 'daftar' ? 'daftar' : 'input'
  const [viewMode, setViewMode] = useState<ViewMode>(initialView)

  const [selectedKsId, setSelectedKsId] = useState('')
  const [riwayat, setRiwayat] = useState<Pembayaran[]>([])
  const [docRefresh, setDocRefresh] = useState(0)
  const [docsReady, setDocsReady] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [kuitansiTarget, setKuitansiTarget] = useState<Pembayaran | null>(null)
  const [lastSaved, setLastSaved] = useState<Pembayaran | null>(null)
  const [supermanStatus, setSupermanStatus] = useState<SupermanStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Pembayaran | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [riwayatTick, setRiwayatTick] = useState(0)
  const [listQuery, setListQuery] = useState('')
  const [filterTahun, setFilterTahun] = useState<string>('semua')

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      kompensasi_id: params.get('kompensasi_id') ?? '',
      tgl_bayar: new Date().toISOString().split('T')[0],
      nominal_bayar: 0,
      is_pph_disetor: false,
    },
  })

  const selectedId = form.watch('kompensasi_id')
  const nominalWatch = form.watch('nominal_bayar')
  const selected = allKompensasi.find(k => String(k.id) === String(selectedId))

  const resolveKs = (ksId: string | undefined) => {
    if (!ksId) return undefined
    const fromMaster = daftarKS.find(x => String(x.id) === String(ksId))
    if (fromMaster) return fromMaster
    const fromEmbed = allKompensasi.find(k => String(k.ks_id) === String(ksId))?.kerja_sama
    return fromEmbed as typeof daftarKS[number] | undefined
  }

  const ks = selected ? resolveKs(selected.ks_id) : resolveKs(selectedKsId)
  const ws = selected ? getKompensasiWithStatus(selected, riwayat) : null
  const lockedBySuperman = !!(selected?.superman && String(selected.superman).trim())

  const switchView = (mode: ViewMode) => {
    setViewMode(mode)
    const next = new URLSearchParams(params)
    if (mode === 'daftar') next.set('tab', 'daftar')
    else next.delete('tab')
    setSearchParams(next, { replace: true })
  }

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    api.get<SupermanStatus>('/api/superman/status').then(setSupermanStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const kid = params.get('kompensasi_id')
    if (!kid || allKompensasi.length === 0) return
    const k = allKompensasi.find(x => String(x.id) === String(kid))
    if (k) {
      setSelectedKsId(String(k.ks_id))
      form.setValue('kompensasi_id', String(kid))
      if (params.get('tab') !== 'daftar') setViewMode('input')
    }
  }, [allKompensasi, params])

  useEffect(() => {
    setDocsReady(false)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) {
      setRiwayat([])
      return
    }
    api.get<Pembayaran[]>(`/api/pembayaran?kompensasi_id=${selectedId}`)
      .then(setRiwayat)
      .catch(() => setRiwayat([]))
  }, [selectedId, lastSaved, riwayatTick])

  useEffect(() => {
    if (editingId) return
    if (selected && ws && ws.sisaTagihan > 0) {
      form.setValue('nominal_bayar', ws.sisaTagihan)
    }
  }, [selectedId, ws?.sisaTagihan, editingId])

  const ksOptions = useMemo(() => {
    type Stats = { open: number; lunas: number; monika: Set<string>; mitra: string; aset: string; noKontrak: string }
    const byKs = new Map<string, Stats>()

    allKompensasi.forEach(k => {
      const ksId = String(k.ks_id)
      const embedded = k.kerja_sama as typeof daftarKS[number] | undefined
      const master = daftarKS.find(x => String(x.id) === ksId) ?? embedded
      const cur = byKs.get(ksId) ?? {
        open: 0,
        lunas: 0,
        monika: new Set<string>(),
        mitra: master?.nama_mitra ?? '—',
        aset: master?.aset?.nama_aset ?? '—',
        noKontrak: master?.no_perjanjian ?? master?.no_kontrak_sap ?? 'Tanpa No. Kontrak',
      }
      if (master) {
        cur.mitra = master.nama_mitra || cur.mitra
        cur.aset = master.aset?.nama_aset || cur.aset
        cur.noKontrak = master.no_perjanjian ?? master.no_kontrak_sap ?? cur.noKontrak
      }
      const pemb = (k.pembayaran ?? []) as Pembayaran[]
      const s = getKompensasiWithStatus(k, pemb)
      if (s.statusBayar === 'lunas') cur.lunas += 1
      else cur.open += 1
      if (k.rkap_kode?.trim()) cur.monika.add(k.rkap_kode.trim())
      const monikaAset = master?.aset?.kode_aset?.trim()
      if (monikaAset) cur.monika.add(monikaAset)
      byKs.set(ksId, cur)
    })

    return Array.from(byKs.entries())
      .map(([id, stats]) => ({
        id,
        noKontrak: stats.noKontrak,
        mitra: stats.mitra,
        aset: stats.aset,
        monika: Array.from(stats.monika),
        open: stats.open,
        lunas: stats.lunas,
      }))
      .sort((a, b) => a.aset.localeCompare(b.aset, 'id') || a.mitra.localeCompare(b.mitra, 'id'))
  }, [allKompensasi, daftarKS, getKompensasiWithStatus])

  const tahapOptions = useMemo(() => {
    if (!selectedKsId) return []
    return allKompensasi
      .filter(k => String(k.ks_id) === String(selectedKsId))
      .map(k => {
        const pemb = (k.pembayaran ?? []) as Pembayaran[]
        const s = getKompensasiWithStatus(k, pemb)
        return {
          id: String(k.id),
          periode: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
          jatuhTempo: k.tgl_jatuh_tempo,
          total: k.total_tagihan,
          sisa: s.sisaTagihan,
          dibayar: s.totalDibayar,
          status: s.statusBayar,
          monika: k.rkap_kode?.trim() ?? '',
        }
      })
      .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo))
  }, [selectedKsId, allKompensasi, getKompensasiWithStatus])

  const allCashInRows = useMemo(() => {
    type Row = {
      payment: Pembayaran
      kompensasi: Kompensasi
      mitra: string
      aset: string
      monika: string
      periode: string
      locked: boolean
      year: number
    }
    const rows: Row[] = []
    allKompensasi.forEach(k => {
      const embedded = k.kerja_sama as typeof daftarKS[number] | undefined
      const master = daftarKS.find(x => String(x.id) === String(k.ks_id)) ?? embedded
      const mitra = master?.nama_mitra ?? '—'
      const aset = master?.aset?.nama_aset ?? '—'
      const monika = k.rkap_kode?.trim() || master?.aset?.kode_aset?.trim() || ''
      const periode = k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)
      const locked = !!(k.superman && String(k.superman).trim())
      ;((k.pembayaran ?? []) as Pembayaran[]).forEach(p => {
        const year = Number(String(p.tgl_bayar).slice(0, 4)) || 0
        rows.push({ payment: p, kompensasi: k, mitra, aset, monika, periode, locked, year })
      })
    })
    rows.sort((a, b) => String(b.payment.tgl_bayar).localeCompare(String(a.payment.tgl_bayar)))
    return rows
  }, [allKompensasi, daftarKS])

  const tahunList = useMemo(() => {
    const years = new Set(allCashInRows.map(r => r.year).filter(y => y > 0))
    years.add(new Date().getFullYear())
    return Array.from(years).sort((a, b) => b - a)
  }, [allCashInRows])

  const filteredCashInRows = useMemo(() => {
    let rows = allCashInRows
    if (filterTahun !== 'semua') {
      const y = Number(filterTahun)
      rows = rows.filter(r => r.year === y)
    }
    const q = listQuery.trim().toLowerCase()
    if (!q) return rows
    const tokens = q.split(/\s+/).filter(Boolean)
    return rows.filter(r => {
      const hay = [
        r.mitra, r.aset, r.monika, r.periode,
        r.payment.tgl_bayar, String(r.payment.nominal_bayar),
        r.payment.keterangan ?? '', r.payment.no_pembayaran ?? '',
      ].join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [allCashInRows, listQuery, filterTahun])

  const totalCashInAll = useMemo(
    () => allCashInRows.reduce((s, r) => s + (r.payment.nominal_bayar || 0), 0),
    [allCashInRows],
  )
  const totalCashInFiltered = useMemo(
    () => filteredCashInRows.reduce((s, r) => s + (r.payment.nominal_bayar || 0), 0),
    [filteredCashInRows],
  )

  const handleKsChange = (ksId: string) => {
    cancelEdit()
    setSelectedKsId(ksId)
    const tahapForKs = allKompensasi
      .filter(k => String(k.ks_id) === String(ksId))
      .sort((a, b) => a.tgl_jatuh_tempo.localeCompare(b.tgl_jatuh_tempo))
    const prefer = tahapForKs.find(k => {
      const s = getKompensasiWithStatus(k, (k.pembayaran ?? []) as Pembayaran[])
      return s.statusBayar !== 'lunas'
    }) ?? tahapForKs[0]
    form.setValue('kompensasi_id', prefer ? String(prefer.id) : '')
  }

  useEffect(() => {
    if (selected && String(selected.ks_id) !== String(selectedKsId)) {
      setSelectedKsId(String(selected.ks_id))
    }
  }, [selected?.ks_id])

  const startSuperman = async (kompensasiId: string) => {
    try {
      const res = await api.post<{ job_id: string }>(`/api/superman/deklarasi/start?kompensasi_id=${kompensasiId}`)
      setJobId(res.job_id)
      setProgressOpen(true)
    } catch (e: any) {
      if (e.message?.includes('captcha') || e.message?.includes('Captcha')) {
        setCaptchaOpen(true)
      } else {
        alert(e.message ?? 'Gagal memulai Superman')
      }
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    form.setValue('tgl_bayar', new Date().toISOString().split('T')[0])
    form.setValue('is_pph_disetor', false)
    form.setValue('keterangan', '')
    form.setValue('bukti_url', '')
    if (ws && ws.sisaTagihan > 0) {
      form.setValue('nominal_bayar', ws.sisaTagihan)
    } else {
      form.setValue('nominal_bayar', 0)
    }
  }

  const openEdit = (p: Pembayaran) => {
    const komp = allKompensasi.find(k => String(k.id) === String(p.kompensasi_id))
    if (komp?.superman && String(komp.superman).trim()) {
      alert('Kompensasi sudah punya nomor Superman — pembayaran tidak bisa diubah.')
      return
    }
    if (komp) setSelectedKsId(String(komp.ks_id))
    setEditingId(String(p.id))
    form.setValue('kompensasi_id', String(p.kompensasi_id))
    form.setValue('tgl_bayar', String(p.tgl_bayar).slice(0, 10))
    form.setValue('nominal_bayar', p.nominal_bayar)
    form.setValue('is_pph_disetor', p.is_pph_disetor ?? false)
    form.setValue('keterangan', p.keterangan ?? '')
    form.setValue('bukti_url', p.bukti_url ?? '')
    switchView('input')
  }

  const startNewInput = () => {
    cancelEdit()
    switchView('input')
  }

  const onSubmit = async (data: FormData) => {
    if (!selected) return
    if (lockedBySuperman && !editingId) {
      alert('Kompensasi sudah punya nomor Superman — pembayaran tidak bisa ditambah.')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        const saved = await api.patch<Pembayaran>(`/api/pembayaran/${editingId}`, {
          tgl_bayar: data.tgl_bayar,
          nominal_bayar: data.nominal_bayar,
          is_pph_disetor: data.is_pph_disetor ?? false,
          keterangan: data.keterangan || null,
          bukti_url: data.bukti_url || null,
        })
        setLastSaved(saved)
        setEditingId(null)
        await fetchAllKompensasi()
        setRiwayatTick(t => t + 1)
        switchView('daftar')
      } else {
        const saved = await api.post<Pembayaran>('/api/pembayaran', {
          kompensasi_id: data.kompensasi_id,
          tgl_bayar: data.tgl_bayar,
          nominal_bayar: data.nominal_bayar,
          is_pph_disetor: data.is_pph_disetor ?? false,
          keterangan: data.keterangan || null,
          bukti_url: data.bukti_url || null,
        })
        setLastSaved(saved)
        await fetchAllKompensasi()
        setRiwayatTick(t => t + 1)
        form.setValue('keterangan', '')
        form.setValue('bukti_url', '')
        form.setValue('tgl_bayar', new Date().toISOString().split('T')[0])
        form.setValue('is_pph_disetor', false)
      }
    } catch (e: any) {
      alert(e.message ?? (editingId ? 'Gagal mengubah pembayaran' : 'Gagal menyimpan pembayaran'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/api/pembayaran/${deleteTarget.id}`)
      if (editingId === String(deleteTarget.id)) cancelEdit()
      if (lastSaved?.id === deleteTarget.id) setLastSaved(null)
      setDeleteTarget(null)
      await fetchAllKompensasi()
      setRiwayatTick(t => t + 1)
    } catch (e: any) {
      alert(e.message ?? 'Gagal menghapus pembayaran')
    } finally {
      setDeleting(false)
    }
  }

  const selectedTahap = tahapOptions.find(t => t.id === selectedId)
  const isLunas = ws?.statusBayar === 'lunas'
  const supermanReady = !!(
    supermanStatus?.configured
    && supermanStatus.playwright_ready
    && supermanStatus.session_valid
  )
  const canAutoSuperman = !!(
    selected
    && !selected.superman
    && docsReady
    && (isLunas || (ws && ws.sisaTagihan <= 0.5))
    && supermanReady
  )

  const handleSupermanDone = (ref: string) => {
    setProgressOpen(false)
    fetchAllKompensasi()
    alert(`Superman selesai: ${ref}`)
  }

  const sisaUntukInput = editingId
    ? (ws?.sisaTagihan ?? 0) + (
      riwayat.find(p => String(p.id) === String(editingId))?.nominal_bayar
      ?? allCashInRows.find(r => String(r.payment.id) === String(editingId))?.payment.nominal_bayar
      ?? 0
    )
    : (ws?.sisaTagihan ?? 0)

  const canSave = !!(
    selected
    && !saving
    && !lockedBySuperman
    && nominalWatch > 0
    && (editingId || sisaUntukInput > 0.5)
  )

  const previewSisa = Math.max(0, sisaUntukInput - (nominalWatch || 0))

  return (
    <div className="space-y-4 max-w-6xl pb-8">
      {/* Page header + view switch (pola Laporan Pendapatan) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Cash In (Pembayaran)</h1>
          <p className="text-xs text-gray-500 mt-1">
            {viewMode === 'input'
              ? (editingId
                ? 'Mode edit — ubah data pembayaran yang sudah tercatat, lalu simpan'
                : 'Satu form = satu pembayaran · pilih mitra & tahap tagihan · invoice tidak wajib')
              : 'Satu baris = satu transaksi cash in · cari aset/mitra/Monika · edit atau hapus dari daftar'}
          </p>
        </div>

        <div className="inline-flex rounded-lg border bg-white p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => switchView('input')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              viewMode === 'input' ? 'bg-[#117A65] text-white' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <PlusCircle size={14} />
            Input Cash In
          </button>
          <button
            type="button"
            onClick={() => switchView('daftar')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              viewMode === 'daftar' ? 'bg-[#117A65] text-white' : 'text-gray-600 hover:bg-gray-50',
            )}
          >
            <LayoutList size={14} />
            Daftar Cash In
          </button>
        </div>
      </div>

      {/* Ringkasan ringkas */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Total Cash In</p>
          <p className="text-sm font-bold text-emerald-700 tabular-nums mt-0.5">{formatRupiah(totalCashInAll)}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Jumlah Transaksi</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums mt-0.5">{allCashInRows.length}</p>
        </div>
        <div className="rounded-xl border bg-white px-4 py-3 shadow-sm col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Mitra / KS</p>
          <p className="text-sm font-bold text-gray-900 tabular-nums mt-0.5">{ksOptions.length}</p>
        </div>
      </div>

      {/* ════════════════════ INPUT ════════════════════ */}
      {viewMode === 'input' && (
        <div className="max-w-2xl space-y-4">
          <form id="form-cash-in" onSubmit={form.handleSubmit(onSubmit)}>
            <Card className={cn(
              'shadow-sm overflow-hidden border-gray-200/80',
              editingId && 'ring-2 ring-amber-300/70 border-amber-200',
            )}>
              <CardHeader className={cn(
                'py-3.5 px-5 border-b',
                editingId ? 'bg-amber-50/90 border-amber-100' : 'bg-white',
              )}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                      editingId ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                    )}>
                      {editingId ? <Pencil size={16} /> : <Banknote size={16} />}
                    </span>
                    <div>
                      <CardTitle className="text-sm font-semibold text-gray-900">
                        {editingId ? 'Edit Cash In' : 'Form Input Cash In'}
                      </CardTitle>
                      <p className="text-[11px] text-gray-500">
                        {editingId ? 'Ubah nominal, tanggal, atau keterangan' : 'Lengkapi data lalu simpan'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editingId && (
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-amber-800" onClick={cancelEdit}>
                        <X size={14} /> Batal edit
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => switchView('daftar')}
                    >
                      <ListChecks size={13} /> Lihat daftar
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-gray-600">Aset / Mitra</Label>
                    <SearchableSelect
                      value={selectedKsId}
                      onValueChange={handleKsChange}
                      disabled={!!editingId}
                      options={ksOptions.map(o => ({
                        value: o.id,
                        label: `${o.aset} — ${o.mitra}`,
                        searchText: [o.aset, o.mitra, o.noKontrak, ...o.monika].join(' '),
                        description: [
                          o.noKontrak,
                          o.monika.length ? `Monika ${o.monika.join(', ')}` : null,
                          o.open > 0 ? `${o.open} terbuka` : null,
                          o.lunas > 0 ? `${o.lunas} lunas` : null,
                        ].filter(Boolean).join(' · '),
                      }))}
                      placeholder="Cari aset, mitra, Monika..."
                      searchPlaceholder="cth: Dapenbun, Pelayanan 13..."
                    />
                    {ks && (
                      <p className="text-[11px] text-gray-500 flex items-start gap-1.5 pt-0.5">
                        <Building2 size={12} className="mt-0.5 shrink-0 text-gray-400" />
                        <span>
                          {ks.nama_mitra}
                          {ks.aset?.kode_aset ? ` · ${ks.aset.kode_aset}` : ''}
                          {ks.no_perjanjian ? ` · ${ks.no_perjanjian}` : ''}
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs text-gray-600">Tahap Tagihan</Label>
                    <SearchableSelect
                      value={selectedId}
                      disabled={!selectedKsId || !!editingId}
                      onValueChange={v => {
                        if (editingId) cancelEdit()
                        form.setValue('kompensasi_id', v)
                      }}
                      options={tahapOptions.map(o => ({
                        value: o.id,
                        label: o.status === 'lunas'
                          ? `${o.periode} — Lunas`
                          : `${o.periode} — sisa ${formatRupiah(o.sisa)}`,
                        searchText: `${o.periode} ${o.monika} ${o.status}`,
                        description: [
                          formatRupiah(o.total),
                          `JT ${formatTanggal(o.jatuhTempo)}`,
                          o.monika || null,
                        ].filter(Boolean).join(' · '),
                      }))}
                      placeholder={selectedKsId ? 'Pilih tahap...' : 'Pilih mitra dulu'}
                      searchPlaceholder="Periode / Monika..."
                    />
                    {selectedTahap && (
                      <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                        <CalendarDays size={12} className="text-gray-400" />
                        JT {formatTanggal(selectedTahap.jatuhTempo)}
                        {selectedTahap.monika ? ` · ${selectedTahap.monika}` : ''}
                        {selectedTahap.status === 'lunas' && selectedTahap.dibayar > selectedTahap.total && (
                          <span className="text-amber-700 font-medium">
                            · lebih {formatRupiah(selectedTahap.dibayar - selectedTahap.total)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>

                {selected && ws && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-xl border border-gray-100 bg-slate-50/80 p-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">Tagihan</p>
                      <CurrencyDisplay value={selected.total_tagihan} size="sm" className="font-semibold text-gray-800" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">Dibayar</p>
                      <CurrencyDisplay value={ws.totalDibayar} size="sm" className="font-semibold text-emerald-700" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400">Sisa</p>
                      <CurrencyDisplay value={previewSisa} size="sm" className="font-semibold text-red-600" />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">Status</p>
                      <StatusBadge type="bayar" value={ws.statusBayar} />
                    </div>
                  </div>
                )}

                {lockedBySuperman && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Tagihan sudah punya nomor Superman — cash in terkunci.
                  </div>
                )}

                {selected?.no_invoice && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-gray-600">
                    Invoice: <span className="font-mono font-medium text-gray-800">{selected.no_invoice}</span>
                    {selected.invoice_tgl ? ` · ${formatTanggal(selected.invoice_tgl)}` : ''}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Tanggal Bayar</Label>
                    <Input type="date" {...form.register('tgl_bayar')} disabled={lockedBySuperman} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Nominal Cash In (Rp)</Label>
                    <CurrencyInput
                      value={nominalWatch}
                      onChange={v => form.setValue('nominal_bayar', v)}
                      disabled={lockedBySuperman}
                    />
                    {editingId && sisaUntukInput > 0 && (
                      <p className="text-[11px] text-gray-400">Maks. {formatRupiah(sisaUntukInput)}</p>
                    )}
                  </div>
                </div>

                <label className={cn(
                  'flex items-center gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors',
                  form.watch('is_pph_disetor')
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-gray-100 bg-white hover:bg-gray-50',
                  lockedBySuperman && 'opacity-60 pointer-events-none',
                )}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    {...form.register('is_pph_disetor')}
                    disabled={lockedBySuperman}
                  />
                  <span className="text-sm text-gray-700">PPh sudah disetor</span>
                </label>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">
                    Link bukti transfer <span className="text-gray-400 font-normal">(opsional)</span>
                  </Label>
                  <Input {...form.register('bukti_url')} placeholder="https://..." disabled={lockedBySuperman} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">
                    Keterangan <span className="text-gray-400 font-normal">(opsional)</span>
                  </Label>
                  <Textarea
                    {...form.register('keterangan')}
                    rows={2}
                    disabled={lockedBySuperman}
                    placeholder="Catatan pembayaran..."
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  <Button type="submit" className="bg-[#1E8449] hover:bg-[#196F3D]" disabled={!canSave}>
                    <Save size={14} />
                    {saving ? 'Menyimpan...' : editingId ? 'Simpan Perubahan' : 'Simpan Cash In'}
                  </Button>
                  {lastSaved && selected && !editingId && (
                    <Button type="button" variant="outline" onClick={() => setKuitansiTarget(lastSaved)}>
                      <FileText size={14} /> Buat Kuitansi
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </form>

          {selected && (
            <details className="group rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                <span className="inline-flex items-center gap-2">
                  <Zap size={14} className="text-[#1B4F72]" />
                  Otomasi Superman
                  <span className="text-[10px] font-normal text-gray-400">opsional</span>
                </span>
                <ChevronDown size={14} className="text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 space-y-3 border-t pt-3">
                {supermanStatus && (
                  <div className={cn(
                    'text-xs rounded-lg border px-3 py-2',
                    supermanReady
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-amber-50 border-amber-200 text-amber-800',
                  )}>
                    {!supermanStatus.configured && <p>Superman belum dikonfigurasi di API.</p>}
                    {supermanStatus.configured && !supermanStatus.playwright_ready && (
                      <p>Playwright belum siap: {supermanStatus.playwright_error ?? 'periksa deploy API'}</p>
                    )}
                    {supermanStatus.configured && supermanStatus.playwright_ready && !supermanStatus.session_valid && (
                      <p>Session kedaluwarsa — verifikasi captcha saat diminta.</p>
                    )}
                    {supermanReady && <p>Session Superman valid.</p>}
                  </div>
                )}
                {selected.superman && (
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
                    Superman: {selected.superman}
                  </p>
                )}
                <SupermanDocChecklist
                  kompensasiId={selected.id}
                  refreshKey={docRefresh}
                  onReadyChange={setDocsReady}
                />
                {!selected.superman && (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#1B4F72] text-[#1B4F72]"
                    disabled={!canAutoSuperman}
                    onClick={() => selected && startSuperman(selected.id)}
                  >
                    <Zap size={14} /> Kirim ke Superman
                  </Button>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ════════════════════ DAFTAR ════════════════════ */}
      {viewMode === 'daftar' && (
        <Card className="shadow-sm border-gray-200/80 overflow-hidden">
          <CardHeader className="py-3.5 px-5 border-b bg-white space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 shrink-0">
                  <ListChecks size={16} />
                </span>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900">Daftar Cash In</CardTitle>
                  <p className="text-[11px] text-gray-500">
                    Termasuk tagihan lunas · klik Edit untuk mengubah di form Input
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-[#1E8449] hover:bg-[#196F3D] h-8"
                onClick={startNewInput}
              >
                <PlusCircle size={14} /> Input baru
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs text-gray-500 whitespace-nowrap">Tahun bayar</label>
                <select
                  value={filterTahun}
                  onChange={e => setFilterTahun(e.target.value)}
                  className="text-xs border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-[#117A65]"
                >
                  <option value="semua">Semua</option>
                  {tahunList.map(y => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={listQuery}
                  onChange={e => setListQuery(e.target.value)}
                  placeholder="Cari Dapenbun, Pelayanan 13, R800032-0027..."
                  className="pl-9 h-8 text-sm bg-slate-50/80"
                />
                {listQuery && (
                  <button
                    type="button"
                    onClick={() => setListQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <span className="text-[11px] font-medium text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 tabular-nums">
                {filteredCashInRows.length} transaksi
              </span>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {allCashInRows.length === 0 ? (
              <div className="py-16 text-center px-4">
                <Banknote className="mx-auto text-gray-300 mb-2" size={32} />
                <p className="text-sm text-gray-500">Belum ada cash in tercatat</p>
                <Button type="button" size="sm" className="mt-3 bg-[#1E8449]" onClick={startNewInput}>
                  <PlusCircle size={14} /> Input Cash In pertama
                </Button>
              </div>
            ) : filteredCashInRows.length === 0 ? (
              <div className="py-12 text-center px-4">
                <Search className="mx-auto text-gray-300 mb-2" size={24} />
                <p className="text-sm text-gray-500">Tidak ada hasil untuk filter / pencarian ini</p>
              </div>
            ) : (
              <div className="overflow-auto max-h-[min(72vh,680px)]">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="border-b bg-slate-50 text-gray-500 text-[11px] uppercase tracking-wide sticky top-0 z-10">
                      <th className="text-left px-4 py-2.5 font-medium">Tanggal</th>
                      <th className="text-left px-3 py-2.5 font-medium">Aset / Mitra</th>
                      <th className="text-left px-3 py-2.5 font-medium">Tahap</th>
                      <th className="text-right px-3 py-2.5 font-medium">Nominal</th>
                      <th className="text-center px-3 py-2.5 font-medium w-[108px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredCashInRows.map((r, idx) => (
                      <tr
                        key={r.payment.id}
                        className={cn(
                          'transition-colors hover:bg-blue-50/40',
                          idx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white',
                        )}
                      >
                        <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 tabular-nums text-[13px]">
                          {formatTanggal(r.payment.tgl_bayar)}
                        </td>
                        <td className="px-3 py-2.5 min-w-[180px] max-w-[280px]">
                          <p className="font-medium text-gray-800 text-[13px] truncate" title={r.aset}>
                            {r.aset}
                          </p>
                          <p className="text-[11px] text-gray-500 truncate">
                            {r.mitra}
                            {r.monika ? (
                              <span className="ml-1 font-mono text-[10px] text-[#1B4F72] bg-blue-50 px-1 rounded">
                                {r.monika}
                              </span>
                            ) : null}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 text-[13px] text-gray-600">
                          {r.periode}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap text-[13px]">
                          {formatRupiah(r.payment.nominal_bayar)}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              disabled={r.locked}
                              title={r.locked ? 'Terkunci Superman' : 'Edit di form Input'}
                              onClick={() => openEdit(r.payment)}
                              className={cn(
                                'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors',
                                r.locked
                                  ? 'opacity-40 cursor-not-allowed border-gray-100 text-gray-300'
                                  : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
                              )}
                            >
                              <Pencil size={13} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              disabled={r.locked}
                              title={r.locked ? 'Terkunci Superman' : 'Hapus'}
                              onClick={() => setDeleteTarget(r.payment)}
                              className={cn(
                                'h-7 w-7 inline-flex items-center justify-center rounded-md border transition-colors',
                                r.locked
                                  ? 'opacity-40 cursor-not-allowed border-gray-100 text-gray-300'
                                  : 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
                              )}
                            >
                              <Trash2 size={13} strokeWidth={2} />
                            </button>
                            <button
                              type="button"
                              title="Kuitansi"
                              onClick={() => {
                                setSelectedKsId(String(r.kompensasi.ks_id))
                                form.setValue('kompensasi_id', String(r.kompensasi.id))
                                setKuitansiTarget(r.payment)
                              }}
                              className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              <FileText size={13} strokeWidth={2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-slate-50 font-semibold text-[13px]">
                      <td colSpan={3} className="px-4 py-2.5 text-gray-600">
                        Total{listQuery || filterTahun !== 'semua' ? ' (filter)' : ''}
                      </td>
                      <td className="px-3 py-2.5 text-right text-emerald-800 tabular-nums">
                        {formatRupiah(totalCashInFiltered)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <SupermanCaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        onVerified={() => selected && startSuperman(selected.id)}
      />
      <SupermanProgressDialog
        open={progressOpen}
        jobId={jobId}
        onDone={handleSupermanDone}
        onError={msg => { setProgressOpen(false); alert(msg) }}
        onClose={() => setProgressOpen(false)}
      />
      {kuitansiTarget && selected && (
        <KuitansiDialog
          open={!!kuitansiTarget}
          onClose={() => setKuitansiTarget(null)}
          kompensasi={{ ...selected, kerja_sama: ks }}
          pembayaran={kuitansiTarget}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus Cash In?</DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <p className="text-sm text-gray-600">
              Hapus pembayaran {formatTanggal(deleteTarget.tgl_bayar)} sebesar{' '}
              <strong className="text-emerald-700">{formatRupiah(deleteTarget.nominal_bayar)}</strong>?
              Data akan dihapus permanen.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Batal</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
