import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePBBStore } from '@/store/pbbStore'
import { useNJOPStore } from '@/store/njopStore'
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
import { useForm, Controller, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PBB } from '@/types'

const pbbSchema = z.object({
  aset_id: z.string().min(1),
  tahun: z.coerce.number().min(2000),
  nilai_pbb: z.coerce.number().min(0),
  tgl_jatuh_tempo: z.string().optional(),
  // Objek Bumi
  luas_tanah_sppt: z.coerce.number().min(0).default(0),
  luas_tanah_ks: z.coerce.number().min(0).default(0),
  njop_tanah_per_m2: z.coerce.number().min(0).default(0),
  // Objek Bangunan
  luas_bangunan_sppt: z.coerce.number().min(0).default(0),
  luas_bangunan_ks: z.coerce.number().min(0).default(0),
  njop_bangunan_per_m2: z.coerce.number().min(0).default(0),
  // Pembayaran PBB
  tgl_bayar_pbb: z.string().optional(),
  jumlah_pbb_dibayar: z.coerce.number().min(0).optional(),
})

type PBBForm = z.infer<typeof pbbSchema>

function NJOPPreview({ control }: { control: any }) {
  const vals = useWatch({ control })

  const njopTanahSppt    = (vals.luas_tanah_sppt    || 0) * (vals.njop_tanah_per_m2    || 0)
  const njopBangunanSppt = (vals.luas_bangunan_sppt  || 0) * (vals.njop_bangunan_per_m2 || 0)
  const njopSppt         = njopTanahSppt + njopBangunanSppt

  const njopTanahKS    = (vals.luas_tanah_ks    || 0) * (vals.njop_tanah_per_m2    || 0)
  const njopBangunanKS = (vals.luas_bangunan_ks  || 0) * (vals.njop_bangunan_per_m2 || 0)
  const njopKS         = njopTanahKS + njopBangunanKS

  const proporsiArea = njopSppt > 0 ? (njopKS / njopSppt) * 100 : null

  if (njopSppt === 0 && njopKS === 0) return null

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm space-y-1">
      <p className="font-semibold text-blue-800 text-xs uppercase tracking-wide mb-2">Preview NJOP</p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-900">
        <span>NJOP Tanah SPPT:</span>    <span className="text-right font-mono">{formatRupiah(njopTanahSppt)}</span>
        <span>NJOP Bangunan SPPT:</span> <span className="text-right font-mono">{formatRupiah(njopBangunanSppt)}</span>
        <span className="font-semibold">Total NJOP SPPT:</span> <span className="text-right font-mono font-semibold">{formatRupiah(njopSppt)}</span>
        <span>NJOP Tanah KS:</span>    <span className="text-right font-mono">{formatRupiah(njopTanahKS)}</span>
        <span>NJOP Bangunan KS:</span> <span className="text-right font-mono">{formatRupiah(njopBangunanKS)}</span>
        <span className="font-semibold">Total NJOP KS:</span> <span className="text-right font-mono font-semibold">{formatRupiah(njopKS)}</span>
      </div>
      {proporsiArea !== null && (
        <div className="mt-2 pt-2 border-t border-blue-200 flex items-center justify-between">
          <span className="text-xs text-blue-800 font-semibold">Proporsi Luasan:</span>
          <span className="text-sm font-bold text-blue-700">{proporsiArea.toFixed(2)}%</span>
        </div>
      )}
    </div>
  )
}

