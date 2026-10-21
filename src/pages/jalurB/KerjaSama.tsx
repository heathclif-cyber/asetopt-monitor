import { useEffect, useMemo, useState } from 'react'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useAsetStore } from '@/store/asetStore'
import { useKonsesiStore } from '@/store/konsesiStore'
import { konsesiLabel } from '@/components/aset/KonsesiPicker'
import { KerjaSama as KSType } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, hitungSisaHari, cn } from '@/lib/utils'
import { Plus, Pencil, AlertCircle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'

const ksSchema = z.object({
  aset_id: z.string().min(1),
  nama_mitra: z.string().min(1),
  no_perjanjian: z.string().optional(),
  skema_kerja_sama: z.string().optional(),
  tgl_mulai: z.string().min(1),
  tgl_selesai: z.string().min(1),
  no_wa_mitra: z.string().optional(),
  keterangan: z.string().optional(),
})

type KSForm = z.infer<typeof ksSchema>

export function KerjaSama() {
  const { daftarKS, isLoading, fetchKS, addKS, updateKS } = useKerjaSamaStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKonsesi, fetchKonsesi } = useKonsesiStore()
  const [konsesiFilter, setKonsesiFilter] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('semua')
  const [submitError, setSubmitError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<KSType | null>(null)

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<KSForm>({
    resolver: zodResolver(ksSchema),
  })

  useEffect(() => { fetchKS(); fetchAset(); void fetchKonsesi() }, [])
  // Only concessions that already carry an optimised asset can be chosen here.
  const konsesiOptions = useMemo(() => {
    const linked = new Set(daftarAset.flatMap(a => (a.aset_konsesi ?? []).map(link => link.konsesi_key)))
    return daftarKonsesi.filter(item => linked.has(item.key))
  }, [daftarAset, daftarKonsesi])
  const asetOptions = konsesiFilter ? daftarAset.filter(a => a.aset_konsesi?.some(link => link.konsesi_key === konsesiFilter)) : daftarAset

  useEffect(() => {
    if (searchParams.get('tambah') === '1') openAdd()
  }, [searchParams])

  const openAdd = () => {
    setSubmitError('')
    setEditTarget(null)
    setKonsesiFilter('')
    reset()
    setDialogOpen(true)
  }

  const handleDialogChange = (open: boolean) => {
    if (isSubmitting) return
    setDialogOpen(open)
    if (!open && searchParams.has('tambah')) setSearchParams({})
  }

  const openEdit = (ks: KSType) => {
    setSubmitError('')
    setEditTarget(ks)
    setKonsesiFilter('')
    reset({
      aset_id: ks.aset_id,
      nama_mitra: ks.nama_mitra,
      no_perjanjian: ks.no_perjanjian ?? '',
      skema_kerja_sama: ks.skema_kerja_sama ?? '',
      tgl_mulai: ks.tgl_mulai,
      tgl_selesai: ks.tgl_selesai,
      no_wa_mitra: ks.no_wa_mitra ?? '',
      keterangan: ks.keterangan ?? '',
    })
    setDialogOpen(true)
  }

  const onSubmit = async (data: KSForm) => {
    setSubmitError('')
    try {
      if (editTarget) {
        await updateKS(editTarget.id, data)
      } else {
        await addKS({ ...data, status: 'aktif', prospek_id: null } as any)
      }
      setDialogOpen(false)
      if (searchParams.has('tambah')) setSearchParams({})
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Gagal menyimpan. Silakan coba kembali.')
    }
  }

  const sortedKS = useMemo(() => [...daftarKS].sort((a, b) => {
    const sisaA = hitungSisaHari(a.tgl_selesai)
    const sisaB = hitungSisaHari(b.tgl_selesai)
    // Prioritaskan kerja sama yang masih berjalan dan paling dekat berakhir.
    if (sisaA >= 0 && sisaB < 0) return -1
    if (sisaA < 0 && sisaB >= 0) return 1
    return sisaA - sisaB
  }), [daftarKS])

  const filteredKS = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID')
    return sortedKS.filter(ks => {
      if (statusFilter !== 'semua' && ks.status !== statusFilter) return false
      return !query || [ks.nama_mitra, ks.no_perjanjian, ks.aset?.nama_aset, ks.aset?.kode_aset]
        .some(value => value?.toLocaleLowerCase('id-ID').includes(query))
    })
  }, [sortedKS, search, statusFilter])
  const clearFilters = () => { setSearch(''); setStatusFilter('semua') }

  return (
    <div className="space-y-5">
      <div className={cn("flex flex-wrap items-start justify-between gap-3")}>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Program Kerja Sama</h1>
          <p className="text-sm text-gray-500">{daftarKS.length} program kerja sama terdaftar</p>
        </div>
        <Button onClick={openAdd} className={cn("h-10")}>
          <Plus size={16} /> Tambah Program
        </Button>
      </div>

      <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3')}>
        <Input
          aria-label="Cari program kerja sama"
          placeholder="Cari mitra, aset, atau nomor perjanjian..."
          value={search}
          onChange={event => setSearch(event.target.value)}
          className={cn('h-10 flex-1 min-w-[220px]')}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filter status kerja sama" className={cn('h-10 w-full sm:w-44')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="semua">Semua status</SelectItem>
            <SelectItem value="aktif">Aktif</SelectItem>
            <SelectItem value="sp1">SP1</SelectItem>
            <SelectItem value="sp2">SP2</SelectItem>
            <SelectItem value="sp3">SP3</SelectItem>
            <SelectItem value="putus">Putus</SelectItem>
            <SelectItem value="selesai">Selesai</SelectItem>
          </SelectContent>
        </Select>
        {(search || statusFilter !== 'semua') && <Button variant="outline" className={cn('h-10')} onClick={clearFilters}>Reset filter</Button>}
        <p role="status" className={cn('text-xs text-muted-foreground')}>{filteredKS.length} dari {daftarKS.length} program</p>
      </div>

      <div className={cn('rounded-xl border bg-card overflow-x-auto')}>
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : daftarKS.length === 0 ? (
          <EmptyState title="Belum ada program kerja sama" description="Tambahkan kerja sama baru, misalnya dengan PT RSS Service System, atau konversi dari prospek mitra di Jalur A." action={<Button onClick={openAdd} size="sm"><Plus size={14} /> Tambah Program</Button>} />
        ) : filteredKS.length === 0 ? (
          <EmptyState title="Tidak ada program sesuai filter" description="Coba kata pencarian lain atau tampilkan semua status." action={<Button variant="outline" onClick={clearFilters}>Reset filter</Button>} />
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
              {filteredKS.map(ks => {
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
                        <Button variant="outline" className={cn("h-10")} asChild>
                          <Link to={`/jalur-b/kerja-sama/${ks.id}`}>Detail</Link>
                        </Button>
                        <Button variant="ghost" className={cn("h-10")} aria-label={`Edit kerja sama ${ks.nama_mitra}`} onClick={() => openEdit(ks)}>
                          <Pencil size={15} /> Edit
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogChange}>
        <DialogContent className={cn("max-w-lg max-h-[90dvh] overflow-y-auto")}>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Program Kerja Sama' : 'Tambah Program Kerja Sama'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <Label>Konsesi GIS <span className="text-gray-400">(penyaring)</span></Label>
              <div className="mt-1">
                <SearchableSelect
                  value={konsesiFilter}
                  onValueChange={value => { setKonsesiFilter(value); const current = watch('aset_id'); if (value && current && !daftarAset.find(a => a.id === current)?.aset_konsesi?.some(link => link.konsesi_key === value)) setValue('aset_id', '') }}
                  options={[{ value: '', label: 'Semua konsesi' }, ...konsesiOptions.map(item => ({
                    value: item.key,
                    label: konsesiLabel(item),
                    searchText: `${item.nama} ${item.lokasi} ${item.kabupaten ?? ''} ${item.kecamatan ?? ''}`,
                    description: [item.kecamatan && `Kec. ${item.kecamatan}`, item.kabupaten].filter(Boolean).join(', ') || undefined,
                  }))]}
                  placeholder="Semua konsesi"
                  searchPlaceholder="Cari sertifikat, kebun, atau kabupaten..."
                />
              </div>
            </div>
            <div>
              <Label>Aset dioptimalkan</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={watch('aset_id') || editTarget?.aset_id || ''}
                  onValueChange={v => setValue('aset_id', v, { shouldValidate: true })}
                  options={asetOptions.map(a => ({
                    value: a.id,
                    label: `${a.kode_aset} — ${a.nama_aset}`,
                    searchText: `${a.kode_aset} ${a.nama_aset} ${a.alamat ?? ''}`,
                    description: a.alamat ?? undefined,
                  }))}
                  placeholder="Cari & pilih aset..."
                  searchPlaceholder="Ketik kode atau nama aset..."
                />
              </div>
              {errors.aset_id && <p className="text-xs text-red-500 mt-1">Pilih aset terlebih dahulu</p>}
              <p className="text-[11px] text-gray-500 mt-1">Aset belum ada? Tambahkan di <Link className="text-[#1B4F72] underline" to="/master/aset/dioptimalkan">Aset Dioptimalkan</Link> dan tautkan ke konsesi GIS-nya.</p>
            </div>
            <div>
              <Label htmlFor="ks-nama_mitra">Nama Mitra</Label>
              <Input id="ks-nama_mitra" {...register('nama_mitra')} className="mt-1" placeholder="Contoh: PT RSS Service System" />
              {errors.nama_mitra && <p className="text-xs text-red-500 mt-1">{errors.nama_mitra.message}</p>}
            </div>
            <div>
              <Label htmlFor="ks-no_perjanjian">No. Perjanjian</Label>
              <Input id="ks-no_perjanjian" {...register('no_perjanjian')} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="ks-skema_kerja_sama">Skema Kerja Sama</Label>
              <Input id="ks-skema_kerja_sama" {...register('skema_kerja_sama')} className="mt-1" placeholder="Contoh: sewa, KSO, BOT" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ks-tgl_mulai">Tanggal Mulai</Label>
                <Input type="date" id="ks-tgl_mulai" {...register('tgl_mulai')} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="ks-tgl_selesai">Tanggal Selesai</Label>
                <Input type="date" id="ks-tgl_selesai" {...register('tgl_selesai')} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="ks-no_wa_mitra">No. WhatsApp Mitra (628xxx)</Label>
              <Input id="ks-no_wa_mitra" {...register('no_wa_mitra')} className="mt-1" placeholder="628123456789" />
            </div>
            <div>
              <Label htmlFor="ks-keterangan">Keterangan</Label>
              <Textarea id="ks-keterangan" {...register('keterangan')} className="mt-1" rows={2} />
            </div>
            {submitError && <p role="alert" className={cn("text-sm text-destructive")}>{submitError} Isian tetap tersedia.</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => handleDialogChange(false)}>Batal</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Menyimpan...' : editTarget ? 'Simpan' : 'Tambah Program'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
