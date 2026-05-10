import React, { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { KatalogAset } from '@/types'
import { useAsetStore } from '@/store/asetStore'
import { useNJOPStore } from '@/store/njopStore'
import { useKJPPStore } from '@/store/kjppStore'
import { useKatalogStore } from '@/store/katalogStore'
import { formatRupiah } from '@/lib/utils'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Upload, Loader2, CheckCircle2 } from 'lucide-react'
import KatalogPreview from './KatalogPreview'
import type { KatalogFactsheetData, KatalogLayout } from '@/types'

const katalogSchema = z.object({
  aset_id: z.string().min(1, 'Pilih aset'),
  tagline: z.string().optional().default(''),
  coordinates_lat: z.string().optional().default(''),
  coordinates_lng: z.string().optional().default(''),
  sertifikat_detail: z.string().optional().default(''),
  sertifikat_pemilik: z.string().optional().default(''),
  zonasi: z.string().optional().default(''),
  topografi: z.string().optional().default(''),
  kondisi_bangunan: z.string().optional().default(''),
  rekomendasi_pengembangan: z.string().optional().default(''),
  rekomendasi_summary: z.string().optional().default(''),
  pic_nama: z.string().optional().default(''),
  pic_jabatan: z.string().optional().default(''),
  pic_phone: z.string().optional().default(''),
  pic_mobile: z.string().optional().default(''),
  pic_email: z.string().optional().default(''),
  pic_kantor: z.string().optional().default(''),
  tgl_dokumen: z.string().optional().default(''),
  ref_dokumen: z.string().optional().default(''),
  layout_preferensi: z.enum(['editorial', 'modular', 'compact']).default('editorial'),
})

type KatalogFormValues = z.infer<typeof katalogSchema>

interface AccessibilityItem { label: string; nilai: string; keterangan: string }
interface LingkunganItem { nama: string; jarak: string; tipe: string }
interface SkemaItem { kode: string; nama: string; catatan: string }

interface Props {
  existingKatalog?: KatalogAset | null
  onSuccess?: () => void
  onCancel?: () => void
}

const SLOT_IDS = [
  { id: 'ed-hero', label: 'Hero / Foto Utama' },
  { id: 'ed-aerial', label: 'Foto Udara / Aerial' },
  { id: 'ed-thumb-1', label: 'Foto 02' },
  { id: 'ed-thumb-2', label: 'Foto 03' },
  { id: 'ed-thumb-3', label: 'Foto 04' },
  { id: 'md-hero', label: 'Hero (Modular)' },
  { id: 'md-media-1', label: 'Eksterior (Modular)' },
  { id: 'md-media-2', label: 'Interior (Modular)' },
  { id: 'md-media-3', label: 'Aerial (Modular)' },
  { id: 'cp-hero', label: 'Hero (Compact)' },
  { id: 'cp-aerial', label: 'Aerial (Compact)' },
  { id: 'cp-thumb-1', label: 'Foto 02 (Compact)' },
  { id: 'cp-thumb-2', label: 'Foto 03 (Compact)' },
  { id: 'cp-thumb-3', label: 'Foto 04 (Compact)' },
]

