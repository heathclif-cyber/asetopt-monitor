import { useEffect, useState } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { Kompensasi as KType, Pembayaran } from '@/types'
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
import { Plus, Pencil, MessageSquare, FileWarning, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { buatPesanWA } from '@/utils/notifikasiUtils'

const kompSchema = z.object({
  ks_id: z.string().min(1),
  periode_label: z.string().optional(),
  nominal: z.coerce.number().min(0),
  ppn_persen: z.coerce.number().min(0).default(11),
  pph_persen: z.coerce.number().min(0).default(10),
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

export function Kompensasi() {
  const { allKompensasi, isLoading, fetchAllKompensasi, addKompensasi, updateKompensasi, getKompensasiWithStatus, catatPembayaran } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { terbitkanSP, kirimNotifWA } = useNotifikasiStore()

  const [kompDialog, setKompDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<KType | null>(null)
  const [bayarDialog, setBayarDialog] = useState(false)
  const [bayarTarget, setBayarTarget] = useState<KType | null>(null)
  const [filterKS, setFilterKS] = useState<string>('semua')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const kompForm = useForm<KompForm>({
    resolver: zodResolver(kompSchema),
    defaultValues: { ppn_persen: 11, pph_persen: 10, maks_hari_bayar: 14, persen_denda_per_hari: 0.1 },
  })

  const bayarForm = useForm<BayarForm>({ resolver: zodResolver(bayarSchema) })

  const watchNominal = kompForm.watch('nominal')
  const watchPPN = kompForm.watch('ppn_persen')

  useEffect(() => { fetchAllKompensasi(); fetchKS() }, [])

  const filtered = filterKS === 'semua' ? allKompensasi : allKompensasi.filter(k => k.ks_id === filterKS)

  const openAdd = () => {
    setEditTarget(null)
    kompForm.reset({ ppn_persen: 11, pph_persen: 10, maks_hari_bayar: 14, persen_denda_per_hari: 0.1 })
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
      maks_hari_bayar: k.maks_hari_bayar,
      persen_denda_per_hari: k.persen_denda_per_hari,
      tgl_jatuh_tempo: k.tgl_jatuh_tempo,
      keterangan: k.keterangan ?? '',
    })
    setKompDialog(true)
  }

  const onSubmit = async (data: KompForm) => {
    if (editTarget) {
      await updateKompensasi(editTarget.id, data as any)
    } else {
      await addKompensasi(data as any)
    }
    setKompDialog(false)
    await fetchAllKompensasi()
  }

  const openBayar = (k: KType) => {
    setBayarTarget(k)
    bayarForm.reset()
    setBayarDialog(true)
  }

  const onBayar = async (data: BayarForm) => {
    if (!bayarTarget) return
    await catatPembayaran({ ...data, kompensasi_id: bayarTarget.id } as Omit<Pembayaran, 'id' | 'created_at'>)
    setBayarDialog(false)
    await fetchAllKompensasi()
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kompensasi</h1>
          <p className="text-sm text-gray-500">Monitoring dan pencatatan kompensasi kerja sama</p>
        </div>
        <Button onClick={openAdd} className="bg-[#5B2C6F] hover:bg-[#5B2C6F]/90">
          <Plus size={16} /> Tambah Kompensasi
        </Button>
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
                        {ws.dendaAkumulasi.hariTerlambat > 0 && (
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
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(k)}>
                            <Pencil size={14} />
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
                          {pembayaran.length > 0 && (
                            <Button variant="ghost" size="icon" title="Riwayat pembayaran" onClick={() => setExpandedId(expanded ? null : k.id)}>
                              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded && pembayaran.length > 0 && (
                      <tr key={`${k.id}-detail`} className="bg-gray-50">
                        <td colSpan={8} className="px-6 py-3">
                          <p className="text-xs font-semibold text-gray-600 mb-2">Riwayat Pembayaran:</p>
                          <div className="space-y-1">
                            {pembayaran.map(p => (
                              <div key={p.id} className="flex gap-6 text-xs text-gray-600">
                                <span>{formatTanggal(p.tgl_bayar)}</span>
                                <span className="font-medium">{formatRupiah(p.nominal_bayar)}</span>
                                {p.keterangan && <span className="text-gray-400">{p.keterangan}</span>}
                                {p.bukti_url && <a href={p.bukti_url} target="_blank" className="text-blue-600">Lihat Bukti</a>}
                              </div>
                            ))}
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

      {/* Dialog tambah / edit kompensasi */}
      <Dialog open={kompDialog} onOpenChange={setKompDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Kompensasi' : 'Tambah Kompensasi'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={kompForm.handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Kerja Sama</Label>
              <Select
                defaultValue={editTarget?.ks_id}
                onValueChange={v => kompForm.setValue('ks_id', v)}
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
            {watchNominal > 0 && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <p>PPN: {formatRupiah(watchNominal * (watchPPN ?? 11) / 100)}</p>
                <p className="font-semibold">Total Tagihan: {formatRupiah(watchNominal + watchNominal * (watchPPN ?? 11) / 100)}</p>
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
              <Button type="submit" className="bg-[#5B2C6F]">{editTarget ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog catat pembayaran */}
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
    </div>
  )
}
