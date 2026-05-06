import { useEffect, useState } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePBBStore, PBBObjekInput } from '@/store/pbbStore'
import { useNJOPStore } from '@/store/njopStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { hitungPBBProporsional } from '@/utils/pbbUtils'
import { formatAngka, formatTanggal, formatRupiah } from '@/lib/utils'
import { Plus, Pencil, Trash2, FileDown, ChevronDown, ChevronUp } from 'lucide-react'
import { useForm, Controller, useWatch, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PBB, KerjaSama } from '@/types'
import { useRKAPStore } from '@/store/rkapStore'
import { InvoicePBBDialog } from '@/components/common/InvoicePBBDialog'

/* ─── Zod schema ──────────────────────────────────────────────────────── */
const pbbObjekSchema = z.object({
  nama_objek:           z.string().min(1, 'Nama wajib diisi'),
  no_sppt:              z.string().optional(),
  nilai_pbb_objek:      z.coerce.number().min(0).default(0),
  luas_tanah_sppt:      z.coerce.number().min(0).default(0),
  luas_tanah_ks:        z.coerce.number().min(0).default(0),
  njop_tanah_per_m2:    z.coerce.number().min(0).default(0),
  luas_bangunan_sppt:   z.coerce.number().min(0).default(0),
  luas_bangunan_ks:     z.coerce.number().min(0).default(0),
  njop_bangunan_per_m2: z.coerce.number().min(0).default(0),
})

const pbbSchema = z.object({
  aset_id:            z.string().min(1, 'Pilih aset'),
  rkap_kode:          z.string().optional(),
  tahun:              z.coerce.number().min(2000).max(2099),
  tgl_jatuh_tempo:    z.string().optional(),
  tgl_bayar_pbb:      z.string().optional(),
  jumlah_pbb_dibayar: z.coerce.number().min(0).optional(),
  objek: z.array(pbbObjekSchema).min(1, 'Minimal 1 objek PBB harus diisi'),
})

type PBBForm = z.infer<typeof pbbSchema>
type PBBObjekForm = z.infer<typeof pbbObjekSchema>

function defaultObjek(idx: number, njopTanah = 0, njopBangunan = 0): PBBObjekForm {
  return {
    nama_objek: `Objek ${idx + 1}`,
    no_sppt: '',
    nilai_pbb_objek: 0,
    luas_tanah_sppt: 0, luas_tanah_ks: 0, njop_tanah_per_m2: njopTanah,
    luas_bangunan_sppt: 0, luas_bangunan_ks: 0, njop_bangunan_per_m2: njopBangunan,
  }
}

/* ─── NJOP preview per satu objek ────────────────────────────────────── */
function NJOPPreviewObjek({ control, index }: { control: any; index: number }) {
  const vals = useWatch({ control, name: `objek.${index}` })
  if (!vals) return null
  const njopTanahSppt    = (vals.luas_tanah_sppt    || 0) * (vals.njop_tanah_per_m2    || 0)
  const njopBangunanSppt = (vals.luas_bangunan_sppt  || 0) * (vals.njop_bangunan_per_m2 || 0)
  const njopSppt         = njopTanahSppt + njopBangunanSppt
  const njopTanahKS      = (vals.luas_tanah_ks    || 0) * (vals.njop_tanah_per_m2    || 0)
  const njopBangunanKS   = (vals.luas_bangunan_ks  || 0) * (vals.njop_bangunan_per_m2 || 0)
  const njopKS           = njopTanahKS + njopBangunanKS
  const proporsi         = njopSppt > 0 ? (njopKS / njopSppt) * 100 : null
  if (njopSppt === 0 && njopKS === 0) return null
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs space-y-1 mt-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-blue-900">
        <span>NJOP Tanah SPPT:</span>    <span className="text-right font-mono">{formatRupiah(njopTanahSppt)}</span>
        <span>NJOP Bangunan SPPT:</span> <span className="text-right font-mono">{formatRupiah(njopBangunanSppt)}</span>
        <span className="font-semibold">Total NJOP SPPT:</span> <span className="text-right font-mono font-semibold">{formatRupiah(njopSppt)}</span>
        <span>NJOP Tanah KS:</span>      <span className="text-right font-mono">{formatRupiah(njopTanahKS)}</span>
        <span>NJOP Bangunan KS:</span>   <span className="text-right font-mono">{formatRupiah(njopBangunanKS)}</span>
        <span className="font-semibold">Total NJOP KS:</span> <span className="text-right font-mono font-semibold">{formatRupiah(njopKS)}</span>
      </div>
      {proporsi !== null && (
        <div className="pt-1 border-t border-blue-200 flex justify-between">
          <span className="font-semibold text-blue-800">Proporsi Luasan:</span>
          <span className="font-bold text-blue-700">{proporsi.toFixed(2)}%</span>
        </div>
      )}
    </div>
  )
}

