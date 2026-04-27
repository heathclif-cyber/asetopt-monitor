import { useEffect, useState } from 'react'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useAsetStore } from '@/store/asetStore'
import { KerjaSama as KSType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, hitungSisaHari } from '@/lib/utils'
import { Plus, Pencil, AlertCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'

const ksSchema = z.object({
  aset_id: z.string().min(1),
  nama_mitra: z.string().min(1),
  no_perjanjian: z.string().optional(),
  tgl_mulai: z.string().min(1),
  tgl_selesai: z.string().min(1),
  no_wa_mitra: z.string().optional(),
  keterangan: z.string().optional(),
})

type KSForm = z.infer<typeof ksSchema>

export function KerjaSama() {
  const { daftarKS, isLoading, fetchKS, addKS, updateKS } = useKerjaSamaStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<KSType | null>(null)

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<KSForm>({
    resolver: zodResolver(ksSchema),
  })

  useEffect(() => { fetchKS(); fetchAset() }, [])

  const openAdd = () => {
    setEditTarget(null)
    reset()
    setDialogOpen(true)
  }

  const openEdit = (ks: KSType) => {
    setEditTarget(ks)
    reset({
      aset_id: ks.aset_id,
      nama_mitra: ks.nama_mitra,
      no_perjanjian: ks.no_perjanjian ?? '',
      tgl_mulai: ks.tgl_mulai,
      tgl_selesai: ks.tgl_selesai,
      no_wa_mitra: ks.no_wa_mitra ?? '',
      keterangan: ks.keterangan ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: KSForm) => {
    if (editTarget) {
      await updateKS(editTarget.id, data)
    } else {
      await addKS({ ...data, status: 'aktif', prospek_id: null } as any)
    }
    setDialogOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kerja Sama Aktif</h1>
          <p className="text-sm text-gray-500">{daftarKS.length} kerja sama terdaftar (Jalur B)</p>
        </div>
        <Button onClick={openAdd} className="bg-[#5B2C6F] hover:bg-[#5B2C6F]/90">
          <Plus size={16} /> Tambah KS
        </Button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : daftarKS.length === 0 ? (
          <EmptyState title="Belum ada kerja sama" description="Tambahkan kerja sama baru atau konversi dari prospek mitra di Jalur A." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah KS</Button>} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3">Aset</th>
                <th className="text-left px-4 py-3">Mitra</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">No. Perjanjian</th>
                <th className="text-left px-4 py-3 hidden lg:table-cell">Periode</th>
                <th className="text-right px-4 py-3">Sisa Hari</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {daftarKS.map(ks => {
                const sisaHari = hitungSisaHari(ks.tgl_selesai)
                return (
                  <tr key={ks.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium">{(ks.aset as any)?.nama_aset ?? '-'}</div>
                      <div className="text-xs text-gray-500">{(ks.aset as any)?.kode_aset}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{ks.nama_mitra}</div>
                      {ks.no_wa_mitra && <div className="text-xs text-gray-500">{ks.no_wa_mitra}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{ks.no_perjanjian ?? '-'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-gray-600">
                      {formatTanggal(ks.tgl_mulai)} – {formatTanggal(ks.tgl_selesai)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold text-sm ${sisaHari < 90 ? 'text-orange-600' : 'text-gray-700'}`}>
                        {sisaHari > 0 ? `${sisaHari} hari` : 'Berakhir'}
                      </span>
                      {sisaHari < 90 && sisaHari > 0 && <AlertCircle size={12} className="inline ml-1 text-orange-500" />}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge type="ks" value={ks.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/jalur-b/kerja-sama/${ks.id}`}>Detail</Link>
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(ks)}>
                          <Pencil size={15} />
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
            <DialogTitle>{editTarget ? 'Edit Kerja Sama' : 'Tambah Kerja Sama Baru'}</DialogTitle>
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
            <div>
              <Label>Nama Mitra</Label>
              <Input {...register('nama_mitra')} className="mt-1" />
              {errors.nama_mitra && <p className="text-xs text-red-500 mt-1">{errors.nama_mitra.message}</p>}
            </div>
            <div>
              <Label>No. Perjanjian</Label>
              <Input {...register('no_perjanjian')} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tanggal Mulai</Label>
                <Input type="date" {...register('tgl_mulai')} className="mt-1" />
              </div>
              <div>
                <Label>Tanggal Selesai</Label>
                <Input type="date" {...register('tgl_selesai')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>No. WhatsApp Mitra (628xxx)</Label>
              <Input {...register('no_wa_mitra')} className="mt-1" placeholder="628123456789" />
            </div>
            <div>
              <Label>Keterangan</Label>
              <Textarea {...register('keterangan')} className="mt-1" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#5B2C6F]">{editTarget ? 'Simpan' : 'Tambah'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
