import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Trash2 } from 'lucide-react'
import { useCashInStore, CASH_IN_JENIS_LABEL } from '@/store/cashInStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useRKAPStore } from '@/store/rkapStore'
import { SearchableSelect } from './SearchableSelect'
import { CurrencyInput } from './CurrencyInput'
import { ConfirmDialog } from './ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatRupiah, formatTanggal } from '@/lib/utils'

const schema = z.object({
  ks_id: z.string().min(1, 'Pilih kerja sama'),
  rkap_kode: z.string().trim().min(1, 'ID Monika wajib dipilih'),
  jenis: z.enum(['denda', 'lainnya']),
  tgl_terima: z.string().min(1, 'Tanggal diterima wajib diisi'),
  nominal: z.coerce.number().min(1, 'Nominal wajib lebih dari Rp0'),
  keterangan: z.string().optional(),
})
type FormData = z.infer<typeof schema>

export function CashInLainnyaPanel({ initialKsId = '' }: { initialKsId?: string }) {
  const { allCashIn, isLoading, fetchAllCashIn, addCashIn, deleteCashIn } = useCashInStore()
  const { daftarKS } = useKerjaSamaStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const [filterKs, setFilterKs] = useState(initialKsId)
  const [filterYear, setFilterYear] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const form = useForm<FormData>({ resolver: zodResolver(schema), defaultValues: {
    ks_id: initialKsId, rkap_kode: '', jenis: 'denda', nominal: 0,
    tgl_terima: new Date().toLocaleDateString('en-CA'), keterangan: '',
  } })
  useEffect(() => { fetchAllCashIn() }, [])
  const year = Number(form.watch('tgl_terima').slice(0, 4)) || new Date().getFullYear()
  useEffect(() => { fetchRKAP(year) }, [year])
  const programOptions = [...new Map([...rkapRows.filter(row => row.kode).map(row => [row.kode!, `${row.kode} — ${row.nama}`] as const), ...daftarKS.filter(ks => ks.aset?.kode_aset).map(ks => [ks.aset!.kode_aset, `${ks.aset!.kode_aset} — ${ks.aset!.nama_aset}`] as const)].map(([value, label]) => [value, { value, label }])).values()]
  const ksId = form.watch('ks_id')
  useEffect(() => {
    const ks = daftarKS.find(item => item.id === ksId)
    if (ks && !form.getValues('rkap_kode')) form.setValue('rkap_kode', ks.aset?.kode_aset ?? '')
  }, [ksId, daftarKS])
  const ksOptions = daftarKS.map(ks => ({ value: ks.id, label: `${ks.nama_mitra} — ${ks.aset?.nama_aset ?? '-'}`, searchText: `${ks.nama_mitra} ${ks.aset?.nama_aset ?? ''} ${ks.no_perjanjian ?? ''}` }))
  const rows = useMemo(() => allCashIn.filter(row => (!filterKs || row.ks_id === filterKs) && (!filterYear || row.tgl_terima.startsWith(filterYear))), [allCashIn, filterKs, filterYear])
  const years = [...new Set(allCashIn.map(row => row.tgl_terima.slice(0, 4)))].sort().reverse()
  const save = form.handleSubmit(async values => {
    if (savingRef.current) return
    savingRef.current = true; setSaving(true)
    try {
      await addCashIn({ ...values, kompensasi_id: null, keterangan: values.keterangan?.trim() || null })
      form.setValue('nominal', 0); form.setValue('keterangan', '')
    } catch (error) { alert(error instanceof Error ? error.message : 'Gagal menyimpan cash in.') }
    finally { savingRef.current = false; setSaving(false) }
  })
  return <div className="space-y-4">
    <div><h1 className="text-lg font-bold text-gray-800">Cash In Denda & Lainnya</h1><p className="mt-1 text-xs text-gray-500">Catat penerimaan denda dan pendapatan lain per kerja sama. Pembayaran pokok dicatat pada tab Pokok.</p></div>
    <form onSubmit={save} className="grid gap-4 rounded-xl border bg-white p-4 sm:grid-cols-2">
      <div><Label>Kerja Sama</Label><Controller control={form.control} name="ks_id" render={({ field }) => <SearchableSelect value={field.value} onValueChange={value => { field.onChange(value); form.setValue('rkap_kode', daftarKS.find(ks => ks.id === value)?.aset?.kode_aset ?? '') }} options={ksOptions} placeholder="Pilih mitra dan aset" />} /></div>
      <div><Label>ID Monika</Label><Controller control={form.control} name="rkap_kode" render={({ field }) => <SearchableSelect value={field.value} onValueChange={field.onChange} options={programOptions} placeholder="Pilih ID Monika" />} /></div>
      <div><Label>Jenis Pemasukan</Label><select {...form.register('jenis')} className="mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="denda">Denda Keterlambatan</option><option value="lainnya">Pendapatan Lainnya</option></select></div>
      <div><Label>Tanggal Diterima</Label><Input type="date" {...form.register('tgl_terima')} className="mt-1" /></div>
      <div><Label>Nominal (Rp)</Label><Controller control={form.control} name="nominal" render={({ field }) => <CurrencyInput value={field.value} onChange={field.onChange} className="mt-1" />} /></div>
      <div><Label>Keterangan</Label><Textarea {...form.register('keterangan')} className="mt-1" rows={2} /></div>
      {Object.values(form.formState.errors).map((error, index) => <p key={index} className="text-xs text-red-600">{error.message}</p>)}
      <div className="sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan Cash In'}</Button></div>
    </form>
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3"><h2 className="text-sm font-semibold">Daftar Denda & Lainnya</h2><div className="min-w-[220px] flex-1"><SearchableSelect value={filterKs} onValueChange={setFilterKs} options={[{ value: '', label: 'Semua mitra' }, ...ksOptions]} placeholder="Semua mitra" /></div><select value={filterYear} onChange={event => setFilterYear(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">Semua tahun</option>{years.map(value => <option key={value} value={value}>{value}</option>)}</select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead><tr className="border-b bg-gray-50 text-left text-xs text-gray-500"><th className="p-2">Mitra / Aset</th><th className="p-2">Jenis / Monika</th><th className="p-2">Tanggal</th><th className="p-2 text-right">Nominal</th><th className="p-2">Keterangan</th><th className="p-2" /></tr></thead><tbody>{rows.map(row => {
        const ks = daftarKS.find(item => item.id === row.ks_id) ?? row.kerja_sama
        return <tr key={row.id} className="border-b"><td className="p-2">{ks?.nama_mitra ?? '-'}<p className="text-xs text-gray-400">{ks?.aset?.nama_aset ?? '-'}</p></td><td className="p-2">{CASH_IN_JENIS_LABEL[row.jenis]}<p className="text-xs text-gray-400">{row.rkap_kode ?? '-'}</p></td><td className="p-2">{formatTanggal(row.tgl_terima)}</td><td className="p-2 text-right font-medium text-green-700">{formatRupiah(row.nominal)}</td><td className="p-2 text-xs text-gray-500">{row.keterangan ?? '-'}</td><td className="p-2"><Button variant="ghost" size="icon" title="Hapus cash in" aria-label={`Hapus ${CASH_IN_JENIS_LABEL[row.jenis]} ${ks?.nama_mitra ?? ''}`} onClick={() => setDeleteId(row.id)}><Trash2 size={14} /></Button></td></tr>
      })}</tbody><tfoot><tr className="font-semibold"><td colSpan={3} className="p-2">Total ({rows.length} transaksi)</td><td className="p-2 text-right">{formatRupiah(rows.reduce((sum, row) => sum + Number(row.nominal), 0))}</td><td colSpan={2} /></tr></tfoot></table></div>
      {!rows.length && <p className="py-4 text-center text-sm text-gray-400">{isLoading ? 'Memuat data…' : 'Belum ada cash in untuk filter ini.'}</p>}
    </div>
    <ConfirmDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null) }} title="Hapus Cash In?" description="Catatan penerimaan ini akan dihapus permanen." isDestructive confirmLabel="Hapus" onConfirm={() => { if (deleteId) void deleteCashIn(deleteId).catch(error => alert(error instanceof Error ? error.message : 'Gagal menghapus cash in.')) }} />
  </div>
}