/* ─── Kartu input per objek ────────────────────────────────────────────── */
interface ObjekCardProps {
  index: number
  control: any
  register: any
  canDelete: boolean
  onDelete: () => void
}
function ObjekCard({ index, control, register, canDelete, onDelete }: ObjekCardProps) {
  return (
    <div className="border rounded-lg p-4 space-y-3 bg-gray-50/40">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Objek {index + 1}</span>
        {canDelete && (
          <Button type="button" variant="ghost" size="icon" className="text-red-500 h-7 w-7" onClick={onDelete}>
            <Trash2 size={13} />
          </Button>
        )}
      </div>

      {/* Identitas */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Nama / Uraian Objek</Label>
          <Input {...register(`objek.${index}.nama_objek`)} className="mt-1 h-8 text-sm" placeholder="cth: Gedung Utama" />
        </div>
        <div>
          <Label className="text-xs">No. SPPT / NOP <span className="text-gray-400 font-normal">(opsional)</span></Label>
          <Input {...register(`objek.${index}.no_sppt`)} className="mt-1 h-8 text-sm" placeholder="cth: 12-34-567-890-0" />
        </div>
      </div>

      {/* Nilai PBB */}
      <div>
        <Label className="text-xs">Nilai PBB Objek ini (sesuai SPPT) <span className="text-red-500">*</span></Label>
        <Controller control={control} name={`objek.${index}.nilai_pbb_objek`} render={({ field }) => (
          <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1 h-8 text-sm" />
        )} />
      </div>

      {/* Tabel area & NJOP */}
      <div>
        <Label className="text-xs text-gray-500 mb-1 block">Luasan &amp; NJOP (untuk kalkulasi proporsional)</Label>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-500 uppercase">
                <th className="text-left px-2 py-1.5 w-20">Objek</th>
                <th className="text-center px-2 py-1.5">Luas SPPT (m²)</th>
                <th className="text-center px-2 py-1.5">Luas KS (m²)</th>
                <th className="text-center px-2 py-1.5">NJOP/m² (Rp)</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              <tr>
                <td className="px-2 py-2 font-medium text-gray-700">Tanah</td>
                <td className="px-2 py-1">
                  <Input type="number" step="0.01" placeholder="0" {...register(`objek.${index}.luas_tanah_sppt`)} className="text-right h-7 text-xs" />
                </td>
                <td className="px-2 py-1">
                  <Input type="number" step="0.01" placeholder="0" {...register(`objek.${index}.luas_tanah_ks`)} className="text-right h-7 text-xs" />
                </td>
                <td className="px-2 py-1">
                  <Controller control={control} name={`objek.${index}.njop_tanah_per_m2`} render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} className="h-7 text-xs" />
                  )} />
                </td>
              </tr>
              <tr>
                <td className="px-2 py-2 font-medium text-gray-700">Bangunan</td>
                <td className="px-2 py-1">
                  <Input type="number" step="0.01" placeholder="0" {...register(`objek.${index}.luas_bangunan_sppt`)} className="text-right h-7 text-xs" />
                </td>
                <td className="px-2 py-1">
                  <Input type="number" step="0.01" placeholder="0" {...register(`objek.${index}.luas_bangunan_ks`)} className="text-right h-7 text-xs" />
                </td>
                <td className="px-2 py-1">
                  <Controller control={control} name={`objek.${index}.njop_bangunan_per_m2`} render={({ field }) => (
                    <CurrencyInput value={field.value} onChange={field.onChange} className="h-7 text-xs" />
                  )} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-1">Luas SPPT = total di SPPT. Luas KS = porsi yang dikerjasamakan.</p>
      </div>

      <NJOPPreviewObjek control={control} index={index} />
    </div>
  )
}

