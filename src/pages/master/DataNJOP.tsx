import { useEffect, useState, useMemo } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useNJOPStore } from '@/store/njopStore'
import { NJOP } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import { formatRupiah } from '@/lib/utils'
import { Plus, Pencil, Trash2, TrendingUp } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

const njopSchema = z.object({
  aset_id: z.string().min(1, 'Pilih aset'),
  tahun: z.coerce.number().min(2000).max(2099),
  nilai_tanah_per_m2: z.coerce.number().min(0),
  nilai_bangunan_per_m2: z.coerce.number().min(0).default(0),
  sumber: z.string().optional(),
})

type NJOPForm = z.infer<typeof njopSchema>

export function DataNJOP() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { dataNJOP, fetchNJOP, fetchAllNJOP, addNJOP, updateNJOP, deleteNJOP } = useNJOPStore()
  const [selectedAsetId, setSelectedAsetId] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<NJOP | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; asetId: string } | null>(null)

  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm<NJOPForm>({
    resolver: zodResolver(njopSchema),
    defaultValues: { tahun: new Date().getFullYear(), nilai_bangunan_per_m2: 0 },
  })

  const watchedAsetId = watch('aset_id')
  const watchedTanah = watch('nilai_tanah_per_m2')
  const watchedBangunan = watch('nilai_bangunan_per_m2')

  useEffect(() => { fetchAset(); fetchAllNJOP() }, [])
  useEffect(() => { if (selectedAsetId) fetchNJOP(selectedAsetId) }, [selectedAsetId])

  const selectedAset = daftarAset.find(a => a.id === selectedAsetId)
  const njopList = dataNJOP[selectedAsetId] ?? []

  const chartData = useMemo(() => {
    return [...njopList]
      .sort((a, b) => a.tahun - b.tahun)
      .map(n => ({
        tahun: n.tahun.toString(),
        tanah: n.nilai_tanah_per_m2,
        bangunan: n.nilai_bangunan_per_m2,
      }))
  }, [njopList])

  const previewPotensi = useMemo(() => {
    if (!watchedAsetId || !watchedTanah) return null
    const aset = daftarAset.find(a => a.id === watchedAsetId)
    if (!aset) return null
    return hitungPotensiNJOP({
      njopTanahPerM2: watchedTanah ?? 0,
      luasTanahM2: aset.luas_tanah_m2 ?? 0,
      njopBangunanPerM2: watchedBangunan ?? 0,
      luasBangunanM2: aset.luas_bangunan_m2 ?? 0,
    })
  }, [watchedAsetId, watchedTanah, watchedBangunan, daftarAset])

  const openAdd = () => {
    setEditTarget(null)
    reset({ tahun: new Date().getFullYear(), aset_id: selectedAsetId, nilai_bangunan_per_m2: 0 })
    setDialogOpen(true)
  }

  const openEdit = (n: NJOP) => {
    setEditTarget(n)
    reset({
      aset_id: n.aset_id,
      tahun: n.tahun,
      nilai_tanah_per_m2: n.nilai_tanah_per_m2,
      nilai_bangunan_per_m2: n.nilai_bangunan_per_m2,
      sumber: n.sumber ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: NJOPForm) => {
    if (editTarget) {
      await updateNJOP(editTarget.id, data)
    } else {
      await addNJOP(data as Omit<NJOP, 'id' | 'created_at'>)
    }
    setDialogOpen(false)
    fetchAllNJOP()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data NJOP</h1>
          <p className="text-sm text-gray-500">Input dan tren nilai NJOP per aset per tahun</p>
        </div>
        <Button onClick={openAdd} className="bg-[#1B4F72]" disabled={!selectedAsetId}>
          <Plus size={16} /> Tambah NJOP
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">Pilih Aset:</Label>
        <Select value={selectedAsetId} onValueChange={setSelectedAsetId}>
          <SelectTrigger className="max-w-xs">
            <SelectValue placeholder="Pilih aset..." />
          </SelectTrigger>
          <SelectContent>
            {daftarAset.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedAsetId ? (
        <EmptyState title="Pilih aset terlebih dahulu" description="Pilih aset dari dropdown di atas untuk melihat data NJOP." />
      ) : (
        <>
          {chartData.length > 1 && (
            <div className="bg-white rounded-xl border p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <TrendingUp size={15} /> Tren NJOP — {selectedAset?.nama_aset}
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="tahun" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatRupiah(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="tanah" name="Tanah/m²" stroke="#117A65" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="bangunan" name="Bangunan/m²" stroke="#1B4F72" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                  <th className="text-left px-4 py-3">Tahun</th>
                  <th className="text-right px-4 py-3">Nilai Tanah/m²</th>
                  <th className="text-right px-4 py-3">Nilai Bangunan/m²</th>
                  <th className="text-right px-4 py-3">Potensi Total</th>
                  <th className="text-left px-4 py-3">Sumber</th>
                  <th className="text-right px-4 py-3">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {njopList.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">Belum ada data NJOP untuk aset ini</td></tr>
                ) : njopList.map(n => {
                  const pot = hitungPotensiNJOP({
                    njopTanahPerM2: n.nilai_tanah_per_m2,
                    luasTanahM2: selectedAset?.luas_tanah_m2 ?? 0,
                    njopBangunanPerM2: n.nilai_bangunan_per_m2,
                    luasBangunanM2: selectedAset?.luas_bangunan_m2 ?? 0,
                  })
                  return (
                    <tr key={n.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{n.tahun}</td>
                      <td className="px-4 py-3 text-right"><CurrencyDisplay value={n.nilai_tanah_per_m2} size="sm" /></td>
                      <td className="px-4 py-3 text-right"><CurrencyDisplay value={n.nilai_bangunan_per_m2} size="sm" /></td>
                      <td className="px-4 py-3 text-right font-semibold text-[#117A65]"><CurrencyDisplay value={pot.totalPotensi} size="sm" /></td>
                      <td className="px-4 py-3 text-gray-500">{n.sumber ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(n)}><Pencil size={14} /></Button>
                          <Button variant="ghost" size="icon" className="text-red-500" onClick={() => setDeleteTarget({ id: n.id, asetId: n.aset_id })}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit NJOP' : 'Tambah Data NJOP'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Aset</Label>
              <Select defaultValue={editTarget?.aset_id ?? selectedAsetId} onValueChange={v => setValue('aset_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih aset..." /></SelectTrigger>
                <SelectContent>
                  {daftarAset.map(a => <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.aset_id && <p className="text-xs text-red-500 mt-1">{errors.aset_id.message}</p>}
            </div>
            <div>
              <Label>Tahun</Label>
              <Input type="number" {...register('tahun')} className="mt-1" />
            </div>
            <div>
              <Label>Nilai Tanah per m² (Rp)</Label>
              <Controller control={control} name="nilai_tanah_per_m2" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Nilai Bangunan per m² (Rp)</Label>
              <Controller control={control} name="nilai_bangunan_per_m2" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Sumber Data</Label>
              <Input {...register('sumber')} className="mt-1" placeholder="cth: SPPT 2025, SK Kepala Daerah" />
            </div>

            {previewPotensi && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-1">
                <p className="font-semibold text-green-800 mb-2">Preview Potensi Pendapatan:</p>
                <p className="text-green-700">Tanah: {formatRupiah(previewPotensi.potensiTanah)}</p>
                <p className="text-green-700">Bangunan: {formatRupiah(previewPotensi.potensiBangunan)}</p>
                <p className="font-bold text-green-800">Total: {formatRupiah(previewPotensi.totalPotensi)}</p>
              </div>
            )}

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
        title="Hapus Data NJOP"
        description="Apakah Anda yakin ingin menghapus data NJOP ini?"
        onConfirm={() => deleteTarget && deleteNJOP(deleteTarget.id, deleteTarget.asetId)}
        confirmLabel="Hapus"
        isDestructive
      />
    </div>
  )
}
