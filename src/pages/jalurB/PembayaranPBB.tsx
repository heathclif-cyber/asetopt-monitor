import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePBBStore } from '@/store/pbbStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { hitungPBBProporsional } from '@/utils/pbbUtils'
import { formatAngka, formatTanggal, formatRupiah } from '@/lib/utils'
import { Plus, Pencil } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PBB } from '@/types'

const pbbSchema = z.object({
  aset_id: z.string().min(1),
  tahun: z.coerce.number().min(2000),
  nilai_pbb: z.coerce.number().min(0),
  tgl_jatuh_tempo: z.string().optional(),
})

type PBBForm = z.infer<typeof pbbSchema>

export function PembayaranPBB() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { dataPBB, fetchAllPBB, addPBB, updatePBB } = usePBBStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PBB | null>(null)
  const [selectedKSId, setSelectedKSId] = useState<string>('')

  const { handleSubmit, reset, setValue, control, register } = useForm<PBBForm>({
    resolver: zodResolver(pbbSchema),
    defaultValues: { tahun: new Date().getFullYear() },
  })

  useEffect(() => { fetchAset(); fetchKS(); fetchAllPBB() }, [])

  const activeKS = daftarKS.filter(ks => ks.status === 'aktif' || ks.status === 'sp1' || ks.status === 'sp2' || ks.status === 'sp3')
  const selectedKS = activeKS.find(ks => ks.id === selectedKSId)

  const getPBBData = (asetId: string) => {
    return (dataPBB[asetId] ?? []).map(p => ({ tahun: p.tahun, nilaiPBB: p.nilai_pbb }))
  }

  const openAdd = () => {
    setEditTarget(null)
    reset({ tahun: new Date().getFullYear() })
    setDialogOpen(true)
  }

  const openEdit = (p: PBB) => {
    setEditTarget(p)
    reset({ aset_id: p.aset_id, tahun: p.tahun, nilai_pbb: p.nilai_pbb, tgl_jatuh_tempo: p.tgl_jatuh_tempo ?? '' })
    setDialogOpen(true)
  }

  const onSubmit = async (data: PBBForm) => {
    if (editTarget) {
      await updatePBB(editTarget.id, data as Partial<PBB>, data.aset_id)
    } else {
      await addPBB(data as Omit<PBB, 'id' | 'created_at' | 'aset'>)
    }
    setDialogOpen(false)
    fetchAllPBB()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pembayaran PBB</h1>
          <p className="text-sm text-gray-500">Monitoring PBB proporsional per kerja sama aktif</p>
        </div>
        <Button onClick={openAdd} className="bg-[#1B4F72]"><Plus size={16} /> Input PBB</Button>
      </div>

      <div className="flex items-center gap-3">
        <Label className="shrink-0">Pilih Kerja Sama:</Label>
        <Select value={selectedKSId} onValueChange={setSelectedKSId}>
          <SelectTrigger className="max-w-sm">
            <SelectValue placeholder="Pilih kerja sama..." />
          </SelectTrigger>
          <SelectContent>
            {activeKS.map(ks => (
              <SelectItem key={ks.id} value={ks.id}>
                {(ks.aset as any)?.nama_aset ?? '-'} — {ks.nama_mitra}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedKSId ? (
        <EmptyState title="Pilih kerja sama" description="Pilih kerja sama aktif dari dropdown untuk melihat kalkulasi PBB proporsional." />
      ) : selectedKS && (
        <>
          {(() => {
            const pbbData = getPBBData(selectedKS.aset_id)
            const hasil = hitungPBBProporsional({
              tglMulaiKS: selectedKS.tgl_mulai,
              tglSelesaiKS: selectedKS.tgl_selesai,
              dataPBB: pbbData,
            })
            return (
              <div className="space-y-4">
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Kalkulasi PBB Proporsional — KS: {formatTanggal(selectedKS.tgl_mulai)} s/d {formatTanggal(selectedKS.tgl_selesai)}
                  </h3>
                  {hasil.detail.length === 0 ? (
                    <p className="text-sm text-gray-500">Belum ada data PBB untuk aset ini. <Button variant="link" size="sm" className="p-0 h-auto" onClick={openAdd}>Input PBB sekarang</Button></p>
                  ) : (
                    <>
                      <table className="w-full text-sm mb-4">
                        <thead>
                          <tr className="border-b text-xs text-gray-500 uppercase">
                            <th className="text-left pb-2">Tahun</th>
                            <th className="text-right pb-2">Nilai PBB</th>
                            <th className="text-right pb-2">Hari KS</th>
                            <th className="text-right pb-2">Hari dlm Tahun</th>
                            <th className="text-right pb-2">Proporsi</th>
                            <th className="text-right pb-2">PBB Ditanggung</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {hasil.detail.map(r => (
                            <tr key={r.tahun} className="text-sm">
                              <td className="py-2">{r.tahun}</td>
                              <td className="py-2 text-right"><CurrencyDisplay value={r.nilaiPBB} size="sm" /></td>
                              <td className="py-2 text-right">{formatAngka(r.hariKS)}</td>
                              <td className="py-2 text-right">{formatAngka(r.hariDalamTahun)}</td>
                              <td className="py-2 text-right">{(r.proporsi * 100).toFixed(2)}%</td>
                              <td className="py-2 text-right font-semibold text-[#1B4F72]">
                                <CurrencyDisplay value={r.pbbProporsional} size="sm" />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t font-bold">
                            <td colSpan={5} className="pt-2 text-sm">Total PBB Ditanggung Mitra</td>
                            <td className="pt-2 text-right text-[#1B4F72]">
                              <CurrencyDisplay value={hasil.totalPBBDitanggung} size="sm" />
                            </td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm font-mono text-blue-800">
                        {hasil.detail.map(r => (
                          <div key={r.tahun}>
                            PBB {r.tahun}: {formatRupiah(r.nilaiPBB)} × ({formatAngka(r.hariKS)}/{formatAngka(r.hariDalamTahun)}) = <strong>{formatRupiah(r.pbbProporsional)}</strong>
                          </div>
                        ))}
                        <div className="border-t mt-2 pt-2">
                          Total PBB ditanggung mitra: <strong>{formatRupiah(hasil.totalPBBDitanggung)}</strong>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Input PBB untuk aset ini */}
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-sm font-semibold">Data PBB — {(selectedKS.aset as any)?.nama_aset}</h3>
                    <Button size="sm" variant="outline" onClick={openAdd}><Plus size={13} /> Input PBB</Button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                        <th className="text-left px-4 py-2">Tahun</th>
                        <th className="text-right px-4 py-2">Nilai PBB</th>
                        <th className="text-left px-4 py-2">Jatuh Tempo</th>
                        <th className="text-right px-4 py-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(dataPBB[selectedKS.aset_id] ?? []).map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{p.tahun}</td>
                          <td className="px-4 py-2 text-right"><CurrencyDisplay value={p.nilai_pbb} size="sm" /></td>
                          <td className="px-4 py-2 text-gray-500">{p.tgl_jatuh_tempo ? formatTanggal(p.tgl_jatuh_tempo) : '-'}</td>
                          <td className="px-4 py-2 text-right">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil size={14} /></Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Data PBB' : 'Input Data PBB'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Aset</Label>
              <Select defaultValue={editTarget?.aset_id ?? selectedKS?.aset_id} onValueChange={v => setValue('aset_id', v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih aset..." /></SelectTrigger>
                <SelectContent>
                  {daftarAset.map(a => <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tahun Pajak</Label>
              <Input type="number" {...register('tahun')} className="mt-1" />
            </div>
            <div>
              <Label>Nilai PBB (Rp)</Label>
              <Controller control={control} name="nilai_pbb" render={({ field }) => (
                <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
              )} />
            </div>
            <div>
              <Label>Tanggal Jatuh Tempo PBB</Label>
              <Input type="date" {...register('tgl_jatuh_tempo')} className="mt-1" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-[#1B4F72]">{editTarget ? 'Simpan' : 'Input'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