export default function KatalogForm({ existingKatalog, onSuccess, onCancel }: Props) {
  const { daftarAset, fetchAset } = useAsetStore()
  const { fetchNJOP, getNJOPTerbaru } = useNJOPStore()
  const { fetchKJPP, getKJPPTerbaru } = useKJPPStore()
  const { createKatalog, updateKatalog, uploadFoto, fetchById, isSaving } = useKatalogStore()
  const [activeTab, setActiveTab] = useState('form')
  const [aksesItems, setAksesItems] = useState<AccessibilityItem[]>([])
  const [lingkItems, setLingkItems] = useState<LingkunganItem[]>([])
  const [skemaItems, setSkemaItems] = useState<SkemaItem[]>([])
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [savedKatalogId, setSavedKatalogId] = useState<string | null>(existingKatalog?.id ?? null)
  const [savedKatalog, setSavedKatalog] = useState<KatalogAset | null>(existingKatalog ?? null)
  const [saved, setSaved] = useState(!!existingKatalog)

  const katalogId = savedKatalogId || existingKatalog?.id || null

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<KatalogFormValues>({
    resolver: zodResolver(katalogSchema),
    defaultValues: {
      aset_id: existingKatalog?.aset_id ?? '',
      tagline: existingKatalog?.tagline ?? '',
      coordinates_lat: existingKatalog?.coordinates_lat ?? '',
      coordinates_lng: existingKatalog?.coordinates_lng ?? '',
      sertifikat_detail: existingKatalog?.sertifikat_detail ?? '',
      sertifikat_pemilik: existingKatalog?.sertifikat_pemilik ?? '',
      zonasi: existingKatalog?.zonasi ?? '',
      topografi: existingKatalog?.topografi ?? '',
      kondisi_bangunan: existingKatalog?.kondisi_bangunan ?? '',
      rekomendasi_pengembangan: existingKatalog?.rekomendasi_pengembangan ?? '',
      rekomendasi_summary: existingKatalog?.rekomendasi_summary ?? '',
      pic_nama: existingKatalog?.pic_nama ?? '',
      pic_jabatan: existingKatalog?.pic_jabatan ?? '',
      pic_phone: existingKatalog?.pic_phone ?? '',
      pic_mobile: existingKatalog?.pic_mobile ?? '',
      pic_email: existingKatalog?.pic_email ?? '',
      pic_kantor: existingKatalog?.pic_kantor ?? '',
      tgl_dokumen: existingKatalog?.tgl_dokumen ?? '',
      ref_dokumen: existingKatalog?.ref_dokumen ?? '',
      layout_preferensi: existingKatalog?.layout_preferensi ?? 'editorial',
    },
  })

  useEffect(() => {
    fetchAset()
    if (existingKatalog) {
      setAksesItems((existingKatalog.aksesibilitas ?? []).map(a => ({ label: a.label, nilai: a.nilai ?? '', keterangan: a.keterangan ?? '' })))
      setLingkItems((existingKatalog.lingkungan ?? []).map(l => ({ nama: l.nama, jarak: l.jarak ?? '', tipe: l.tipe ?? '' })))
      setSkemaItems((existingKatalog.skema ?? []).map(s => ({ kode: s.kode, nama: s.nama ?? '', catatan: s.catatan ?? '' })))
    }
  }, [existingKatalog])

  const addAkses = () => setAksesItems([...aksesItems, { label: '', nilai: '', keterangan: '' }])
  const removeAkses = (i: number) => setAksesItems(aksesItems.filter((_, idx) => idx !== i))
  const addLingk = () => setLingkItems([...lingkItems, { nama: '', jarak: '', tipe: '' }])
  const removeLingk = (i: number) => setLingkItems(lingkItems.filter((_, idx) => idx !== i))
  const addSkema = () => setSkemaItems([...skemaItems, { kode: '', nama: '', catatan: '' }])
  const removeSkema = (i: number) => setSkemaItems(skemaItems.filter((_, idx) => idx !== i))

  const onSubmit = async (values: KatalogFormValues) => {
    const akses = aksesItems.map((a, i) => ({ ...a, urutan: i }))
    const lingk = lingkItems.map((l, i) => ({ ...l, urutan: i }))
    const skm = skemaItems.map((s, i) => ({ ...s, urutan: i }))

    if (katalogId) {
      await updateKatalog(katalogId, { katalog: values, aksesibilitas: akses, lingkungan: lingk, skema: skm })
      setSaved(true)
    } else {
      const id = await createKatalog({ katalog: values, aksesibilitas: akses, lingkungan: lingk, skema: skm })
      if (id) {
        setSavedKatalogId(id)
        setSaved(true)
        // Refresh to get photo data
        const fresh = await fetchById(id)
        if (fresh) setSavedKatalog(fresh)
      }
    }
  }

  const handleUpload = async (slotId: string, file: File) => {
    if (!katalogId) return
    setUploadingSlot(slotId)
    await uploadFoto(katalogId, slotId, file)
    const fresh = await fetchById(katalogId)
    if (fresh) setSavedKatalog(fresh)
    setUploadingSlot(null)
  }

  const buildPreviewData = (): KatalogFactsheetData => {
    const v = watch()
    const aset = daftarAset.find(a => a.id === v.aset_id)
    // Extract region from alamat (e.g. "...Kota Makassar, Provinsi Sulawesi Selatan")
    const extractRegion = (alamat: string | null | undefined): string => {
      if (!alamat) return ''
      // Try to find "Kota ..." or "Kabupaten ..." + "Provinsi ..." pattern
      const parts = alamat.split(',').map(p => p.trim())
      const kota = parts.find(p => p.startsWith('Kota ') || p.startsWith('Kabupaten '))
      const prov = parts.find(p => p.startsWith('Provinsi '))
      if (kota && prov) return `${kota.replace(/^(Kota|Kabupaten) /, '')}, ${prov.replace(/^Provinsi /, '')}`
      if (kota) return kota.replace(/^(Kota|Kabupaten) /, '')
      // Fallback: use last two meaningful parts
      const filtered = parts.filter(p => p && !p.startsWith('Jl') && !p.startsWith('Kel') && !p.startsWith('Kec'))
      if (filtered.length >= 2) return `${filtered[filtered.length-2]}, ${filtered[filtered.length-1]}`
      return ''
    }
    const region = extractRegion(aset?.alamat) || extractRegion(selectedAset?.alamat)

    const land = aset?.luas_tanah_m2?.toLocaleString('id-ID') ?? '0'
    const build = aset?.luas_bangunan_m2?.toLocaleString('id-ID') ?? '0'

    // Compute NJOP data
    const njop = aset ? getNJOPTerbaru(aset.id) : null
    const njopPerM2 = njop ? formatRupiah(njop.nilai_tanah_per_m2) : ''

    // Compute KJPP data
    const kjpp = aset ? getKJPPTerbaru(aset.id) : null

    // Total nilai: prioritaskan KJPP, fallback ke potensi NJOP (3.33% tanah + 6.64% bangunan)
    let totalValueM = ''
    let appraisalDate = ''
    let appraisalSource = ''
    if (kjpp) {
      // Priority 1: KJPP assessment
      totalValueM = (kjpp.total_nilai / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      appraisalDate = new Date(kjpp.tgl_penilaian).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      appraisalSource = kjpp.nama_kjpp ?? 'Penilaian KJPP'
    } else if (njop && aset?.luas_tanah_m2) {
      // Priority 2: NJOP × tarif potensi
      const potensi = hitungPotensiNJOP({
        njopTanahPerM2: njop.nilai_tanah_per_m2,
        luasTanahM2: aset.luas_tanah_m2,
        njopBangunanPerM2: njop.nilai_bangunan_per_m2,
        luasBangunanM2: aset.luas_bangunan_m2 ?? 0,
      })
      totalValueM = (potensi.totalPotensi / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      appraisalDate = `NJOP ${njop.tahun}`
      appraisalSource = 'Estimasi Potensi NJOP (3,33% tanah / 6,64% bangunan)'
    }

    // Sertifikat: from aset data first, then form, then fallback
    const certDetail = (aset as any)?.sertifikat || v.sertifikat_detail || ''
    const certOwner = v.sertifikat_pemilik || (certDetail ? 'PT Perkebunan Nusantara I' : '')

    const photos: Record<string, string> = {}
    savedKatalog?.foto?.forEach(f => { photos[f.slot_id] = f.url })
    return {
      code: aset?.kode_aset ?? '',
      name: aset?.nama_aset ?? '',
      tagline: v.tagline ?? '',
      category: 'Tanah & Bangunan',
      status: aset?.status === 'aktif_ks' ? 'Dalam Kerjasama' : 'Tersedia untuk Kerjasama',
      address: aset?.alamat ?? '',
      region,
      coordinates: { lat: v.coordinates_lat ?? '', lng: v.coordinates_lng ?? '' },
      landArea: land,
      landAreaHa: aset?.luas_tanah_m2 ? (aset.luas_tanah_m2 / 10000).toLocaleString('id-ID', { maximumFractionDigits: 3 }) : '0',
      buildingArea: build,
      buildingCondition: v.kondisi_bangunan ?? '',
      certificate: certDetail,
      certificateOwner: certOwner,
      zoning: v.zonasi || 'Zona Pelayanan Umum — Skala Kota (K-3)',
      topography: v.topografi || 'Datar, elevasi 14–18 mdpl',
      njop: njopPerM2,
      totalValue: totalValueM,
      valueUnit: 'Miliar',
      appraisalDate,
      appraisalSource,
      recommendation: v.rekomendasi_pengembangan ?? '',
      recommendationSummary: v.rekomendasi_summary ?? '',
      partnershipSchemes: skemaItems.map(s => ({ code: s.kode, name: s.nama, note: s.catatan })),
      accessibility: aksesItems.map(a => ({ label: a.label, value: a.nilai, sub: a.keterangan })),
      surroundings: lingkItems.map(l => ({ name: l.nama, distance: l.jarak, type: l.tipe })),
      pic: {
        name: v.pic_nama ?? '', title: v.pic_jabatan ?? '',
        phone: v.pic_phone ?? '', mobile: v.pic_mobile ?? '',
        email: v.pic_email ?? '', office: v.pic_kantor ?? '',
      },
      documentDate: v.tgl_dokumen ?? '',
      documentRef: v.ref_dokumen ?? '',
      photos,
    }
  }

  const selectedAsetId = watch('aset_id')
  const selectedAset = daftarAset.find(a => a.id === selectedAsetId)

  // Fetch NJOP & KJPP when selected aset changes, auto-populate sertifikat
  useEffect(() => {
    if (selectedAsetId) {
      fetchNJOP(selectedAsetId)
      fetchKJPP(selectedAsetId)
      // Auto-populate sertifikat from aset data
      if (selectedAset) {
        const sertifikat = (selectedAset as any).sertifikat
        if (sertifikat && !watch('sertifikat_detail')) {
          setValue('sertifikat_detail', sertifikat)
        }
        if (sertifikat && !watch('sertifikat_pemilik')) {
          setValue('sertifikat_pemilik', 'PT Perkebunan Nusantara I')
        }
      }
    }
  }, [selectedAsetId, selectedAset, fetchNJOP, fetchKJPP, setValue, watch])

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="form">Isi Data</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
        {katalogId && <TabsTrigger value="foto">Upload Foto</TabsTrigger>}
      </TabsList>

      <TabsContent value="form">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Aset Selection */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pilih Aset</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Aset *</Label>
                <Select
                  value={selectedAsetId}
                  onValueChange={(v) => {
                    setValue('aset_id', v)
                    const a = daftarAset.find(x => x.id === v)
                    if (a) setValue('ref_dokumen', `KAT/${a.kode_aset}/V/${new Date().getFullYear()}-001`)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih aset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {daftarAset.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.kode_aset} — {a.nama_aset}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.aset_id && <p className="text-red-500 text-xs mt-1">{errors.aset_id.message}</p>}
              </div>
              {selectedAset && (
                <div className="grid grid-cols-4 gap-4 p-3 bg-muted rounded text-xs">
                  <div><span className="text-muted-foreground">Alamat:</span> {selectedAset.alamat || '-'}</div>
                  <div><span className="text-muted-foreground">Luas Tanah:</span> {selectedAset.luas_tanah_m2?.toLocaleString('id-ID') || '-'} m²</div>
                  <div><span className="text-muted-foreground">Luas Bangunan:</span> {selectedAset.luas_bangunan_m2?.toLocaleString('id-ID') || '-'} m²</div>
                  <div><span className="text-muted-foreground">Status:</span> {selectedAset.status}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tagline & Coordinates */}
          <Card>
            <CardHeader><CardTitle className="text-base">Judul & Lokasi</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tagline</Label>
                <Input {...register('tagline')} placeholder="Deskripsi singkat menarik untuk cover" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Koordinat Latitude</Label><Input {...register('coordinates_lat')} placeholder='-5.1864' /></div>
                <div><Label>Koordinat Longitude</Label><Input {...register('coordinates_lng')} placeholder='119.4337' /></div>
              </div>
            </CardContent>
          </Card>

          {/* Sertifikat, Zonasi, dll */}
          <Card>
            <CardHeader><CardTitle className="text-base">Spesifikasi Aset</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><Label>Sertifikat Detail</Label><Input {...register('sertifikat_detail')} placeholder="HM (Hak Milik) – No. 4421 / Mangasa" /></div>
              <div><Label>Pemilik Sertifikat</Label><Input {...register('sertifikat_pemilik')} placeholder="PT Perkebunan Nusantara I" /></div>
              <div><Label>Zonasi</Label><Input {...register('zonasi')} placeholder="Zona Pelayanan Umum — Skala Kota (K-3)" /></div>
              <div><Label>Topografi</Label><Input {...register('topografi')} placeholder="Datar, elevasi 14–18 mdpl" /></div>
              <div className="col-span-2"><Label>Kondisi Bangunan</Label><Input {...register('kondisi_bangunan')} placeholder="Eksisting bangunan gudang & mess" /></div>
            </CardContent>
          </Card>

          {/* Rekomendasi */}
          <Card>
            <CardHeader><CardTitle className="text-base">Rekomendasi Pengembangan</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Judul Rekomendasi</Label><Input {...register('rekomendasi_pengembangan')} placeholder="Sport Center & Komersial Pendukung" /></div>
              <div><Label>Ringkasan Rekomendasi</Label><Textarea {...register('rekomendasi_summary')} placeholder="Jelaskan alasan rekomendasi..." rows={3} /></div>
            </CardContent>
          </Card>

          {/* Skema */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Skema Kerjasama</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addSkema}><Plus className="w-3 h-3 mr-1" /> Tambah</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {skemaItems.length === 0 && <p className="text-xs text-muted-foreground">Belum ada skema. Klik Tambah.</p>}
              {skemaItems.map((s, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Kode (BOT, KSO, JV)" value={s.kode} onChange={e => { const n = [...skemaItems]; n[i].kode = e.target.value; setSkemaItems(n) }} className="w-[100px]" />
                  <Input placeholder="Nama skema" value={s.nama} onChange={e => { const n = [...skemaItems]; n[i].nama = e.target.value; setSkemaItems(n) }} className="flex-1" />
                  <Input placeholder="Catatan (tenor, dll)" value={s.catatan} onChange={e => { const n = [...skemaItems]; n[i].catatan = e.target.value; setSkemaItems(n) }} className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSkema(i)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Aksesibilitas */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Aksesibilitas</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addAkses}><Plus className="w-3 h-3 mr-1" /> Tambah</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {aksesItems.length === 0 && <p className="text-xs text-muted-foreground">Belum ada data aksesibilitas.</p>}
              {aksesItems.map((a, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Label" value={a.label} onChange={e => { const n = [...aksesItems]; n[i].label = e.target.value; setAksesItems(n) }} className="w-[180px]" />
                  <Input placeholder="Nilai (jarak)" value={a.nilai} onChange={e => { const n = [...aksesItems]; n[i].nilai = e.target.value; setAksesItems(n) }} className="w-[100px]" />
                  <Input placeholder="Keterangan" value={a.keterangan} onChange={e => { const n = [...aksesItems]; n[i].keterangan = e.target.value; setAksesItems(n) }} className="flex-1" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeAkses(i)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Lingkungan */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Lingkungan Sekitar</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLingk}><Plus className="w-3 h-3 mr-1" /> Tambah</Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {lingkItems.length === 0 && <p className="text-xs text-muted-foreground">Belum ada data lingkungan.</p>}
              {lingkItems.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <Input placeholder="Nama tempat" value={l.nama} onChange={e => { const n = [...lingkItems]; n[i].nama = e.target.value; setLingkItems(n) }} className="flex-1" />
                  <Input placeholder="Jarak" value={l.jarak} onChange={e => { const n = [...lingkItems]; n[i].jarak = e.target.value; setLingkItems(n) }} className="w-[80px]" />
                  <Input placeholder="Tipe" value={l.tipe} onChange={e => { const n = [...lingkItems]; n[i].tipe = e.target.value; setLingkItems(n) }} className="w-[120px]" />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeLingk(i)}><Trash2 className="w-3 h-3 text-red-500" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Kontak PIC */}
          <Card>
            <CardHeader><CardTitle className="text-base">Kontak PIC</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><Label>Nama PIC</Label><Input {...register('pic_nama')} placeholder="Andi Pratama, S.E." /></div>
              <div><Label>Jabatan</Label><Input {...register('pic_jabatan')} placeholder="Kepala Sub-Divisi Aset & Kerjasama Strategis" /></div>
              <div><Label>Telepon</Label><Input {...register('pic_phone')} placeholder="+62 411 555 0182" /></div>
              <div><Label>Mobile / WA</Label><Input {...register('pic_mobile')} placeholder="+62 812 4400 7711" /></div>
              <div><Label>Email</Label><Input {...register('pic_email')} placeholder="asset.kerjasama@ptpn1.co.id" /></div>
              <div><Label>Kantor</Label><Input {...register('pic_kantor')} placeholder="Kantor Wilayah PTPN I — Makassar" /></div>
            </CardContent>
          </Card>

          {/* Dokumen Meta */}
          <Card>
            <CardHeader><CardTitle className="text-base">Dokumen</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <Label>Tanggal Dokumen</Label>
                <Input {...register('tgl_dokumen')} placeholder={new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} />
              </div>
              <div>
                <Label>Ref Dokumen</Label>
                <Input {...register('ref_dokumen')} placeholder="KAT/PTPN1/AST/V/2026-001" />
              </div>
              <div>
                <Label>Layout Default</Label>
                <Select value={watch('layout_preferensi')} onValueChange={(v) => setValue('layout_preferensi', v as KatalogLayout)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editorial">Editorial</SelectItem>
                    <SelectItem value="modular">Modular</SelectItem>
                    <SelectItem value="compact">Compact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Action buttons */}
          {saved && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Katalog berhasil disimpan. Sekarang upload foto atau klik Selesai.
            </div>
          )}
          <div className="flex gap-3 justify-end">
            {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Batal</Button>}
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Menyimpan...</> : saved ? 'Simpan Perubahan' : 'Buat Katalog'}
            </Button>
            {saved && (
              <Button type="button" variant="default" onClick={() => onSuccess?.()}>Selesai</Button>
            )}
          </div>
        </form>
      </TabsContent>

      {/* Foto Tab */}
      <TabsContent value="foto">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload Foto Katalog</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              Pilih file gambar untuk setiap slot foto. Foto langsung muncul di preview.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SLOT_IDS.map(slot => {
                const existingUrl = savedKatalog?.foto?.find(f => f.slot_id === slot.id)?.url
                return (
                  <div key={slot.id} className="flex items-center gap-2 p-2 border rounded">
                    {existingUrl && (
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                        <img src={existingUrl} alt={slot.label} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs truncate block">{slot.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{slot.id}</span>
                    </div>
                    <label className="cursor-pointer flex-shrink-0">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={!katalogId || uploadingSlot === slot.id}
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (file && katalogId) await handleUpload(slot.id, file)
                        }}
                      />
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20">
                        {uploadingSlot === slot.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                        {existingUrl ? 'Ganti' : 'Upload'}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Preview Tab */}
      <TabsContent value="preview">
        <div className="mb-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab('form')}>← Kembali ke Form</Button>
        </div>
        <KatalogPreview data={buildPreviewData()} />
      </TabsContent>
    </Tabs>
  )
}
