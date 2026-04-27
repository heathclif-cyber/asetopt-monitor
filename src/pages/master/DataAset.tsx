import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { Aset, AsetStatus } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/common/StatusBadge'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatAngka } from '@/lib/utils'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const asetSchema = z.object({
  kode_aset: z.string().min(1, 'Kode wajib diisi'),
  nama_aset: z.string().min(1, 'Nama wajib diisi'),
  alamat: z.string().optional(),
  luas_tanah_m2: z.coerce.number().min(0).optional(),
  luas_bangunan_m2: z.coerce.number().min(0).optional(),
  status: z.string(),
  keterangan: z.string().optional(),
})

type AsetForm = z.infer<typeof asetSchema>

export function DataAset() {
  const { daftarAset, isLoading, fetchAset, addAset, updateAset, deleteAset } = useAsetStore()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('semua')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Aset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<AsetForm>({
    resolver: zodResolver(asetSchema),
    defaultValues: { status: 'pipeline' },
  })

  useEffect(() => { fetchAset() }, [])

  const filtered = daftarAset.filter(a => {
    const matchSearch = a.nama_aset.toLowerCase().includes(search.toLowerCase()) ||
      a.kode_aset.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'semua' || a.status === filterStatus
    return matchSearch && matchStatus
  })
  const totalPages = Math.ceil(filtered.length / pageSize)
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)

  const openAdd = () => {
    setEditTarget(null)
    reset({ status: 'pipeline', kode_aset: `AST-${String(daftarAset.length + 1).padStart(3, '0')}` })
    setDialogOpen(true)
  }

  const openEdit = (a: Aset) => {
    setEditTarget(a)
    reset({
      kode_aset: a.kode_aset,
      nama_aset: a.nama_aset,
      alamat: a.alamat ?? '',
      luas_tanah_m2: a.luas_tanah_m2 ?? undefined,
      luas_bangunan_m2: a.luas_bangunan_m2 ?? undefined,
      status: a.status,
      keterangan: a.keterangan ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: AsetForm) => {
    if (editTarget) {
      await updateAset(editTarget.id, data as Partial<Aset>)
    } else {
      await addAset(data as Omit<Aset, 'id' | 'created_at' | 'updated_at'>)
    }
    setDialogOpen(false)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Aset</h1>
          <p className="text-sm text-gray-500">{daftarAset.length} aset terdaftar</p>
        </div>
        <Button onClick={openAdd} className="bg-[#1B4F72] hover:bg-[#1B4F72]/90">
          <Plus size={16} /> Tambah Aset
        </Button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Cari nama / kode aset..." className="pl-9" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1) }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua Status</SelectItem>
            <SelectItem value="pipeline">Pipeline</SelectItem>
            <SelectItem value="prospek">Prospek</SelectItem>
            <SelectItem value="negosiasi">Negosiasi</SelectItem>
            <SelectItem value="aktif_ks">Aktif KS</SelectItem>
            <SelectItem value="selesai">Selesai</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Tidak ada aset" description="Tambahkan aset baru untuk mulai." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah Aset</Button>} />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3">Kode</th>
                <th className="text-left px-4 py-3">Nama Aset</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Alamat</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Luas Tanah (m²)</th>
                <th className="text-right px-4 py-3 hidden lg:table-cell">Luas Bgn (m²)</th>
                <th className="text-center px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paginated.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.kode_aset}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{a.nama_aset}</td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell max-w-[200px] truncate">{a.alamat ?? '-'}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{a.luas_tanah_m2 ? formatAngka(a.luas_tanah_m2) : '-'}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">{a.luas_bangunan_m2 ? formatAngka(a.luas_bangunan_m2) : '-'}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge type="aset" value={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                        <Pencil size={15} />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => setDeleteTarget(a.id)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} dari {filtered.length}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Aset' : 'Tambah Aset Baru'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kode Aset</Label>
                <Input {...register('kode_aset')} className="mt-1" />
                {errors.kode_aset && <p className="text-xs text-red-500 mt-1">{errors.kode_aset.message}</p>}
              </div>
              <div>
                <Label>Status</Label>
                <Select defaultValue={editTarget?.status ?? 'pipeline'} onValueChange={v => setValue('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pipeline">Pipeline</SelectItem>
                    <SelectItem value="prospek">Prospek</SelectItem>
                    <SelectItem value="negosiasi">Negosiasi</SelectItem>
                    <SelectItem value="aktif_ks">Aktif KS</SelectItem>
                    <SelectItem value="selesai">Selesai</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Nama Aset</Label>
              <Input {...register('nama_aset')} className="mt-1" />
              {errors.nama_aset && <p className="text-xs text-red-500 mt-1">{errors.nama_aset.message}</p>}
            </div>
            <div>
              <Label>Alamat</Label>
              <Textarea {...register('alamat')} className="mt-1" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Luas Tanah (m²)</Label>
                <Input type="number" step="0.01" {...register('luas_tanah_m2')} className="mt-1" />
              </div>
              <div>
                <Label>Luas Bangunan (m²)</Label>
                <Input type="number" step="0.01" {...register('luas_bangunan_m2')} className="mt-1" />
              </div>
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
        onOpenChange={open => !open && setDeleteTarget(null)}
        title="Hapus Aset"
        description="Apakah Anda yakin ingin menghapus aset ini? Semua data terkait akan ikut terhapus."
        onConfirm={() => deleteTarget && deleteAset(deleteTarget)}
        confirmLabel="Hapus"
        isDestructive
      />
    </div>
  )
}