export function PembayaranPBB() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { dataPBB, fetchAllPBB, addPBB, updatePBB } = usePBBStore()
  const { dataNJOP, fetchAllNJOP } = useNJOPStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PBB | null>(null)
  const [selectedKSId, setSelectedKSId] = useState<string>('')
  const [njopAutoFilled, setNjopAutoFilled] = useState<{ tahun: number } | null>(null)

  const { handleSubmit, reset, setValue, control, register, watch } = useForm<PBBForm>({
    resolver: zodResolver(pbbSchema),
    defaultValues: {
      tahun: new Date().getFullYear(),
      luas_tanah_sppt: 0, luas_tanah_ks: 0, njop_tanah_per_m2: 0,
      luas_bangunan_sppt: 0, luas_bangunan_ks: 0, njop_bangunan_per_m2: 0,
    },
  })

  const watchedAsetId = watch('aset_id')
  const watchedTahun  = watch('tahun')

  useEffect(() => { fetchAset(); fetchKS(); fetchAllPBB(); fetchAllNJOP() }, [])

  useEffect(() => {
    if (editTarget || !watchedAsetId || !watchedTahun) return
    const njopList = dataNJOP[watchedAsetId]
    if (!njopList || njopList.length === 0) return
    const found = njopList.find(n => n.tahun === Number(watchedTahun)) ?? njopList[0]
    if (found) {
      setValue('njop_tanah_per_m2', found.nilai_tanah_per_m2)
      setValue('njop_bangunan_per_m2', found.nilai_bangunan_per_m2)
      setNjopAutoFilled({ tahun: found.tahun })
    }
  }, [watchedAsetId, watchedTahun])

  const activeKS = daftarKS.filter(ks =>
    ['aktif', 'sp1', 'sp2', 'sp3'].includes(ks.status)
  )
  const selectedKS = activeKS.find(ks => ks.id === selectedKSId)

  const getPBBData = (asetId: string) =>
    (dataPBB[asetId] ?? []).map(p => ({
      tahun: p.tahun,
      nilaiPBB: p.nilai_pbb,
      luas_tanah_sppt: p.luas_tanah_sppt,
      luas_tanah_ks: p.luas_tanah_ks,
      njop_tanah_per_m2: p.njop_tanah_per_m2,
      luas_bangunan_sppt: p.luas_bangunan_sppt,
      luas_bangunan_ks: p.luas_bangunan_ks,
      njop_bangunan_per_m2: p.njop_bangunan_per_m2,
    }))

  const defaultFormValues = (asetId?: string): PBBForm => ({
    aset_id: asetId ?? '',
    tahun: new Date().getFullYear(),
    nilai_pbb: 0,
    tgl_jatuh_tempo: '',
    luas_tanah_sppt: 0, luas_tanah_ks: 0, njop_tanah_per_m2: 0,
    luas_bangunan_sppt: 0, luas_bangunan_ks: 0, njop_bangunan_per_m2: 0,
    tgl_bayar_pbb: '', jumlah_pbb_dibayar: 0,
  })

  const openAdd = () => {
    setEditTarget(null)
    setNjopAutoFilled(null)
    reset(defaultFormValues(selectedKS?.aset_id))
    setDialogOpen(true)
  }

  const openEdit = (p: PBB) => {
    setEditTarget(p)
    setNjopAutoFilled(null)
    reset({
      aset_id: p.aset_id,
      tahun: p.tahun,
      nilai_pbb: p.nilai_pbb,
      tgl_jatuh_tempo: p.tgl_jatuh_tempo ?? '',
      luas_tanah_sppt:    p.luas_tanah_sppt    ?? 0,
      luas_tanah_ks:      p.luas_tanah_ks      ?? 0,
      njop_tanah_per_m2:  p.njop_tanah_per_m2  ?? 0,
      luas_bangunan_sppt:   p.luas_bangunan_sppt   ?? 0,
      luas_bangunan_ks:     p.luas_bangunan_ks     ?? 0,
      njop_bangunan_per_m2: p.njop_bangunan_per_m2 ?? 0,
      tgl_bayar_pbb:      p.tgl_bayar_pbb      ?? '',
      jumlah_pbb_dibayar: p.jumlah_pbb_dibayar ?? 0,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: PBBForm) => {
    const jumlahDibayar = data.jumlah_pbb_dibayar ?? 0
    const status_bayar =
      jumlahDibayar >= data.nilai_pbb && data.tgl_bayar_pbb
        ? 'lunas'
        : jumlahDibayar > 0
        ? 'sebagian'
        : 'belum_bayar'

    const submitData = {
      ...data,
      tgl_bayar_pbb:      data.tgl_bayar_pbb      || null,
      jumlah_pbb_dibayar: jumlahDibayar > 0 ? jumlahDibayar : null,
      status_bayar,
    }

    if (editTarget) {
      await updatePBB(editTarget.id, submitData as Partial<PBB>, data.aset_id)
    } else {
      await addPBB(submitData as Omit<PBB, 'id' | 'created_at' | 'aset'>)
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
            const pbbData  = getPBBData(selectedKS.aset_id)
            const hasil    = hitungPBBProporsional({
              tglMulaiKS:   selectedKS.tgl_mulai,
              tglSelesaiKS: selectedKS.tgl_selesai,
              dataPBB: pbbData,
            })
            const anyArea  = hasil.detail.some(r => r.hasAreaData)

            return (
              <div className="space-y-4">
                {/* Kalkulasi PBB Proporsional */}
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">
                    Kalkulasi PBB Proporsional — KS: {formatTanggal(selectedKS.tgl_mulai)} s/d {formatTanggal(selectedKS.tgl_selesai)}
                  </h3>

                  {hasil.detail.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      Belum ada data PBB untuk aset ini.{' '}
                      <Button variant="link" size="sm" className="p-0 h-auto" onClick={openAdd}>
                        Input PBB sekarang
                      </Button>
                    </p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm mb-4 min-w-[600px]">
                          <thead>
                            <tr className="border-b text-xs text-gray-500 uppercase">
                              <th className="text-left pb-2">Tahun</th>
                              <th className="text-right pb-2">Nilai PBB</th>
                              {anyArea && (
                                <>
                                  <th className="text-right pb-2">NJOP SPPT</th>
                                  <th className="text-right pb-2">NJOP KS</th>
                                  <th className="text-right pb-2">Prop. Luasan</th>
                                </>
                              )}
                              <th className="text-right pb-2">Hari KS</th>
                              <th className="text-right pb-2">Hari Tahun</th>
                              <th className="text-right pb-2">Prop. Waktu</th>
                              <th className="text-right pb-2">PBB Ditanggung</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {hasil.detail.map(r => (
                              <tr key={r.tahun} className="text-sm">
                                <td className="py-2">{r.tahun}</td>
                                <td className="py-2 text-right"><CurrencyDisplay value={r.nilaiPBB} size="sm" /></td>
                                {anyArea && (
                                  <>
                                    <td className="py-2 text-right text-gray-600">
                                      {r.hasAreaData ? <CurrencyDisplay value={r.njopSppt} size="sm" /> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="py-2 text-right text-gray-600">
                                      {r.hasAreaData ? <CurrencyDisplay value={r.njopKS} size="sm" /> : <span className="text-gray-400">—</span>}
                                    </td>
                                    <td className="py-2 text-right">
                                      {r.hasAreaData
                                        ? <span className="text-orange-600 font-medium">{(r.proporsiArea * 100).toFixed(2)}%</span>
                                        : <span className="text-gray-400 text-xs">tdk ada data</span>}
                                    </td>
                                  </>
                                )}
                                <td className="py-2 text-right">{formatAngka(r.hariKS)}</td>
                                <td className="py-2 text-right">{formatAngka(r.hariDalamTahun)}</td>
                                <td className="py-2 text-right text-orange-600 font-medium">
                                  {(r.proporsiWaktu * 100).toFixed(2)}%
                                </td>
                                <td className="py-2 text-right font-semibold text-[#1B4F72]">
                                  <CurrencyDisplay value={r.pbbProporsional} size="sm" />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t font-bold">
                              <td colSpan={anyArea ? 8 : 5} className="pt-2 text-sm">Total PBB Ditanggung Mitra</td>
                              <td className="pt-2 text-right text-[#1B4F72]">
                                <CurrencyDisplay value={hasil.totalPBBDitanggung} size="sm" />
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm font-mono text-blue-800 space-y-1">
                        {hasil.detail.map(r => (
                          <div key={r.tahun}>
                            PBB {r.tahun}: {formatRupiah(r.nilaiPBB)}
                            {r.hasAreaData && (
                              <> × <span className="text-orange-700">({formatRupiah(r.njopKS)}/{formatRupiah(r.njopSppt)} luasan)</span></>
                            )}
                            {' '}× <span className="text-orange-700">({formatAngka(r.hariKS)}/{formatAngka(r.hariDalamTahun)} hari)</span>
                            {' '}= <strong>{formatRupiah(r.pbbProporsional)}</strong>
                          </div>
                        ))}
                        <div className="border-t border-blue-200 mt-2 pt-2">
                          Total PBB ditanggung mitra: <strong>{formatRupiah(hasil.totalPBBDitanggung)}</strong>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Tabel Data PBB per Tahun */}
                <div className="bg-white rounded-xl border overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b">
                    <h3 className="text-sm font-semibold">Data PBB — {(selectedKS.aset as any)?.nama_aset}</h3>
                    <Button size="sm" variant="outline" onClick={openAdd}><Plus size={13} /> Input PBB</Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead>
                        <tr className="bg-gray-50 text-xs uppercase text-gray-500">
                          <th className="text-left px-4 py-2">Tahun</th>
                          <th className="text-right px-4 py-2">Nilai PBB</th>
                          <th className="text-center px-3 py-2 border-l border-gray-200" colSpan={3}>
                            Objek Bumi (Tanah)
                          </th>
                          <th className="text-center px-3 py-2 border-l border-gray-200" colSpan={3}>
                            Objek Bangunan
                          </th>
                          <th className="text-left px-4 py-2 border-l border-gray-200">Jatuh Tempo</th>
                          <th className="text-left px-4 py-2 border-l border-gray-200">Tgl Bayar PBB</th>
                          <th className="text-right px-4 py-2">Dibayar</th>
                          <th className="text-right px-4 py-2">Aksi</th>
                        </tr>
                        <tr className="bg-gray-50 text-xs text-gray-400 border-b">
                          <th colSpan={2} />
                          <th className="px-3 py-1 text-center border-l border-gray-200 font-normal">Luas SPPT</th>
                          <th className="px-3 py-1 text-center font-normal">Luas KS</th>
                          <th className="px-3 py-1 text-center font-normal">NJOP/m²</th>
                          <th className="px-3 py-1 text-center border-l border-gray-200 font-normal">Luas SPPT</th>
                          <th className="px-3 py-1 text-center font-normal">Luas KS</th>
                          <th className="px-3 py-1 text-center font-normal">NJOP/m²</th>
                          <th colSpan={4} />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(dataPBB[selectedKS.aset_id] ?? []).map(p => (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{p.tahun}</td>
                            <td className="px-4 py-2 text-right">
                              <CurrencyDisplay value={p.nilai_pbb} size="sm" />
                            </td>
                            {/* Tanah */}
                            <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">
                              {p.luas_tanah_sppt ? `${formatAngka(p.luas_tanah_sppt)} m²` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {p.luas_tanah_ks ? `${formatAngka(p.luas_tanah_ks)} m²` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {p.njop_tanah_per_m2 ? <CurrencyDisplay value={p.njop_tanah_per_m2} size="sm" /> : '—'}
                            </td>
                            {/* Bangunan */}
                            <td className="px-3 py-2 text-right text-gray-600 border-l border-gray-100">
                              {p.luas_bangunan_sppt ? `${formatAngka(p.luas_bangunan_sppt)} m²` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {p.luas_bangunan_ks ? `${formatAngka(p.luas_bangunan_ks)} m²` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {p.njop_bangunan_per_m2 ? <CurrencyDisplay value={p.njop_bangunan_per_m2} size="sm" /> : '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-500 border-l border-gray-100">
                              {p.tgl_jatuh_tempo ? formatTanggal(p.tgl_jatuh_tempo) : '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-500 border-l border-gray-100">
                              {p.tgl_bayar_pbb ? formatTanggal(p.tgl_bayar_pbb) : '—'}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {p.jumlah_pbb_dibayar
                                ? <CurrencyDisplay value={p.jumlah_pbb_dibayar} size="sm" />
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                <Pencil size={14} />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* Dialog Input/Edit PBB */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Data PBB' : 'Input Data PBB'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Informasi PBB */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Informasi PBB</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Aset</Label>
                  <Select
                    defaultValue={editTarget?.aset_id ?? selectedKS?.aset_id}
                    onValueChange={v => setValue('aset_id', v)}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih aset..." /></SelectTrigger>
                    <SelectContent>
                      {daftarAset.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tahun Pajak</Label>
                  <Input type="number" {...register('tahun')} className="mt-1" />
                </div>
                <div>
                  <Label>Tanggal Jatuh Tempo PBB</Label>
                  <Input type="date" {...register('tgl_jatuh_tempo')} className="mt-1" />
                </div>
                <div className="col-span-2">
                  <Label>Nilai PBB Total (sesuai SPPT)</Label>
                  <Controller control={control} name="nilai_pbb" render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />
                  )} />
                </div>
              </div>
            </div>

            {/* Objek Bumi & Bangunan */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Objek Bumi &amp; Bangunan</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                      <th className="text-left px-3 py-2 w-28">Objek</th>
                      <th className="text-center px-3 py-2">Luas SPPT (m²)</th>
                      <th className="text-center px-3 py-2">Luas KS (m²)</th>
                      <th className="text-center px-3 py-2">NJOP per m² (Rp)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {/* Tanah */}
                    <tr>
                      <td className="px-3 py-3 font-medium text-gray-700">Tanah</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...register('luas_tanah_sppt')}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...register('luas_tanah_ks')}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Controller control={control} name="njop_tanah_per_m2" render={({ field }) => (
                          <CurrencyInput value={field.value} onChange={field.onChange} />
                        )} />
                      </td>
                    </tr>
                    {/* Bangunan */}
                    <tr>
                      <td className="px-3 py-3 font-medium text-gray-700">Bangunan</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...register('luas_bangunan_sppt')}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0"
                          {...register('luas_bangunan_ks')}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Controller control={control} name="njop_bangunan_per_m2" render={({ field }) => (
                          <CurrencyInput value={field.value} onChange={field.onChange} />
                        )} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Luas SPPT = total luasan sesuai SPPT. Luas KS = porsi yang dikerjasamakan.
              </p>
              {njopAutoFilled && (
                <p className="text-xs text-blue-600 mt-1">
                  Nilai NJOP/m² diisi otomatis dari data NJOP tahun {njopAutoFilled.tahun}.
                </p>
              )}
            </div>

            {/* Preview NJOP live */}
            <NJOPPreview control={control} />

            {/* Pembayaran PBB */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Pembayaran PBB</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tanggal Bayar PBB</Label>
                  <Input type="date" {...register('tgl_bayar_pbb')} className="mt-1" />
                </div>
                <div>
                  <Label>Jumlah yang Dibayarkan (Rp)</Label>
                  <Controller control={control} name="jumlah_pbb_dibayar" render={({ field }) => (
                    <CurrencyInput value={field.value ?? 0} onChange={field.onChange} className="mt-1" />
                  )} />
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Kosongkan jika PBB belum dibayar. Status lunas/sebagian ditetapkan otomatis.
              </p>
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
