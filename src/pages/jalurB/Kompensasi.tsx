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
import { Progress } from '@/components/ui/progress'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, formatRupiah } from '@/lib/utils'
import { Plus, MessageSquare, FileWarning, DollarSign } from 'lucide-react'
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
  const { allKompensasi, isLoading, fetchAllKompensasi, addKompensasi, getKompensasiWithStatus, catatPembayaran } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { terbitkanSP, kirimNotifWA } = useNotifikasiStore()

  const [kompDialog, setKompDialog] = useState(false)
  const [bayarDialog, setBayarDialog] = useState(false)
  const [bayarTarget, setBayarTarget] = useState<KType | null>(null)
  const [filterKS, setFilterKS] = useState<string>('semua')

  const kompForm = useForm<KompForm>({
    resolver: zodResolver(kompSchema),
    defaultValues: { ppn_persen: 11, pph_persen: 10, maks_hari_bayar: 14, persen_denda_per_hari: 0.1 },
  })

  const bayarForm = useForm<BayarForm>({ resolver: zodResolver(bayarSchema) })

  const watchNominal = kompForm.watch('nominal')
  const watchPPN = kompForm.watch('ppn_persen')

  useEffect(() => { fetchAllKompensasi(); fetchKS() }, [])

  const filtered = filterKS === 'semua' ? allKompensasi : allKompensasi.filter(k => k.ks_id === filterKS)

  const onAddKomp = async (data: KompForm) => {
    await addKompensasi(data as any)
    setKompDialog(false)
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
        <Button onClick={() => { kompForm.reset({ ppn_persen: 11, pph_persen: 10, maks_hari_bayar: 14, persen_denda_per_hari: 0.1 }); setKompDialog(true) }} className="bg-[#5B2C6F]">
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

      <div className="space-y-3">
        {isLoading ? (
          <div className="bg-white rounded-xl border p-6"><TableSkeleton rows={3} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Belum ada kompensasi" description="Tambahkan kompensasi untuk kerja sama aktif." action={<Button onClick={() => setKompDialog(true)} size="sm"><Plus size={14} /> Tambah</Button>} />
        ) : filtered.map(k => {
          const pembayaran = (k as any).pembayaran as Pembayaran[] ?? []
          const ws = getKompensasiWithStatus(k, pembayaran)
          const ks = daftarKS.find(x => x.id === k.ks_id)
          const persen = Math.min(100, Math.round((ws.totalDibayar / k.total_tagihan) * 100))

          return (
            <div key={k.id} className="bg-white rounded-xl border p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs text-gray-500">{ks ? `${(ks.aset as any)?.nama_aset ?? '-'} — ${ks.nama_mitra}` : '-'}</p>
                  <h3 className="font-semibold text-gray-900">{k.periode_label ?? 'Kompensasi'}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Jatuh tempo: {formatTanggal(k.tgl_jatuh_tempo)}</p>
                </div>
                <StatusBadge type="bayar" value={ws.statusBayar} />
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Total Tagihan</p>
                  <CurrencyDisplay value={k.total_tagihan} size="sm" className="font-semibold" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sudah Dibayar</p>
                  <CurrencyDisplay value={ws.totalDibayar} size="sm" className="font-semibold text-green-700" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Sisa Tagihan</p>
                  <CurrencyDisplay value={ws.sisaTagihan} size="sm" className="font-semibold text-red-700" />
                </div>
              </div>

              <Progress value={persen} className="h-2 mb-2" />
              <p className="text-xs text-gray-500 mb-3">{persen}% terbayar</p>

              {ws.dendaAkumulasi.hariTerlambat > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm">
                  <span className="text-red-700 font-medium">Terlambat {ws.dendaAkumulasi.hariTerlambat} hari — </span>
                  <span className="text-red-600">Denda akumulasi: {formatRupiah(ws.dendaAkumulasi.nominalDenda)} ({ws.dendaAkumulasi.persenAkumulasi.toFixed(2)}%)</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() => openBayar(k)}>
                  <DollarSign size={13} /> Catat Pembayaran
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleSendWA(k)}>
                  <MessageSquare size={13} /> Kirim Notif WA
                </Button>
                {ws.statusBayar === 'terlambat' && (
                  <Button size="sm" variant="outline" className="text-orange-700 border-orange-300" onClick={() => handleSP(k)}>
                    <FileWarning size={13} /> Terbitkan SP
                  </Button>
                )}
              </div>

              {pembayaran.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Riwayat Pembayaran:</p>
                  <div className="space-y-1">
                    {pembayaran.map(p => (
                      <div key={p.id} className="flex justify-between text-xs text-gray-600">
                        <span>{formatTanggal(p.tgl_bayar)}</span>
                        <span className="font-medium">{formatRupiah(p.nominal_bayar)}</span>
                        {p.bukti_url && <a href={p.bukti_url} target="_blank" className="text-blue-600">Bukti</a>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dialog tambah kompensasi */}
      <Dialog open={kompDialog} onOpenChange={setKompDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Tambah Kompensasi</DialogTitle></DialogHeader>
          <form onSubmit={kompForm.handleSubmit(onAddKomp)} className="space-y-4">
            <div>
              <Label>Kerja Sama</Label>
              <Select onValueChange={v => kompForm.setValue('ks_id', v)}>
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
              <Button type="submit" className="bg-[#5B2C6F]">Tambah</Button>
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
