import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, FileText, Zap, Pencil, Trash2, X, Search } from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { formatRupiah, formatTanggal } from '@/lib/utils'
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

export function InputPembayaran() {
  const [params] = useSearchParams()
  const { allKompensasi, fetchAllKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
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

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    api.get<SupermanStatus>('/api/superman/status').then(setSupermanStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const kid = params.get('kompensasi_id')
    if (!kid || allKompensasi.length === 0) return
    const k = allKompensasi.find(x => x.id === kid)
    if (k) {
      setSelectedKsId(k.ks_id)
      form.setValue('kompensasi_id', kid)
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

  // Auto-isi nominal sisa hanya saat mode tambah (bukan edit)
  useEffect(() => {
    if (editingId) return
    if (selected && ws && ws.sisaTagihan > 0) {
      form.setValue('nominal_bayar', ws.sisaTagihan)
    }
  }, [selectedId, ws?.sisaTagihan, editingId])

  // Semua KS yang punya tagihan — dari master KS + embed kompensasi (termasuk lunas)
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

  /** Semua cash in (pembayaran) — sumber edit tanpa harus pilih dropdown dulu */
  const allCashInRows = useMemo(() => {
    type Row = {
      payment: Pembayaran
      kompensasi: Kompensasi
      mitra: string
      aset: string
      monika: string
      periode: string
      locked: boolean
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
        rows.push({ payment: p, kompensasi: k, mitra, aset, monika, periode, locked })
      })
    })
    rows.sort((a, b) => String(b.payment.tgl_bayar).localeCompare(String(a.payment.tgl_bayar)))
    return rows
  }, [allKompensasi, daftarKS])

  const filteredCashInRows = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    if (!q) return allCashInRows
    const tokens = q.split(/\s+/).filter(Boolean)
    return allCashInRows.filter(r => {
      const hay = [
        r.mitra, r.aset, r.monika, r.periode,
        r.payment.tgl_bayar, String(r.payment.nominal_bayar),
        r.payment.keterangan ?? '', r.payment.no_pembayaran ?? '',
      ].join(' ').toLowerCase()
      return tokens.every(t => hay.includes(t))
    })
  }, [allCashInRows, listQuery])

  const handleKsChange = (ksId: string) => {
    cancelEdit()
    setSelectedKsId(ksId)
    const tahapForKs = allKompensasi
      .filter(k => String(k.ks_id) === String(ksId))
      .sort((a, b) => a.tgl_jatuh_tempo.localeCompare(b.tgl_jatuh_tempo))
    // Prefer tahap belum lunas, fallback tahap pertama
    const prefer = tahapForKs.find(k => {
      const s = getKompensasiWithStatus(k, (k.pembayaran ?? []) as Pembayaran[])
      return s.statusBayar !== 'lunas'
    }) ?? tahapForKs[0]
    form.setValue('kompensasi_id', prefer ? String(prefer.id) : '')
  }

  useEffect(() => {
    if (selected && selected.ks_id !== selectedKsId) {
      setSelectedKsId(selected.ks_id)
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

  const openEdit = (p: Pembayaran, opts?: { fromList?: boolean }) => {
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
    if (opts?.fromList) {
      document.getElementById('form-cash-in')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
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
      }
      await fetchAllKompensasi()
      setRiwayatTick(t => t + 1)
      form.setValue('keterangan', '')
      form.setValue('bukti_url', '')
      form.setValue('tgl_bayar', new Date().toISOString().split('T')[0])
      form.setValue('is_pph_disetor', false)
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
      if (editingId === deleteTarget.id) cancelEdit()
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

  // Mode edit: boleh simpan meski sisa 0 (nominal diganti dalam batas sisa + nominal lama)
  const sisaUntukInput = editingId
    ? (ws?.sisaTagihan ?? 0) + (riwayat.find(p => p.id === editingId)?.nominal_bayar ?? 0)
    : (ws?.sisaTagihan ?? 0)

  const canSave = !!(
    selected
    && !saving
    && !lockedBySuperman
    && form.watch('nominal_bayar') > 0
    && (editingId || sisaUntukInput > 0.5)
  )

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Input Pembayaran (Cash In)</h1>
        <p className="text-sm text-gray-500">
          Catat realisasi pembayaran mitra. Invoice tidak wajib di sini.
          Termasuk tagihan <strong className="font-medium text-gray-700">sudah lunas</strong> — cari nama aset / mitra / ID Monika untuk edit riwayat.
        </p>
      </div>

      {/* Daftar semua cash in — tidak tergantung dropdown (fixis Dapenbun/lunas) */}
      <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Semua Cash In Tercatat</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Cari mitra/aset lalu klik <strong>Edit</strong> — termasuk tagihan sudah lunas.
            </p>
          </div>
          <span className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2.5 py-1 tabular-nums">
            {filteredCashInRows.length} / {allCashInRows.length} baris
          </span>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            value={listQuery}
            onChange={e => setListQuery(e.target.value)}
            placeholder="Cari: Dapenbun, Pelayanan 13, R800032-0027..."
            className="pl-9"
          />
        </div>
        {allCashInRows.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">Belum ada data pembayaran.</p>
        ) : filteredCashInRows.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">Tidak ada hasil untuk “{listQuery}”.</p>
        ) : (
          <div className="overflow-x-auto max-h-[320px] overflow-y-auto border rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b z-10">
                <tr className="text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Tgl bayar</th>
                  <th className="px-3 py-2 font-medium">Aset / Mitra</th>
                  <th className="px-3 py-2 font-medium">Tahap</th>
                  <th className="px-3 py-2 font-medium text-right">Nominal</th>
                  <th className="px-3 py-2 font-medium text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredCashInRows.map(r => {
                  const isEditing = editingId === String(r.payment.id)
                  return (
                    <tr
                      key={r.payment.id}
                      className={`border-b border-gray-50 ${isEditing ? 'bg-amber-50' : 'hover:bg-slate-50/80'}`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600 tabular-nums">
                        {formatTanggal(r.payment.tgl_bayar)}
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="font-medium text-gray-800">{r.aset}</div>
                        <div className="text-[10px] text-gray-500">
                          {r.mitra}
                          {r.monika ? ` · ${r.monika}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.periode}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700 tabular-nums whitespace-nowrap">
                        {formatRupiah(r.payment.nominal_bayar)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-blue-700"
                            disabled={r.locked}
                            title={r.locked ? 'Terkunci Superman' : 'Edit'}
                            onClick={() => openEdit(r.payment, { fromList: true })}
                          >
                            <Pencil size={13} /> Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5 text-red-600"
                            disabled={r.locked}
                            title={r.locked ? 'Terkunci Superman' : 'Hapus'}
                            onClick={() => setDeleteTarget(r.payment)}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form id="form-cash-in" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 border-b pb-2">
            {editingId ? 'Edit Cash In' : 'Tambah Cash In Baru'}
          </h2>
          {editingId && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="font-medium">Mode edit cash in — ubah data lalu simpan</span>
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
              >
                <X size={12} /> Batal edit
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Aset / Mitra / Kerja Sama</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={selectedKsId}
                  onValueChange={handleKsChange}
                  disabled={!!editingId}
                  options={ksOptions.map(o => ({
                    value: o.id,
                    label: `${o.aset} — ${o.mitra}`,
                    searchText: [
                      o.aset,
                      o.mitra,
                      o.noKontrak,
                      ...o.monika,
                      o.lunas > 0 ? 'lunas' : '',
                    ].join(' '),
                    description: [
                      o.noKontrak,
                      o.monika.length ? `Monika ${o.monika.join(', ')}` : null,
                      o.open > 0 ? `${o.open} terbuka` : null,
                      o.lunas > 0 ? `${o.lunas} lunas` : null,
                    ].filter(Boolean).join(' · '),
                  }))}
                  placeholder="Cari aset, mitra, Monika..."
                  searchPlaceholder="cth: Pelayanan 13, Dapenbun, R800032-0027..."
                />
              </div>
              {ks && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Mitra: {ks.nama_mitra}
                  {ks.aset?.kode_aset ? ` · Monika ${ks.aset.kode_aset}` : ''}
                  {ks.no_perjanjian ? ` · ${ks.no_perjanjian}` : ks.no_kontrak_sap ? ` · SAP: ${ks.no_kontrak_sap}` : ''}
                </p>
              )}
            </div>

            <div>
              <Label>Tahap Tagihan</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={selectedId}
                  disabled={!selectedKsId || !!editingId}
                  onValueChange={v => {
                    cancelEdit()
                    form.setValue('kompensasi_id', v)
                  }}
                  options={tahapOptions.map(o => ({
                    value: o.id,
                    label: o.status === 'lunas'
                      ? `${o.periode} — Lunas (${formatRupiah(o.dibayar)})`
                      : `${o.periode} — sisa ${formatRupiah(o.sisa)}`,
                    searchText: `${o.periode} ${o.monika} ${o.status}`,
                    description: [
                      `Tagihan ${formatRupiah(o.total)}`,
                      `JT ${formatTanggal(o.jatuhTempo)}`,
                      o.monika ? `Monika ${o.monika}` : null,
                      o.status,
                    ].filter(Boolean).join(' · '),
                  }))}
                  placeholder="Cari & pilih tahap..."
                  searchPlaceholder="Ketik periode / Monika..."
                />
              </div>
              {selectedTahap && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Jatuh tempo {formatTanggal(selectedTahap.jatuhTempo)}
                  {selectedTahap.monika ? ` · Monika ${selectedTahap.monika}` : ''}
                  {selectedTahap.status === 'lunas' && selectedTahap.dibayar > selectedTahap.total
                    ? ` · Kelebihan bayar ${formatRupiah(selectedTahap.dibayar - selectedTahap.total)}`
                    : ''}
                </p>
              )}
            </div>
          </div>

          {selected && ws && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Total Tagihan</p>
                <CurrencyDisplay value={selected.total_tagihan} size="sm" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Sudah Dibayar</p>
                <CurrencyDisplay value={ws.totalDibayar} size="sm" className="text-green-700" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{editingId ? 'Sisa (setelah edit)' : 'Sisa'}</p>
                <CurrencyDisplay
                  value={Math.max(0, sisaUntukInput - (form.watch('nominal_bayar') || 0))}
                  size="sm"
                  className="text-red-600"
                />
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <StatusBadge type="bayar" value={ws.statusBayar} />
              </div>
            </div>
          )}

          {lockedBySuperman && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Tagihan ini sudah punya nomor Superman — cash in tidak bisa ditambah/diubah/dihapus.
            </p>
          )}

          {selected?.no_invoice && (
            <p className="text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              No. invoice (opsional / dari apps lain): <strong className="font-mono">{selected.no_invoice}</strong>
              {selected.invoice_tgl ? ` · ${formatTanggal(selected.invoice_tgl)}` : ''}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...form.register('tgl_bayar')} className="mt-1" disabled={lockedBySuperman} />
            </div>
            <div>
              <Label>Nominal Cash In (Rp)</Label>
              <CurrencyInput
                value={form.watch('nominal_bayar')}
                onChange={v => form.setValue('nominal_bayar', v)}
                className="mt-1"
                disabled={lockedBySuperman}
              />
              {editingId && sisaUntukInput > 0 && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Maks. dapat diisi: {formatRupiah(sisaUntukInput)}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="pph" {...form.register('is_pph_disetor')} disabled={lockedBySuperman} />
            <Label htmlFor="pph" className="font-normal">PPh sudah disetor</Label>
          </div>

          <div>
            <Label>Link Bukti Transfer (opsional)</Label>
            <Input {...form.register('bukti_url')} className="mt-1" placeholder="https://..." disabled={lockedBySuperman} />
          </div>
          <div>
            <Label>Keterangan (opsional)</Label>
            <Textarea {...form.register('keterangan')} className="mt-1" rows={2} disabled={lockedBySuperman} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="bg-[#1E8449]" disabled={!canSave}>
            <Save size={14} />
            {saving
              ? 'Menyimpan...'
              : editingId
                ? 'Simpan Perubahan'
                : 'Simpan Cash In'}
          </Button>
          {editingId && (
            <Button type="button" variant="outline" onClick={cancelEdit}>
              Batal
            </Button>
          )}
          {lastSaved && selected && !editingId && (
            <Button type="button" variant="outline" onClick={() => setKuitansiTarget(lastSaved)}>
              <FileText size={14} /> Buat Kuitansi
            </Button>
          )}
        </div>
      </form>

      {selected && riwayat.length > 0 && (
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Riwayat Cash In</h2>
          <div className="space-y-2 text-sm">
            {riwayat.map(p => {
              const isEditing = editingId === p.id
              return (
                <div
                  key={p.id}
                  className={`flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2 ${
                    isEditing ? 'bg-amber-50/80 -mx-2 px-2 rounded-md' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <span className="text-gray-500 tabular-nums">{formatTanggal(p.tgl_bayar)}</span>
                    <span className="font-medium text-green-700 tabular-nums">{formatRupiah(p.nominal_bayar)}</span>
                    {p.no_pembayaran && (
                      <span className="font-mono text-[10px] text-gray-400">{p.no_pembayaran}</span>
                    )}
                    {p.keterangan && (
                      <span className="text-xs text-gray-400 truncate max-w-[200px]" title={p.keterangan}>
                        {p.keterangan}
                      </span>
                    )}
                    {isEditing && (
                      <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        Sedang diedit
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setKuitansiTarget(p)}>
                      <FileText size={13} /> Kuitansi
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                      disabled={lockedBySuperman}
                      onClick={() => openEdit(p)}
                      title={lockedBySuperman ? 'Terkunci Superman' : 'Edit cash in'}
                    >
                      <Pencil size={13} /> Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      disabled={lockedBySuperman}
                      onClick={() => setDeleteTarget(p)}
                      title={lockedBySuperman ? 'Terkunci Superman' : 'Hapus cash in'}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selected && (
        <details className="bg-white border rounded-xl p-4 shadow-sm group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 list-none flex items-center justify-between">
            <span>Otomasi Superman (opsional)</span>
            <span className="text-[11px] text-gray-400 font-normal">tidak wajib untuk catat cash in</span>
          </summary>
          <div className="mt-4 space-y-3 border-t pt-4">
            {supermanStatus && (
              <div className={`text-xs rounded-lg border px-3 py-2 ${
                supermanReady ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                {!supermanStatus.configured && (
                  <p>Superman belum dikonfigurasi di service API.</p>
                )}
                {supermanStatus.configured && !supermanStatus.playwright_ready && (
                  <p>Playwright belum siap: {supermanStatus.playwright_error ?? 'periksa deploy API'}</p>
                )}
                {supermanStatus.configured && supermanStatus.playwright_ready && !supermanStatus.session_valid && (
                  <p>Session Superman kedaluwarsa — verifikasi captcha saat diminta.</p>
                )}
                {supermanReady && <p>Session Superman valid.</p>}
              </div>
            )}
            {selected.superman && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
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
                title={
                  !supermanReady
                    ? 'Superman belum siap'
                    : !docsReady
                      ? 'Lengkapi dokumen pendukung dulu'
                      : !isLunas
                        ? 'Pembayaran harus lunas dulu'
                        : 'Jalankan otomasi Superman'
                }
                onClick={() => selected && startSuperman(selected.id)}
              >
                <Zap size={14} /> Kirim ke Superman
              </Button>
            )}
          </div>
        </details>
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
              <strong className="text-green-700">{formatRupiah(deleteTarget.nominal_bayar)}</strong>?
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
