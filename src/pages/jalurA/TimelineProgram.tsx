import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Aset, TimelineProgram as TLType, ProspekMitra } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/common/StatusBadge'
import { SlideOver } from '@/components/common/SlideOver'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, hitungSisaHari } from '@/lib/utils'
import { Plus, Pencil, AlertCircle, Users, ChevronRight } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const TAHAPAN_BAKU = ['Identifikasi', 'Kajian Aset', 'Penawaran', 'Negosiasi', 'Selesai']

const tlSchema = z.object({
  nama_tahapan: z.string().min(1),
  urutan: z.coerce.number(),
  tgl_target: z.string().optional(),
  tgl_realisasi: z.string().optional(),
  status: z.string(),
  pic: z.string().optional(),
  kendala: z.string().optional(),
  tindak_lanjut: z.string().optional(),
})

const prospekSchema = z.object({
  nama_calon_mitra: z.string().min(1),
  kontak_pic: z.string().optional(),
  no_telepon: z.string().optional(),
  tgl_pendekatan: z.string().optional(),
  progress: z.string(),
  catatan: z.string().optional(),
})

const ksConvertSchema = z.object({
  nama_mitra: z.string().min(1),
  no_perjanjian: z.string().optional(),
  tgl_mulai: z.string().min(1),
  tgl_selesai: z.string().min(1),
  no_wa_mitra: z.string().optional(),
  keterangan: z.string().optional(),
})

type TLForm = z.infer<typeof tlSchema>
type ProspekForm = z.infer<typeof prospekSchema>
type KSConvertForm = z.infer<typeof ksConvertSchema>

