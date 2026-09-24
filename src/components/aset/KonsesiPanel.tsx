import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { SlideOver } from '@/components/common/SlideOver'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useKonsesiStore } from '@/store/konsesiStore'
import { useKonsesiMasterStore } from '@/store/konsesiMasterStore'
import { useAsetStore } from '@/store/asetStore'
import { useAuthStore } from '@/store/authStore'
import { formatAngka, formatRupiah, formatTanggal } from '@/lib/utils'
import { KondisiBangunan, KonsesiBangunan, KonsesiSPPT } from '@/types'
import { StatusBadge } from '@/components/common/StatusBadge'

type Tab = 'info' | 'sppt' | 'bangunan'

const KONDISI_LABEL: Record<KondisiBangunan, string> = { baik: 'Baik', sedang: 'Sedang', rusak_ringan: 'Rusak ringan', rusak_berat: 'Rusak berat' }
const selectClass = 'mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm'
const optionalNumber = z.preprocess(value => value === '' || value === null ? undefined : value, z.coerce.number().min(0).optional())

function hectares(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 4 })} ha`
}

const profilSchema = z.object({ kode_sap: z.string().optional(), alamat_jalan: z.string().optional(), catatan: z.string().optional() })
type ProfilForm = z.infer<typeof profilSchema>

const spptSchema = z.object({
  tahun: z.coerce.number().int().min(2000).max(2100),
  no_sppt: z.string().optional(),
  luas_tanah_sppt_m2: z.coerce.number().min(0),
  luas_bangunan_sppt_m2: z.coerce.number().min(0),
  njop_tanah_per_m2: z.coerce.number().min(0),
  njop_bangunan_per_m2: z.coerce.number().min(0),
  nilai_pbb: optionalNumber,
  tgl_jatuh_tempo: z.string().optional(),
  status_bayar: z.enum(['belum', 'lunas']),
  tgl_bayar: z.string().optional(),
  catatan: z.string().optional(),
})
type SPPTForm = z.infer<typeof spptSchema>

const bangunanSchema = z.object({
  nama: z.string().min(1, 'Nama bangunan wajib diisi'),
  luas_m2: z.coerce.number().min(0),
  jumlah_lantai: optionalNumber,
  tahun_bangun: optionalNumber,
  kondisi: z.string().optional(),
  keterangan: z.string().optional(),
})
type BangunanForm = z.infer<typeof bangunanSchema>

const blank = (value: string | undefined) => value?.trim() ? value.trim() : null

export function KonsesiPanel({ konsesiKey, onClose }: { konsesiKey: string | null; onClose: () => void }) {
  const navigate = useNavigate()
  const { daftarKonsesi, fetchKonsesi } = useKonsesiStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { profil, sppt, bangunan, isLoading, fetchDetail, saveProfil, saveSPPT, deleteSPPT, saveBangunan, deleteBangunan } = useKonsesiMasterStore()
  const role = useAuthStore(state => state.user?.role)
  const canEdit = role !== 'viewer' && role !== 'viewer_aset'
  const [tab, setTab] = useState<Tab>('info')
  const [editingSPPT, setEditingSPPT] = useState<KonsesiSPPT | 'new' | null>(null)
  const [editingBangunan, setEditingBangunan] = useState<KonsesiBangunan | 'new' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const konsesi = daftarKonsesi.find(item => item.key === konsesiKey) ?? null
  const linkedAset = daftarAset.filter(aset => aset.aset_konsesi?.some(link => link.konsesi_key === konsesiKey))

  const profilForm = useForm<ProfilForm>({ resolver: zodResolver(profilSchema) })
  const spptForm = useForm<SPPTForm>({ resolver: zodResolver(spptSchema) })
  const bangunanForm = useForm<BangunanForm>({ resolver: zodResolver(bangunanSchema) })

  useEffect(() => {
    if (!konsesiKey) return
    setTab('info'); setEditingSPPT(null); setEditingBangunan(null); setConfirmDelete(null); setMessage('')
    void fetchKonsesi(); fetchAset(); void fetchDetail(konsesiKey)
  }, [konsesiKey])
  useEffect(() => {
    profilForm.reset({ kode_sap: profil?.kode_sap ?? '', alamat_jalan: profil?.alamat_jalan ?? '', catatan: profil?.catatan ?? '' })
  }, [profil, konsesiKey])

  const openSPPT = (row: KonsesiSPPT | 'new') => {
    setEditingSPPT(row)
    const latest = sppt[0]
    spptForm.reset(row === 'new' ? {
      tahun: new Date().getFullYear(), no_sppt: latest?.no_sppt ?? '', status_bayar: 'belum',
      luas_tanah_sppt_m2: latest?.luas_tanah_sppt_m2 ?? 0, luas_bangunan_sppt_m2: latest?.luas_bangunan_sppt_m2 ?? 0,
      njop_tanah_per_m2: latest?.njop_tanah_per_m2 ?? 0, njop_bangunan_per_m2: latest?.njop_bangunan_per_m2 ?? 0,
    } : { ...row, no_sppt: row.no_sppt ?? '', nilai_pbb: row.nilai_pbb ?? undefined, tgl_jatuh_tempo: row.tgl_jatuh_tempo ?? '', tgl_bayar: row.tgl_bayar ?? '', catatan: row.catatan ?? '' })
  }
  const openBangunan = (row: KonsesiBangunan | 'new') => {
    setEditingBangunan(row)
    bangunanForm.reset(row === 'new' ? { nama: '', luas_m2: 0 } : { ...row, jumlah_lantai: row.jumlah_lantai ?? undefined, tahun_bangun: row.tahun_bangun ?? undefined, kondisi: row.kondisi ?? '', keterangan: row.keterangan ?? '' })
  }

  const submitProfil = profilForm.handleSubmit(async data => {
    if (!konsesiKey) return
    const ok = await saveProfil({ konsesi_key: konsesiKey, kode_sap: blank(data.kode_sap), alamat_jalan: blank(data.alamat_jalan), catatan: blank(data.catatan) })
    setMessage(ok ? 'Informasi bidang tersimpan.' : 'Gagal menyimpan informasi bidang.')
  })
  const submitSPPT = spptForm.handleSubmit(async data => {
    if (!konsesiKey || !editingSPPT) return
    const ok = await saveSPPT({
      konsesi_key: konsesiKey, tahun: data.tahun, no_sppt: blank(data.no_sppt),
      luas_tanah_sppt_m2: data.luas_tanah_sppt_m2, luas_bangunan_sppt_m2: data.luas_bangunan_sppt_m2,
      njop_tanah_per_m2: data.njop_tanah_per_m2, njop_bangunan_per_m2: data.njop_bangunan_per_m2,
      nilai_pbb: data.nilai_pbb ?? null, tgl_jatuh_tempo: blank(data.tgl_jatuh_tempo), status_bayar: data.status_bayar,
      tgl_bayar: data.status_bayar === 'lunas' ? blank(data.tgl_bayar) : null, catatan: blank(data.catatan),
    }, editingSPPT === 'new' ? undefined : editingSPPT.id)
    if (ok) setEditingSPPT(null)
    setMessage(ok ? 'SPPT tersimpan.' : 'Gagal menyimpan SPPT.')
  })
  const submitBangunan = bangunanForm.handleSubmit(async data => {
    if (!konsesiKey || !editingBangunan) return
    const ok = await saveBangunan({
      konsesi_key: konsesiKey, nama: data.nama.trim(), luas_m2: data.luas_m2,
      jumlah_lantai: data.jumlah_lantai ?? null, tahun_bangun: data.tahun_bangun ?? null,
      kondisi: (blank(data.kondisi) as KondisiBangunan | null), keterangan: blank(data.keterangan),
    }, editingBangunan === 'new' ? undefined : editingBangunan.id)
    if (ok) setEditingBangunan(null)
    setMessage(ok ? 'Bangunan tersimpan.' : 'Gagal menyimpan bangunan.')
  })

  const tabs: [Tab, string][] = [['info', 'Informasi'], ['sppt', `SPPT & NJOP (${sppt.length})`], ['bangunan', `Bangunan (${bangunan.length})`]]

  return <SlideOver open={!!konsesiKey} onClose={onClose} title={konsesi?.nama ?? 'Data bidang'} width="max-w-2xl">
    {!konsesi ? <p className="text-sm text-gray-500">Memuat data konsesi…</p> : <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        {konsesi.record_state === 'draf' && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">Draf GIS</span>}
        <span>{[konsesi.lokasi, konsesi.kecamatan && `Kec. ${konsesi.kecamatan}`, konsesi.kabupaten, konsesi.provinsi].filter(Boolean).join(' · ')}</span>
      </div>
      <div className="flex gap-1 border-b">
        {tabs.map(([key, label]) => <button key={key} type="button" onClick={() => { setTab(key); setMessage('') }} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === key ? 'border-[#1B4F72] text-[#1B4F72]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>)}
      </div>
      {message && <p className="rounded bg-blue-50 px-3 py-2 text-xs text-blue-900">{message}</p>}
      {isLoading && <p className="text-xs text-gray-400">Memuat…</p>}

      {tab === 'info' && <div className="space-y-5">
        <section className="rounded-lg border bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">Data hak dari GIS</p>
            <Button type="button" variant="outline" size="sm" onClick={() => { onClose(); navigate(`/gis?bbox=${encodeURIComponent(konsesi.bbox)}`) }}><MapPin size={14} /> Ubah di peta</Button>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {([
              ['Jenis alas hak', konsesi.jenis_alas_hak], ['Nomor alas hak', konsesi.nomor_alas_hak],
              ['Luas sertifikat', konsesi.luas_dokumen_ha === null ? null : hectares(konsesi.luas_dokumen_ha)], ['Luas poligon GIS', hectares(konsesi.luas_gis_ha)],
              ['Kebun', konsesi.lokasi], ['Wilayah', [konsesi.kecamatan && `Kec. ${konsesi.kecamatan}`, konsesi.kabupaten].filter(Boolean).join(', ')],
            ] as [string, string | null][]).map(([label, value]) => <div key={label}><dt className="text-xs text-gray-500">{label}</dt><dd className={value ? 'font-medium text-gray-900' : 'text-amber-700'}>{value || 'Belum diisi di GIS'}</dd></div>)}
          </dl>
          <p className="mt-3 text-[11px] text-gray-500">Data hak, luas, dan batas bidang hanya diubah di peta agar semua modul membaca sumber yang sama.</p>
        </section>
        <form onSubmit={submitProfil} className="space-y-3">
          <p className="text-sm font-semibold text-gray-800">Informasi pelengkap</p>
          <div><Label>Kode aset SAP</Label><Input {...profilForm.register('kode_sap')} className="mt-1 font-mono" disabled={!canEdit} placeholder="Nomor aset di SAP" /></div>
          <div><Label>Alamat jalan</Label><Textarea {...profilForm.register('alamat_jalan')} className="mt-1" rows={2} disabled={!canEdit} placeholder="Nama jalan dan nomor. Desa hingga provinsi terisi otomatis dari GIS." /></div>
          <div><Label>Catatan</Label><Textarea {...profilForm.register('catatan')} className="mt-1" rows={2} disabled={!canEdit} /></div>
          {canEdit && <Button type="submit" className="bg-[#1B4F72]" disabled={profilForm.formState.isSubmitting}>Simpan informasi</Button>}
        </form>
        <section>
          <p className="mb-2 text-sm font-semibold text-gray-800">Aset dioptimalkan di bidang ini</p>
          {linkedAset.length ? <ul className="space-y-1 text-sm">{linkedAset.map(aset => <li key={aset.id} className="flex items-center gap-2"><span className="font-mono text-[11px] text-gray-500">{aset.kode_aset}</span><span>{aset.nama_aset}</span><StatusBadge type="aset" value={aset.status} /></li>)}</ul>
            : <p className="text-xs text-gray-500">Belum ada. Tautkan dari menu Aset Dioptimalkan.</p>}
        </section>
      </div>}

      {tab === 'sppt' && <div className="space-y-3">
        <p className="text-xs text-gray-500">Satu SPPT per tahun mengisi NJOP dan PBB sekaligus. PBB untuk kerja sama dihitung proporsional dari luas KS terhadap bidang ini.</p>
        {canEdit && !editingSPPT && <Button type="button" size="sm" onClick={() => openSPPT('new')}><Plus size={14} /> Tambah SPPT</Button>}
        {editingSPPT && <form onSubmit={submitSPPT} className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Tahun</Label><Input type="number" {...spptForm.register('tahun')} className="mt-1" /></div>
            <div><Label>No. SPPT / NOP</Label><Input {...spptForm.register('no_sppt')} className="mt-1 font-mono" /></div>
            <div><Label>Luas tanah SPPT (m²)</Label><Input type="number" step="0.01" {...spptForm.register('luas_tanah_sppt_m2')} className="mt-1" /></div>
            <div><Label>Luas bangunan SPPT (m²)</Label><Input type="number" step="0.01" {...spptForm.register('luas_bangunan_sppt_m2')} className="mt-1" /></div>
            <div><Label>NJOP tanah per m² (Rp)</Label><Input type="number" step="0.01" {...spptForm.register('njop_tanah_per_m2')} className="mt-1" /></div>
            <div><Label>NJOP bangunan per m² (Rp)</Label><Input type="number" step="0.01" {...spptForm.register('njop_bangunan_per_m2')} className="mt-1" /></div>
            <div><Label>PBB terutang (Rp)</Label><Input type="number" step="0.01" {...spptForm.register('nilai_pbb')} className="mt-1" placeholder="Kosongkan bila hanya NJOP" /></div>
            <div><Label>Jatuh tempo</Label><Input type="date" {...spptForm.register('tgl_jatuh_tempo')} className="mt-1" /></div>
            <div><Label>Status bayar</Label><select {...spptForm.register('status_bayar')} className={selectClass}><option value="belum">Belum dibayar</option><option value="lunas">Lunas</option></select></div>
            {spptForm.watch('status_bayar') === 'lunas' && <div><Label>Tanggal bayar</Label><Input type="date" {...spptForm.register('tgl_bayar')} className="mt-1" /></div>}
          </div>
          <div><Label>Catatan</Label><Input {...spptForm.register('catatan')} className="mt-1" /></div>
          {Object.keys(spptForm.formState.errors).length > 0 && <p className="text-xs text-red-600">Periksa kembali isian tahun dan angka.</p>}
          <div className="flex gap-2"><Button type="submit" className="bg-[#1B4F72]" disabled={spptForm.formState.isSubmitting}>Simpan SPPT</Button><Button type="button" variant="outline" onClick={() => setEditingSPPT(null)}>Batal</Button></div>
        </form>}
        {sppt.length === 0 && !editingSPPT ? <p className="rounded border border-dashed p-4 text-center text-sm text-gray-500">Belum ada SPPT untuk bidang ini.</p>
          : <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="px-3 py-2">Tahun</th><th className="px-3 py-2 text-right">NJOP tanah/m²</th><th className="px-3 py-2 text-right">NJOP bgn/m²</th><th className="px-3 py-2 text-right">PBB</th><th className="px-3 py-2">Status</th><th /></tr></thead>
            <tbody className="divide-y">{sppt.map(row => <tr key={row.id}>
              <td className="px-3 py-2"><p className="font-medium">{row.tahun}</p><p className="font-mono text-[11px] text-gray-500">{row.no_sppt ?? '—'}</p></td>
              <td className="px-3 py-2 text-right">{formatRupiah(row.njop_tanah_per_m2)}</td>
              <td className="px-3 py-2 text-right">{formatRupiah(row.njop_bangunan_per_m2)}</td>
              <td className="px-3 py-2 text-right">{row.nilai_pbb === null ? '—' : formatRupiah(row.nilai_pbb)}{row.tgl_jatuh_tempo && <p className="text-[11px] text-gray-500">JT {formatTanggal(row.tgl_jatuh_tempo)}</p>}</td>
              <td className="px-3 py-2">{row.status_bayar === 'lunas' ? <span className="text-emerald-700">Lunas</span> : <span className="text-amber-700">Belum</span>}</td>
              <td className="px-3 py-2 text-right">{canEdit && (confirmDelete === row.id
                ? <span className="inline-flex gap-1"><Button type="button" size="sm" variant="destructive" onClick={() => { void deleteSPPT(row.id); setConfirmDelete(null) }}>Hapus</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Batal</Button></span>
                : <span className="inline-flex"><Button type="button" variant="ghost" size="icon" onClick={() => openSPPT(row)}><Pencil size={14} /></Button><Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => setConfirmDelete(row.id)}><Trash2 size={14} /></Button></span>)}</td>
            </tr>)}</tbody>
          </table></div>}
      </div>}

      {tab === 'bangunan' && <div className="space-y-3">
        <p className="text-xs text-gray-500">Luas bangunan tidak ada di GIS, jadi diisi di sini sekali untuk dipakai NJOP bangunan, potensi, dan kerja sama.</p>
        {canEdit && !editingBangunan && <Button type="button" size="sm" onClick={() => openBangunan('new')}><Plus size={14} /> Tambah bangunan</Button>}
        {editingBangunan && <form onSubmit={submitBangunan} className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <div><Label>Nama bangunan</Label><Input {...bangunanForm.register('nama')} className="mt-1" placeholder="Contoh: Gedung Timur" />{bangunanForm.formState.errors.nama && <p className="mt-1 text-xs text-red-600">{bangunanForm.formState.errors.nama.message}</p>}</div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Luas bangunan (m²)</Label><Input type="number" step="0.01" {...bangunanForm.register('luas_m2')} className="mt-1" /></div>
            <div><Label>Jumlah lantai</Label><Input type="number" {...bangunanForm.register('jumlah_lantai')} className="mt-1" /></div>
            <div><Label>Tahun dibangun</Label><Input type="number" {...bangunanForm.register('tahun_bangun')} className="mt-1" /></div>
            <div><Label>Kondisi</Label><select {...bangunanForm.register('kondisi')} className={selectClass}><option value="">—</option>{Object.entries(KONDISI_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
          <div><Label>Keterangan</Label><Input {...bangunanForm.register('keterangan')} className="mt-1" /></div>
          <div className="flex gap-2"><Button type="submit" className="bg-[#1B4F72]" disabled={bangunanForm.formState.isSubmitting}>Simpan bangunan</Button><Button type="button" variant="outline" onClick={() => setEditingBangunan(null)}>Batal</Button></div>
        </form>}
        {bangunan.length === 0 && !editingBangunan ? <p className="rounded border border-dashed p-4 text-center text-sm text-gray-500">Belum ada bangunan tercatat di bidang ini.</p>
          : <ul className="divide-y rounded-lg border">{bangunan.map(row => <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
            <div><p className="font-medium text-gray-900">{row.nama}</p><p className="text-xs text-gray-500">{formatAngka(row.luas_m2)} m²{row.jumlah_lantai ? ` · ${row.jumlah_lantai} lantai` : ''}{row.tahun_bangun ? ` · ${row.tahun_bangun}` : ''}{row.kondisi ? ` · ${KONDISI_LABEL[row.kondisi]}` : ''}</p></div>
            {canEdit && (confirmDelete === row.id
              ? <span className="inline-flex gap-1"><Button type="button" size="sm" variant="destructive" onClick={() => { void deleteBangunan(row.id); setConfirmDelete(null) }}>Hapus</Button><Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>Batal</Button></span>
              : <span className="inline-flex"><Button type="button" variant="ghost" size="icon" onClick={() => openBangunan(row)}><Pencil size={14} /></Button><Button type="button" variant="ghost" size="icon" className="text-red-500" onClick={() => setConfirmDelete(row.id)}><Trash2 size={14} /></Button></span>)}
          </li>)}</ul>}
      </div>}
    </div>}
  </SlideOver>
}
