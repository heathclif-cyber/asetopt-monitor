import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKJPPStore } from '@/store/kjppStore'
import { PenilaianKJPP as PKType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { formatTanggal } from '@/lib/utils'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

const kjppSchema = z.object({
  aset_id: z.string().min(1),
  tgl_penilaian: z.string().min(1),
  nama_kjpp: z.string().optional(),
  no_laporan: z.string().optional(),
  nilai_tanah: z.coerce.number().min(0),
  nilai_bangunan: z.coerce.number().min(0).default(0),
  berlaku_hingga: z.string().optional(),
  keterangan: z.string().optional(),
})

type KJPPForm = z.infer<typeof kjppSchema>

function getKJPPStatus(berlakuHingga: string | null): { label: string; variant: string } {
  if (!berlakuHingga) return { label: 'Tersedia', variant: 'success' }
  const today = new Date()
  const batas = new Date(berlakuHingga)
  const diff = (batas.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  if (diff < 0) return { label: 'Kadaluarsa', variant: 'warning' }
  if (diff < 90) return { label: 'Akan Kadaluarsa', variant: 'sp1' }
  return { label: 'Tersedia', variant: 'success' }
}

export function PenilaianKJPP() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { dataPenilaian, fetchAllKJPP, addKJPP, updateKJPP, deleteKJPP } = useKJPPStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PKType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; asetId: string } | null>(null)

  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm<KJPPForm>({
    resolver: zodResolver(kjppSchema),
    defaultValues: { nilai_bangunan: 0 },
  })

  useEffect(() => { fetchAset(); fetchAllKJPP() }, [])

  const allKJPP = Object.values(dataPenilaian).flat()

  const openAdd = () => {
    setEditTarget(null)
    reset({ nilai_bangunan: 0 })
    setDialogOpen(true)
  }

  const openEdit = (k: PKType) => {
    setEditTarget(k)
    reset({
      aset_id: k.aset_id,
      tgl_penilaian: k.tgl_penilaian,
      nama_kjpp: k.nama_kjpp ?? '',
      no_laporan: k.no_laporan ?? '',
      nilai_tanah: k.nilai_tanah,
      nilai_bangunan: k.nilai_bangunan,
      berlaku_hingga: k.berlaku_hingga ?? '',
      keterangan: k.keterangan ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: KJPPForm) => {
    if (editTarget) {
      await updateKJPP(editTarget.id, data as Partial<PKType>)
    } else {
      await addKJPP(data as Omit<PKType, 'id' | 'total_nilai' | 'created_at'>)
    }
    setDialogOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Penilaian KJPP</h1>
          <p className="text-sm text-gray-500">{allKJPP.length} penilaian terdaftar</p>
        </div>
        <Button onClick={openAdd} className="bg-[#1B4F72]">
          <Plus size={16} /> Tambah Penilaian
        </Button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {allKJPP.length === 0 ? (
          <EmptyState title="Belum ada penilaian KJPP" description="Tambahkan penilaian KJPP untuk aset yang sudah dinilai." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah</Button>} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3">Aset</th>
                <th className="text-left px-4 py-3">KJPP</th>
                <th className="text-left px-4 py-3">Tgl Penilaian</th>
                <th className="text-right px-4 py-3">Nilai Tanah</th>
                <th className="text-right px-4 py-3">Nilai Bangunan</th>
                <th className="text-right px-4 py-3">Total Nilai</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {allKJPP.map(k => {
                const aset = daftarAset.find(a => a.id === k.aset_id)
                const status = getKJPPStatus(k.berlaku_hingga)
                return (
                  <tr key={k.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{aset?.nama_aset ?? '-'}</div>
                      <div className="text-xs text-gray-500">{aset?.kode_aset}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{k.nama_kjpp ?? '-'}</div>
                      <div className="text-xs text-gray-500">{k.no_laporan ?? '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatTanggal(k.tgl_penilaian)}</td>
                    <td className="px-4 py-3 text-right"><CurrencyDisplay value={k.nilai_tanah} size="sm" /></td>
                    <td className="px-4 py-3 text-right"><CurrencyDisplay value={k.nilai_bangunan} size="sm" /></td>
                    <td className="px-4 py-3 text-right font-semibold"><CurrencyDisplay value={k.total_nilai} size="sm" /></td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={status.variant as any}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(k)}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" className="text-red-500" onClick={() => setDeleteTarget({ id: k.id, asetId: k.aset_id })}>
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Penilaian KJPP' : 'Tambah Penilaian KJPP'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Aset</Label>
              <Select defaultValue={editTarget?.aset_id} onValueChange={v => setValue('aset_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih aset..." /></SelectTrigger>
                <SelectContent>
                  {daftarAset.map(a => <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.aset_id && <p className="text-xs text-red-500 mt-1">Pilih aset terlebih dahulu</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Penilaian</Label>
                <Input type="date" {...register('tgl_penilaian')} className="mt-1" />
              </div>
              <div>
                <Label>Berlaku Hingga</Label>
                <Input type="date" {...register('berlaku_hingga')} className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nama KJPP</Label>
                <Input {...register('nama_kjpp')} className="mt-1" />
              </div>
              <div>
                <Label>No. Laporan</Label>
                <Input {...register('no_laporan')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Nilai Tanah (Rp)</Label>
              <Controller control={control} name="nilai_tanah" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Nilai Bangunan (Rp)</Label>
              <Controller control={control} name="nilai_bangunan" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#1B4F72]">{editTarget ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => !o && setDeleteTarget(null)}
        title="Hapus Penilaian KJPP"
        description="Apakah Anda yakin ingin menghapus data penilaian ini?"
        onConfirm={() => deleteTarget && deleteKJPP(deleteTarget.id, deleteTarget.asetId)}
        confirmLabel="Hapus"
        isDestructive
      />
    </div>
  )
}