export function TimelineProgram() {
  const { daftarAset, isLoading, fetchAset, updateStatus } = useAsetStore()
  const { daftarTahapan, daftarProspek, fetchAllTimeline, addTahapan, updateTahapan, addProspek, updateProspek } = useTimelineStore()
  const { addKS } = useKerjaSamaStore()

  const [selectedAset, setSelectedAset] = useState<Aset | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [tlDialogOpen, setTLDialogOpen] = useState(false)
  const [prospekDialogOpen, setProspekDialogOpen] = useState(false)
  const [convertDialogOpen, setConvertDialogOpen] = useState(false)
  const [editTL, setEditTL] = useState<TLType | null>(null)
  const [editProspek, setEditProspek] = useState<ProspekMitra | null>(null)
  const [selectedProspek, setSelectedProspek] = useState<ProspekMitra | null>(null)

  const pipelineAset = daftarAset.filter(a => ['pipeline', 'prospek', 'negosiasi'].includes(a.status))

  const tlForm = useForm<TLForm>({ resolver: zodResolver(tlSchema), defaultValues: { status: 'belum', urutan: 1 } })
  const prospekForm = useForm<ProspekForm>({ resolver: zodResolver(prospekSchema), defaultValues: { progress: 'identifikasi' } })
  const ksForm = useForm<KSConvertForm>({ resolver: zodResolver(ksConvertSchema) })

  useEffect(() => { fetchAset(); fetchAllTimeline() }, [])

  const getCurrentTahapan = (asetId: string) => {
    const list = daftarTahapan[asetId] ?? []
    return list.filter(t => t.status !== 'selesai').sort((a, b) => a.urutan - b.urutan)[0]
  }

  const openDetail = (aset: Aset) => {
    setSelectedAset(aset)
    setDetailOpen(true)
  }

  const openAddTL = () => {
    setEditTL(null)
    tlForm.reset({ status: 'belum', urutan: (daftarTahapan[selectedAset?.id ?? '']?.length ?? 0) + 1 })
    setTLDialogOpen(true)
  }

  const openEditTL = (tl: TLType) => {
    setEditTL(tl)
    tlForm.reset({
      nama_tahapan: tl.nama_tahapan,
      urutan: tl.urutan,
      tgl_target: tl.tgl_target ?? '',
      tgl_realisasi: tl.tgl_realisasi ?? '',
      status: tl.status,
      pic: tl.pic ?? '',
      kendala: tl.kendala ?? '',
      tindak_lanjut: tl.tindak_lanjut ?? '',
    })
    setTLDialogOpen(true)
  }

  const onSubmitTL = async (data: TLForm) => {
    if (!selectedAset) return
    if (editTL) {
      await updateTahapan(editTL.id, data as Partial<TLType>, selectedAset.id)
    } else {
      await addTahapan({ ...data as any, aset_id: selectedAset.id })
    }
    setTLDialogOpen(false)
  }

  const openAddProspek = () => {
    setEditProspek(null)
    prospekForm.reset({ progress: 'identifikasi' })
    setProspekDialogOpen(true)
  }

  const openEditProspek = (p: ProspekMitra) => {
    setEditProspek(p)
    prospekForm.reset({
      nama_calon_mitra: p.nama_calon_mitra,
      kontak_pic: p.kontak_pic ?? '',
      no_telepon: p.no_telepon ?? '',
      tgl_pendekatan: p.tgl_pendekatan ?? '',
      progress: p.progress,
      catatan: p.catatan ?? '',
    })
    setProspekDialogOpen(true)
  }

  const onSubmitProspek = async (data: ProspekForm) => {
    if (!selectedAset) return
    if (editProspek) {
      await updateProspek(editProspek.id, data as Partial<ProspekMitra>, selectedAset.id)
    } else {
      await addProspek({ ...data as any, aset_id: selectedAset.id })
    }
    setProspekDialogOpen(false)
  }

  const openConvert = (p: ProspekMitra) => {
    setSelectedProspek(p)
    ksForm.reset({ nama_mitra: p.nama_calon_mitra })
    setConvertDialogOpen(true)
  }

  const onConvert = async (data: KSConvertForm) => {
    if (!selectedAset || !selectedProspek) return
    await updateProspek(selectedProspek.id, { progress: 'berhasil' }, selectedAset.id)
    await addKS({ ...data, aset_id: selectedAset.id, prospek_id: selectedProspek.id, status: 'aktif' } as any)
    await updateStatus(selectedAset.id, 'aktif_ks')
    setConvertDialogOpen(false)
    setDetailOpen(false)
    await fetchAllTimeline()
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Timeline Program</h1>
        <p className="text-sm text-gray-500">Tracking tahapan optimalisasi aset pipeline (Jalur A)</p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : pipelineAset.length === 0 ? (
          <EmptyState title="Tidak ada aset pipeline" description="Aset dengan status pipeline, prospek, atau negosiasi akan muncul di sini." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3">Aset</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Tahapan Aktif</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Target</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">PIC</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-center px-4 py-3 hidden md:table-cell">Prospek</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pipelineAset.map(aset => {
                const tahapan = getCurrentTahapan(aset.id)
                const prospekCount = (daftarProspek[aset.id] ?? []).filter(p => p.progress !== 'gagal').length
                const isLate = tahapan?.tgl_target && hitungSisaHari(tahapan.tgl_target) < 0

                return (
                  <tr key={aset.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{aset.nama_aset}</p>
                      <p className="text-xs font-mono text-gray-500">{aset.kode_aset}</p>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-700">
                      {tahapan ? tahapan.nama_tahapan : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {tahapan?.tgl_target ? (
                        <span className={isLate ? 'text-red-600 flex items-center gap-1' : 'text-gray-600'}>
                          {isLate && <AlertCircle size={12} />}
                          {formatTanggal(tahapan.tgl_target)}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                      {tahapan?.pic ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge type="aset" value={aset.status} />
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {prospekCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[#5B2C6F] font-medium">
                          <Users size={12} /> {prospekCount}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" className="gap-1 text-gray-600" onClick={() => openDetail(aset)}>
                        Detail <ChevronRight size={14} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Slide-over detail per aset */}
      <SlideOver open={detailOpen} onClose={() => setDetailOpen(false)} title={selectedAset?.nama_aset ?? ''} width="max-w-2xl">
        {selectedAset && (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded">{selectedAset.kode_aset}</span>
              <StatusBadge type="aset" value={selectedAset.status} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Tahapan Program</h3>
                <Button size="sm" variant="outline" onClick={openAddTL}><Plus size={13} /> Tahapan</Button>
              </div>
              <div className="space-y-2">
                {(daftarTahapan[selectedAset.id] ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada tahapan.</p>
                ) : (daftarTahapan[selectedAset.id] ?? []).map(tl => (
                  <div key={tl.id} className="border rounded-lg p-3 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-400">#{tl.urutan}</span>
                        <span className="text-sm font-medium">{tl.nama_tahapan}</span>
                        <StatusBadge type="timeline" value={tl.status} />
                      </div>
                      {tl.tgl_target && <p className="text-xs text-gray-500">Target: {formatTanggal(tl.tgl_target)}</p>}
                      {tl.tgl_realisasi && <p className="text-xs text-green-600">Realisasi: {formatTanggal(tl.tgl_realisasi)}</p>}
                      {tl.pic && <p className="text-xs text-gray-500">PIC: {tl.pic}</p>}
                      {tl.kendala && <p className="text-xs text-orange-600 mt-1">Kendala: {tl.kendala}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openEditTL(tl) }}>
                      <Pencil size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Prospek Mitra</h3>
                <Button size="sm" variant="outline" onClick={openAddProspek}><Plus size={13} /> Prospek</Button>
              </div>
              <div className="space-y-2">
                {(daftarProspek[selectedAset.id] ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada prospek mitra.</p>
                ) : (daftarProspek[selectedAset.id] ?? []).map(p => (
                  <div key={p.id} className="border rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{p.nama_calon_mitra}</p>
                        {p.kontak_pic && <p className="text-xs text-gray-500">PIC: {p.kontak_pic}</p>}
                        {p.no_telepon && <p className="text-xs text-gray-500">{p.no_telepon}</p>}
                        {p.tgl_pendekatan && <p className="text-xs text-gray-400">{formatTanggal(p.tgl_pendekatan)}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge type="prospek" value={p.progress} />
                        <Button variant="ghost" size="icon" onClick={() => openEditProspek(p)}><Pencil size={13} /></Button>
                      </div>
                    </div>
                    {p.catatan && <p className="text-xs text-gray-500 mt-2 border-t pt-2">{p.catatan}</p>}
                    {p.progress !== 'berhasil' && p.progress !== 'gagal' && (
                      <Button size="sm" className="mt-2 bg-[#117A65] text-white text-xs h-7" onClick={() => openConvert(p)}>
                        Berhasil — Buat Kerja Sama
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SlideOver>

      {/* Dialog tambah/edit tahapan */}
      <Dialog open={tlDialogOpen} onOpenChange={setTLDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editTL ? 'Edit Tahapan' : 'Tambah Tahapan'}</DialogTitle></DialogHeader>
          <form onSubmit={tlForm.handleSubmit(onSubmitTL)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nama Tahapan</Label>
                <Input list="tahapan-list" {...tlForm.register('nama_tahapan')} className="mt-1" />
                <datalist id="tahapan-list">
                  {TAHAPAN_BAKU.map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <Label>Urutan</Label>
                <Input type="number" {...tlForm.register('urutan')} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Target</Label>
                <Input type="date" {...tlForm.register('tgl_target')} className="mt-1" />
              </div>
              <div>
                <Label>Tanggal Realisasi</Label>
                <Input type="date" {...tlForm.register('tgl_realisasi')} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select defaultValue={editTL?.status ?? 'belum'} onValueChange={v => tlForm.setValue('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="belum">Belum</SelectItem>
                    <SelectItem value="proses">Proses</SelectItem>
                    <SelectItem value="selesai">Selesai</SelectItem>
                    <SelectItem value="terlambat">Terlambat</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>PIC</Label>
                <Input {...tlForm.register('pic')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Kendala</Label>
              <Textarea {...tlForm.register('kendala')} className="mt-1" rows={2} />
            </div>
            <div>
              <Label>Tindak Lanjut</Label>
              <Textarea {...tlForm.register('tindak_lanjut')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTLDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#117A65]">{editTL ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog tambah/edit prospek */}
      <Dialog open={prospekDialogOpen} onOpenChange={setProspekDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editProspek ? 'Edit Prospek Mitra' : 'Tambah Prospek Mitra'}</DialogTitle></DialogHeader>
          <form onSubmit={prospekForm.handleSubmit(onSubmitProspek)} className="space-y-4">
            <div>
              <Label>Nama Calon Mitra</Label>
              <Input {...prospekForm.register('nama_calon_mitra')} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kontak / PIC</Label>
                <Input {...prospekForm.register('kontak_pic')} className="mt-1" />
              </div>
              <div>
                <Label>No. Telepon</Label>
                <Input {...prospekForm.register('no_telepon')} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Pendekatan</Label>
                <Input type="date" {...prospekForm.register('tgl_pendekatan')} className="mt-1" />
              </div>
              <div>
                <Label>Progress</Label>
                <Select defaultValue={editProspek?.progress ?? 'identifikasi'} onValueChange={v => prospekForm.setValue('progress', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="identifikasi">Identifikasi</SelectItem>
                    <SelectItem value="penjajakan">Penjajakan</SelectItem>
                    <SelectItem value="penawaran">Penawaran</SelectItem>
                    <SelectItem value="negosiasi">Negosiasi</SelectItem>
                    <SelectItem value="gagal">Gagal</SelectItem>
                    <SelectItem value="berhasil">Berhasil</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Catatan</Label>
              <Textarea {...prospekForm.register('catatan')} className="mt-1" rows={3} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setProspekDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#117A65]">{editProspek ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog konversi ke KS */}
      <Dialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat Kerja Sama — {selectedProspek?.nama_calon_mitra}</DialogTitle></DialogHeader>
          <form onSubmit={ksForm.handleSubmit(onConvert)} className="space-y-4">
            <div>
              <Label>Nama Mitra</Label>
              <Input {...ksForm.register('nama_mitra')} className="mt-1" />
            </div>
            <div>
              <Label>No. Perjanjian</Label>
              <Input {...ksForm.register('no_perjanjian')} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Mulai</Label>
                <Input type="date" {...ksForm.register('tgl_mulai')} className="mt-1" />
              </div>
              <div>
                <Label>Tanggal Selesai</Label>
                <Input type="date" {...ksForm.register('tgl_selesai')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>No. WhatsApp Mitra (628xxx)</Label>
              <Input {...ksForm.register('no_wa_mitra')} className="mt-1" placeholder="628123456789" />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...ksForm.register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConvertDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#117A65]">Buat Kerja Sama</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