/* ─── Total PBB live (computed dari semua objek) ─────────────────────── */
function TotalPBBLive({ control }: { control: any }) {
  const objek = useWatch({ control, name: 'objek' }) as PBBObjekForm[] | undefined
  const total = (objek ?? []).reduce((sum, o) => sum + (Number(o?.nilai_pbb_objek) || 0), 0)
  if (total === 0) return null
  return (
    <div className="bg-[#1B4F72]/5 border border-[#1B4F72]/20 rounded-lg px-4 py-2.5 flex items-center justify-between">
      <span className="text-sm font-medium text-[#1B4F72]">Total Nilai PBB (semua objek)</span>
      <span className="font-bold text-[#1B4F72]">{formatRupiah(total)}</span>
    </div>
  )
}

/* ─── Status badge ─────────────────────────────────────────────────────── */
function StatusBadge({ status, tahun }: { status: string; tahun: number }) {
  const config = {
    lunas:       { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Lunas' },
    sebagian:    { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Sebagian' },
    belum_bayar: { bg: 'bg-red-100',    text: 'text-red-600',    label: 'Belum Bayar' },
  }[status] ?? { bg: 'bg-gray-100', text: 'text-gray-500', label: status }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      {tahun} · {config.label}
    </span>
  )
}

/* ─── Card per KS ──────────────────────────────────────────────────────── */
interface KSPBBCardProps {
  ks: KerjaSama
  pbbRecords: PBB[]
  hasil: ReturnType<typeof hitungPBBProporsional>
  onAdd: () => void
  onEdit: (p: PBB) => void
  onDelete: (id: string) => void
  onInvoice: () => void
}

function KSPBBCard({ ks, pbbRecords, hasil, onAdd, onEdit, onDelete, onInvoice }: KSPBBCardProps) {
  const [expanded, setExpanded] = useState(false)
  const anyArea = hasil.detail.some(r => r.hasAreaData)

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      {/* Header selalu terlihat */}
      <button
        type="button"
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-semibold text-gray-900 truncate">
              {(ks.aset as any)?.nama_aset ?? '—'}
            </h2>
            {pbbRecords.map(p => (
              <StatusBadge key={p.id} status={p.status_bayar} tahun={p.tahun} />
            ))}
            {pbbRecords.length === 0 && (
              <span className="text-xs text-gray-400 italic">Belum ada data PBB</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {ks.nama_mitra} · {formatTanggal(ks.tgl_mulai)} s/d {formatTanggal(ks.tgl_selesai)}
          </p>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          {hasil.totalPBBDitanggung > 0 && (
            <div className="text-right">
              <p className="text-xs text-gray-400">Total PBB Ditanggung</p>
              <p className="font-bold text-[#1B4F72] text-sm">{formatRupiah(hasil.totalPBBDitanggung)}</p>
            </div>
          )}
          <div className="text-gray-400">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t px-5 py-4 space-y-5">
          {/* Action bar */}
          <div className="flex items-center justify-end gap-2">
            {hasil.detail.length > 0 && (
              <Button size="sm" variant="outline" className="text-[#1B4F72] border-[#1B4F72]" onClick={onInvoice}>
                <FileDown size={13} /> Invoice PBB
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onAdd}>
              <Plus size={13} /> Input PBB
            </Button>
          </div>

          {/* Kalkulasi Proporsional */}
          {hasil.detail.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Kalkulasi PBB Proporsional
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm mb-3 min-w-[500px]">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 uppercase">
                      <th className="text-left pb-2">Tahun / Objek</th>
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
                    {hasil.detail.map(r => {
                      const multiObjek = (r.objekDetail?.length ?? 0) > 1
                      return (
                        <>
                          {/* Baris ringkasan per tahun */}
                          <tr key={r.tahun} className={`text-sm ${multiObjek ? 'font-medium bg-gray-50/50' : ''}`}>
                            <td className="py-2">
                              {r.tahun}
                              {multiObjek && (
                                <span className="ml-2 text-xs font-normal text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                  {r.objekDetail!.length} objek
                                </span>
                              )}
                            </td>
                            <td className="py-2 text-right"><CurrencyDisplay value={r.nilaiPBB} size="sm" /></td>
                            {anyArea && (
                              <>
                                <td className="py-2 text-right text-gray-600">
                                  {r.hasAreaData
                                    ? <><CurrencyDisplay value={r.njopSppt} size="sm" />{multiObjek && <span className="text-[10px] text-gray-400 ml-0.5">*</span>}</>
                                    : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-2 text-right text-gray-600">
                                  {r.hasAreaData
                                    ? <><CurrencyDisplay value={r.njopKS} size="sm" />{multiObjek && <span className="text-[10px] text-gray-400 ml-0.5">*</span>}</>
                                    : <span className="text-gray-400">—</span>}
                                </td>
                                <td className="py-2 text-right">
                                  {r.hasAreaData
                                    ? <span className="text-orange-600 font-medium">{(r.proporsiArea * 100).toFixed(2)}%{multiObjek && <span className="text-[10px] text-gray-400">*</span>}</span>
                                    : <span className="text-gray-400 text-xs">—</span>}
                                </td>
                              </>
                            )}
                            <td className="py-2 text-right">{formatAngka(r.hariKS)}</td>
                            <td className="py-2 text-right">{formatAngka(r.hariDalamTahun)}</td>
                            <td className="py-2 text-right text-orange-600 font-medium">{(r.proporsiWaktu * 100).toFixed(2)}%</td>
                            <td className="py-2 text-right font-semibold text-[#1B4F72]">
                              <CurrencyDisplay value={r.pbbProporsional} size="sm" />
                            </td>
                          </tr>

                          {/* Sub-rows per objek (hanya jika multi-objek) */}
                          {multiObjek && r.objekDetail!.map((o, oi) => (
                            <tr key={`${r.tahun}-o${oi}`} className="text-xs bg-white">
                              <td className="pl-6 pr-2 py-1.5 text-gray-500 italic">↳ {o.nama_objek}</td>
                              <td className="py-1.5 text-right text-gray-600">
                                <CurrencyDisplay value={o.nilaiPBBObjek} size="sm" />
                              </td>
                              {anyArea && (
                                <>
                                  <td className="py-1.5 text-right text-gray-500">
                                    {o.hasAreaDataObjek ? <CurrencyDisplay value={o.njopSpptObjek} size="sm" /> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="py-1.5 text-right text-gray-500">
                                    {o.hasAreaDataObjek ? <CurrencyDisplay value={o.njopKSObjek} size="sm" /> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {o.hasAreaDataObjek
                                      ? <span className="text-orange-500">{(o.proporsiAreaObjek * 100).toFixed(2)}%</span>
                                      : <span className="text-gray-300">—</span>}
                                  </td>
                                </>
                              )}
                              <td colSpan={3} />
                              <td className="py-1.5 text-right text-gray-700 font-medium">
                                <CurrencyDisplay value={o.pbbProporsionalObjek} size="sm" />
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
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
                {hasil.detail.some(r => (r.objekDetail?.length ?? 0) > 1) && (
                  <p className="text-[11px] text-gray-400 mb-2">
                    * NJOP dan Prop. Luasan pada baris tahun = agregasi semua objek (untuk referensi). Kalkulasi aktual dihitung per objek (lihat sub-baris).
                  </p>
                )}
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs font-mono text-blue-800 space-y-1.5">
                {hasil.detail.map(r => {
                  const multiObjek = (r.objekDetail?.length ?? 0) > 1
                  if (!multiObjek) {
                    return (
                      <div key={r.tahun}>
                        PBB {r.tahun}: {formatRupiah(r.nilaiPBB)}
                        {r.hasAreaData && <> × <span className="text-orange-700">({formatRupiah(r.njopKS)}/{formatRupiah(r.njopSppt)} luasan)</span></>}
                        {' '}× <span className="text-orange-700">({formatAngka(r.hariKS)}/{formatAngka(r.hariDalamTahun)} hari)</span>
                        {' '}= <strong>{formatRupiah(r.pbbProporsional)}</strong>
                      </div>
                    )
                  }
                  // Multi-objek: tampilkan per-objek agar formula verifiable
                  return (
                    <div key={r.tahun} className="space-y-0.5">
                      <div className="font-semibold text-blue-900">
                        PBB {r.tahun} ({r.objekDetail!.length} objek)
                        {' '}× <span className="text-orange-700">({formatAngka(r.hariKS)}/{formatAngka(r.hariDalamTahun)} hari)</span>:
                      </div>
                      {r.objekDetail!.map((o, oi) => (
                        <div key={oi} className="pl-3 text-blue-700">
                          ↳ {o.nama_objek}: {formatRupiah(o.nilaiPBBObjek)}
                          {o.hasAreaDataObjek && (
                            <> × <span className="text-orange-700">({formatRupiah(o.njopKSObjek)}/{formatRupiah(o.njopSpptObjek)} luasan)</span></>
                          )}
                          {' '}= <strong>{formatRupiah(o.pbbProporsionalObjek)}</strong>
                        </div>
                      ))}
                      <div className="pl-3 border-l-2 border-blue-300 text-blue-900 font-semibold">
                        → Total {r.tahun}: <strong>{formatRupiah(r.pbbProporsional)}</strong>
                      </div>
                    </div>
                  )
                })}
                <div className="border-t border-blue-200 mt-1 pt-1">
                  Total PBB ditanggung mitra: <strong>{formatRupiah(hasil.totalPBBDitanggung)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Tabel Data PBB */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Data PBB</p>
            {pbbRecords.length === 0 ? (
              <p className="text-sm text-gray-500">
                Belum ada data PBB.{' '}
                <button type="button" className="text-[#1B4F72] underline text-sm" onClick={onAdd}>Input sekarang</button>
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="bg-gray-50 text-xs uppercase text-gray-500 border-b">
                      <th className="text-left px-4 py-2">Tahun</th>
                      <th className="text-right px-4 py-2">Total Nilai PBB</th>
                      <th className="text-center px-3 py-2">Jml Objek</th>
                      <th className="text-left px-4 py-2">Jatuh Tempo</th>
                      <th className="text-left px-4 py-2">Tgl Bayar</th>
                      <th className="text-right px-4 py-2">Dibayar</th>
                      <th className="text-right px-4 py-2">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pbbRecords.map(p => {
                      const objekList = p.pbb_objek ?? []
                      return (
                        <>
                          {/* Baris utama PBB */}
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2 font-medium">{p.tahun}</td>
                            <td className="px-4 py-2 text-right font-semibold">
                              <CurrencyDisplay value={p.nilai_pbb} size="sm" />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="inline-flex items-center justify-center rounded-full bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5">
                                {objekList.length} objek
                              </span>
                            </td>
                            <td className="px-4 py-2 text-gray-500">
                              {p.tgl_jatuh_tempo ? formatTanggal(p.tgl_jatuh_tempo) : '—'}
                            </td>
                            <td className="px-4 py-2 text-gray-500">
                              {p.tgl_bayar_pbb ? formatTanggal(p.tgl_bayar_pbb) : '—'}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {p.jumlah_pbb_dibayar
                                ? <CurrencyDisplay value={p.jumlah_pbb_dibayar} size="sm" />
                                : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => onEdit(p)}>
                                  <Pencil size={14} />
                                </Button>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700"
                                  onClick={() => onDelete(p.id)}>
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </td>
                          </tr>

                          {/* Sub-rows per objek */}
                          {objekList.map((o, oi) => (
                            <tr key={o.id} className="bg-gray-50/60 text-xs text-gray-600">
                              <td className="pl-8 pr-2 py-1.5 text-gray-500" colSpan={1}>
                                <span className="font-medium text-gray-700">{o.nama_objek}</span>
                                {o.no_sppt && <span className="ml-1.5 text-[11px] font-mono text-gray-400">({o.no_sppt})</span>}
                              </td>
                              <td className="px-4 py-1.5 text-right text-gray-700 font-medium">
                                <CurrencyDisplay value={o.nilai_pbb_objek} size="sm" />
                              </td>
                              <td className="px-3 py-1.5 text-center text-gray-400 text-[11px]">{oi + 1}</td>
                              <td className="px-4 py-1.5 text-gray-500 text-[11px]" colSpan={4}>
                                {[
                                  o.luas_tanah_sppt ? `Tanah: ${formatAngka(o.luas_tanah_sppt)}/${formatAngka(o.luas_tanah_ks)} m²` : null,
                                  o.luas_bangunan_sppt ? `Bgn: ${formatAngka(o.luas_bangunan_sppt)}/${formatAngka(o.luas_bangunan_ks)} m²` : null,
                                  o.njop_tanah_per_m2 ? `NJOP: ${formatRupiah(o.njop_tanah_per_m2)}/m²` : null,
                                ].filter(Boolean).join(' · ') || '—'}
                              </td>
                            </tr>
                          ))}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Halaman Utama ────────────────────────────────────────────────────── */
export function PembayaranPBB() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { dataPBB, fetchAllPBB, addPBB, updatePBB, deletePBB } = usePBBStore()
  const { dataNJOP, fetchAllNJOP } = useNJOPStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PBB | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [invoiceTarget, setInvoiceTarget] = useState<{
    ks: KerjaSama
    hasil: { detail: ReturnType<typeof hitungPBBProporsional>['detail']; totalPBBDitanggung: number }
  } | null>(null)

  const { handleSubmit, reset, setValue, control, register, watch } = useForm<PBBForm>({
    resolver: zodResolver(pbbSchema),
    defaultValues: { tahun: new Date().getFullYear(), objek: [defaultObjek(0)] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'objek' })

  const watchedAsetId = watch('aset_id')
  const watchedTahun  = watch('tahun')

  useEffect(() => { fetchAset(); fetchKS(); fetchAllPBB(); fetchAllNJOP(); fetchRKAP(new Date().getFullYear()) }, [])

  // Auto-fill NJOP untuk objek pertama saat aset/tahun berubah (hanya untuk mode tambah baru)
  useEffect(() => {
    if (editTarget || !watchedAsetId || !watchedTahun) return
    const njopList = dataNJOP[watchedAsetId]
    if (!njopList || njopList.length === 0) return
    const found = njopList.find(n => n.tahun === Number(watchedTahun)) ?? njopList[0]
    if (found) {
      fields.forEach((_, idx) => {
        setValue(`objek.${idx}.njop_tanah_per_m2`,    found.nilai_tanah_per_m2)
        setValue(`objek.${idx}.njop_bangunan_per_m2`, found.nilai_bangunan_per_m2)
      })
    }
  }, [watchedAsetId, watchedTahun])

  const getNJOPDefault = () => {
    if (!watchedAsetId) return { njopTanah: 0, njopBangunan: 0 }
    const njopList = dataNJOP[watchedAsetId]
    if (!njopList || njopList.length === 0) return { njopTanah: 0, njopBangunan: 0 }
    const found = njopList.find(n => n.tahun === Number(watchedTahun)) ?? njopList[0]
    return { njopTanah: found?.nilai_tanah_per_m2 ?? 0, njopBangunan: found?.nilai_bangunan_per_m2 ?? 0 }
  }

  const activeKS = daftarKS.filter(ks => ['aktif', 'sp1', 'sp2', 'sp3'].includes(ks.status))

  const getPBBData = (asetId: string) =>
    (dataPBB[asetId] ?? []).map(p => ({
      tahun: p.tahun,
      nilaiPBB: p.nilai_pbb,
      objek: p.pbb_objek?.map(o => ({
        nama_objek:          o.nama_objek,
        nilai_pbb_objek:     o.nilai_pbb_objek,
        luas_tanah_sppt:     o.luas_tanah_sppt,
        luas_tanah_ks:       o.luas_tanah_ks,
        njop_tanah_per_m2:   o.njop_tanah_per_m2,
        luas_bangunan_sppt:  o.luas_bangunan_sppt,
        luas_bangunan_ks:    o.luas_bangunan_ks,
        njop_bangunan_per_m2: o.njop_bangunan_per_m2,
      })),
      // Legacy fallback (untuk data lama yang belum punya pbb_objek)
      luas_tanah_sppt:     p.luas_tanah_sppt,
      luas_tanah_ks:       p.luas_tanah_ks,
      njop_tanah_per_m2:   p.njop_tanah_per_m2,
      luas_bangunan_sppt:  p.luas_bangunan_sppt,
      luas_bangunan_ks:    p.luas_bangunan_ks,
      njop_bangunan_per_m2: p.njop_bangunan_per_m2,
    }))

  const openAdd = (asetId?: string) => {
    setEditTarget(null)
    setSubmitError(null)
    reset({
      aset_id: asetId ?? '',
      tahun: new Date().getFullYear(),
      objek: [defaultObjek(0)],
    })
    setDialogOpen(true)
  }

  const openEdit = (p: PBB) => {
    setEditTarget(p)
    setSubmitError(null)
    const objekData = p.pbb_objek && p.pbb_objek.length > 0
      ? p.pbb_objek.map(o => ({
          nama_objek:          o.nama_objek,
          no_sppt:             o.no_sppt ?? '',
          nilai_pbb_objek:     o.nilai_pbb_objek,
          luas_tanah_sppt:     o.luas_tanah_sppt,
          luas_tanah_ks:       o.luas_tanah_ks,
          njop_tanah_per_m2:   o.njop_tanah_per_m2,
          luas_bangunan_sppt:  o.luas_bangunan_sppt,
          luas_bangunan_ks:    o.luas_bangunan_ks,
          njop_bangunan_per_m2: o.njop_bangunan_per_m2,
        }))
      : [defaultObjek(0)]
    reset({
      aset_id:            p.aset_id,
      rkap_kode:          p.rkap_kode ?? '',
      tahun:              p.tahun,
      tgl_jatuh_tempo:    p.tgl_jatuh_tempo ?? '',
      tgl_bayar_pbb:      p.tgl_bayar_pbb ?? '',
      jumlah_pbb_dibayar: p.jumlah_pbb_dibayar ?? 0,
      objek:              objekData,
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: PBBForm) => {
    setSubmitError(null)
    const totalNilaiPBB  = data.objek.reduce((sum, o) => sum + (o.nilai_pbb_objek ?? 0), 0)
    const jumlahDibayar  = data.jumlah_pbb_dibayar ?? 0
    const status_bayar   =
      jumlahDibayar >= totalNilaiPBB && data.tgl_bayar_pbb
        ? 'lunas'
        : jumlahDibayar > 0
        ? 'sebagian'
        : 'belum_bayar'

    const coreData = {
      aset_id:            data.aset_id,
      rkap_kode:          data.rkap_kode || null,
      tahun:              data.tahun,
      nilai_pbb:          totalNilaiPBB,
      tgl_jatuh_tempo:    data.tgl_jatuh_tempo || null,
      tgl_bayar_pbb:      data.tgl_bayar_pbb || null,
      jumlah_pbb_dibayar: jumlahDibayar > 0 ? jumlahDibayar : null,
      status_bayar,
    }

    const objekInput: PBBObjekInput[] = data.objek.map(o => ({
      nama_objek:          o.nama_objek,
      no_sppt:             o.no_sppt || null,
      nilai_pbb_objek:     o.nilai_pbb_objek,
      luas_tanah_sppt:     o.luas_tanah_sppt,
      luas_tanah_ks:       o.luas_tanah_ks,
      njop_tanah_per_m2:   o.njop_tanah_per_m2,
      luas_bangunan_sppt:  o.luas_bangunan_sppt,
      luas_bangunan_ks:    o.luas_bangunan_ks,
      njop_bangunan_per_m2: o.njop_bangunan_per_m2,
    }))

    try {
      if (editTarget) {
        await updatePBB(editTarget.id, coreData, data.aset_id, objekInput)
      } else {
        await addPBB(coreData, objekInput)
      }
      setDialogOpen(false)
    } catch (e) {
      setSubmitError((e as Error).message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pembayaran PBB</h1>
          <p className="text-sm text-gray-500">Monitoring PBB proporsional per kerja sama aktif</p>
        </div>
        <Button onClick={() => openAdd()} className="bg-[#1B4F72]">
          <Plus size={16} /> Input PBB
        </Button>
      </div>

      {activeKS.length === 0 ? (
        <EmptyState
          title="Belum ada kerja sama aktif"
          description="Data PBB akan muncul otomatis setelah kerja sama aktif tersedia."
        />
      ) : (
        <div className="space-y-3">
          {activeKS.map(ks => {
            const pbbData = getPBBData(ks.aset_id)
            const hasil = hitungPBBProporsional({ tglMulaiKS: ks.tgl_mulai, tglSelesaiKS: ks.tgl_selesai, dataPBB: pbbData })
            return (
              <KSPBBCard
                key={ks.id}
                ks={ks}
                pbbRecords={dataPBB[ks.aset_id] ?? []}
                hasil={hasil}
                onAdd={() => openAdd(ks.aset_id)}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onInvoice={() => setInvoiceTarget({ ks, hasil })}
              />
            )
          })}
        </div>
      )}

      {invoiceTarget && (
        <InvoicePBBDialog
          open={!!invoiceTarget}
          onClose={() => setInvoiceTarget(null)}
          ks={invoiceTarget.ks}
          hasil={invoiceTarget.hasil}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null) }}
        title="Hapus Data PBB?"
        description="Data PBB ini akan dihapus permanen dan tidak dapat dikembalikan."
        confirmLabel="Hapus"
        isDestructive
        onConfirm={() => { if (deleteTarget) deletePBB(deleteTarget); setDeleteTarget(null) }}
      />

      {/* Dialog Input / Edit PBB */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Data PBB' : 'Input Data PBB'}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* ── Informasi Umum ── */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Informasi PBB</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Aset</Label>
                  <Select defaultValue={editTarget?.aset_id} onValueChange={v => setValue('aset_id', v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih aset..." /></SelectTrigger>
                    <SelectContent>
                      {daftarAset.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Program RKAP</Label>
                  <Controller control={control} name="rkap_kode" render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={v => field.onChange(v || undefined)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="— Pilih program RKAP —" /></SelectTrigger>
                      <SelectContent>
                        {rkapRows.filter(r => r.kode).map(item => (
                          <SelectItem key={item.kode} value={item.kode!}>
                            <span className="font-mono text-xs text-gray-500 mr-2">{item.kode}</span>{item.nama}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )} />
                </div>
                <div>
                  <Label>Tahun Pajak</Label>
                  <Input type="number" {...register('tahun')} className="mt-1" />
                </div>
                <div>
                  <Label>Tanggal Jatuh Tempo PBB</Label>
                  <Input type="date" {...register('tgl_jatuh_tempo')} className="mt-1" />
                </div>
              </div>
            </div>

            {/* ── Daftar Objek PBB ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Objek PBB <span className="text-blue-600 normal-case font-normal">({fields.length} objek)</span>
                </p>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <ObjekCard
                    key={field.id}
                    index={index}
                    control={control}
                    register={register}
                    canDelete={fields.length > 1}
                    onDelete={() => remove(index)}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 w-full border-dashed"
                onClick={() => {
                  const { njopTanah, njopBangunan } = getNJOPDefault()
                  append(defaultObjek(fields.length, njopTanah, njopBangunan))
                }}
              >
                <Plus size={13} /> Tambah Objek PBB
              </Button>

              <div className="mt-3">
                <TotalPBBLive control={control} />
              </div>
            </div>

            {/* ── Pembayaran ── */}
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

            {submitError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

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
