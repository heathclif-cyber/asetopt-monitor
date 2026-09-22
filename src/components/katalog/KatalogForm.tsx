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
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Loader2, CheckCircle2 } from 'lucide-react'
import KatalogPreview from './KatalogPreview'
import { CANVA_PHOTO_SLOTS, canvaPhoto } from './canva-layout'
import type { KatalogFactsheetData } from '@/types'

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
  layout_preferensi: z.literal('canva_landscape').default('canva_landscape'),
})

type KatalogFormValues = z.infer<typeof katalogSchema>

interface AccessibilityItem { label: string; nilai: string; keterangan: string }
interface TollInfo { name: string; distance: string; time: string }

const CARD_DIRECTIONS = ['N', 'W', 'E', 'S'] as const
const emptyDirectionCards = (): AccessibilityItem[] => CARD_DIRECTIONS.map(direction => ({ label: `${direction}:`, nilai: '', keterangan: '' }))

function makeAccessFormItems(items: { label: string; nilai?: string | null; keterangan?: string | null }[]) {
  const cards = emptyDirectionCards()
  const radius = items.find(item => /^radius$/i.test(item.label.trim()))?.nilai ?? ''
  const toll = items.find(item => /tol|toll|jalan|road/i.test(item.label))
  const pending: string[] = []
  for (const item of items) {
    const raw = item.label.trim()
    if (/^radius$/i.test(raw) || /tol|toll|jalan|road/i.test(raw)) continue
    const match = raw.match(/^([NWES])(?:\s*[:–-]\s*|$)/i)
    const content = match
      ? [raw.slice(match[0].length).trim(), item.nilai, item.keterangan].filter(Boolean).join('\n')
      : [raw, item.nilai, item.keterangan].filter(Boolean).join('\n')
    const index = match ? CARD_DIRECTIONS.indexOf(match[1].toUpperCase() as typeof CARD_DIRECTIONS[number]) : -1
    if (index >= 0 && !cards[index].keterangan) cards[index].keterangan = content
    else if (content) pending.push(content)
  }
  cards.forEach(card => { if (!card.keterangan && pending.length) card.keterangan = pending.shift() ?? '' })
  return {
    cards,
    radius,
    toll: { name: toll?.label ?? '', distance: toll?.nilai ?? '', time: toll?.keterangan ?? '' },
  }
}

interface Props {
  existingKatalog?: KatalogAset | null
  onSuccess?: () => void
  onCancel?: () => void
}

const SLOT_IDS = CANVA_PHOTO_SLOTS

export default function KatalogForm({ existingKatalog, onSuccess, onCancel }: Props) {
  const { daftarAset, fetchAset } = useAsetStore()
  const { fetchNJOP, getNJOPTerbaru } = useNJOPStore()
  const { fetchKJPP, getKJPPTerbaru } = useKJPPStore()
  const { createKatalog, updateKatalog, uploadFoto, fetchById, isSaving } = useKatalogStore()
  const [activeTab, setActiveTab] = useState('form')
  const [aksesItems, setAksesItems] = useState<AccessibilityItem[]>(emptyDirectionCards)
  const [radius, setRadius] = useState('')
  const [tollInfo, setTollInfo] = useState<TollInfo>({ name: '', distance: '', time: '' })
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
      layout_preferensi: 'canva_landscape',
    },
  })

  useEffect(() => {
    fetchAset()
    if (existingKatalog) {
      const access = makeAccessFormItems(existingKatalog.aksesibilitas ?? [])
      setAksesItems(access.cards)
      setRadius(access.radius)
      setTollInfo(access.toll)
    }
  }, [existingKatalog])

  const onSubmit = async (values: KatalogFormValues) => {
    const akses = [
      ...aksesItems.map((a, i) => ({ label: `${CARD_DIRECTIONS[i]}:`, nilai: '', keterangan: a.keterangan.trim(), urutan: i })),
      ...(radius.trim() ? [{ label: 'Radius', nilai: radius.trim(), keterangan: '', urutan: 4 }] : []),
      ...(tollInfo.name.trim() || tollInfo.distance.trim() || tollInfo.time.trim()
        ? [{ label: tollInfo.name.trim() || 'Akses jalan', nilai: tollInfo.distance.trim(), keterangan: tollInfo.time.trim(), urutan: 5 }]
        : []),
    ]

    if (katalogId) {
      await updateKatalog(katalogId, { katalog: values, aksesibilitas: akses })
      setSaved(true)
    } else {
      const id = await createKatalog({ katalog: values, aksesibilitas: akses, lingkungan: [], skema: [] })
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
      partnershipSchemes: [],
      accessibility: [
        ...aksesItems.map((a, i) => ({ label: `${CARD_DIRECTIONS[i]}:`, value: '', sub: a.keterangan })),
        ...(radius.trim() ? [{ label: 'Radius', value: radius.trim(), sub: '' }] : []),
        ...(tollInfo.name.trim() || tollInfo.distance.trim() || tollInfo.time.trim() ? [{ label: tollInfo.name.trim() || 'Akses jalan', value: tollInfo.distance.trim(), sub: tollInfo.time.trim() }] : []),
      ],
      surroundings: [],
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
                <SearchableSelect
                  value={selectedAsetId}
                  onValueChange={(v) => {
                    setValue('aset_id', v)
                    const a = daftarAset.find(x => x.id === v)
                    if (a) setValue('ref_dokumen', `KAT/${a.kode_aset}/V/${new Date().getFullYear()}-001`)
                  }}
                  options={daftarAset.map(a => ({
                    value: a.id,
                    label: `${a.kode_aset} — ${a.nama_aset}`,
                    searchText: `${a.kode_aset} ${a.nama_aset} ${a.alamat ?? ''}`,
                    description: a.alamat ?? undefined,
                  }))}
                  placeholder="Cari & pilih aset..."
                  searchPlaceholder="Ketik kode atau nama aset..."
                />
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

          {/* Coordinates */}
          <Card>
            <CardHeader><CardTitle className="text-base">Lokasi untuk QR</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Koordinat dipakai untuk QR “location”. Isi titik aset agar QR membuka lokasi yang benar.</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Koordinat Latitude</Label><Input {...register('coordinates_lat')} placeholder='-5.1864' /></div>
                <div><Label>Koordinat Longitude</Label><Input {...register('coordinates_lng')} placeholder='119.4337' /></div>
              </div>
            </CardContent>
          </Card>

          {/* Rekomendasi */}
          <Card>
            <CardHeader><CardTitle className="text-base">Pemanfaatan Aset</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Potensi pemanfaatan</Label><Input {...register('rekomendasi_pengembangan')} placeholder="Komersial, pariwisata, hunian, atau bentuk pemanfaatan lain" /></div>
            </CardContent>
          </Card>

          {/* Aksesibilitas */}
          <Card>
            <CardHeader><CardTitle className="text-base">Akses di Sekitar Aset</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">Kartu katalog selalu berurutan Utara (N), Barat (W), Timur (E), dan Selatan (S). Gunakan baris baru untuk memisahkan beberapa fasilitas atau tujuan.</p>
              {aksesItems.map((a, i) => (
                <div key={CARD_DIRECTIONS[i]} className="grid grid-cols-[44px_1fr] gap-3 items-start rounded-md border p-3">
                  <div className="grid place-items-center w-10 h-10 rounded-full bg-primary text-primary-foreground font-bold">{CARD_DIRECTIONS[i]}</div>
                  <div>
                    <Label htmlFor={`direction-${CARD_DIRECTIONS[i]}`}>Fasilitas / tujuan ke arah {CARD_DIRECTIONS[i]}</Label>
                    <Textarea id={`direction-${CARD_DIRECTIONS[i]}`} value={a.keterangan} onChange={e => { const n = [...aksesItems]; n[i] = { ...n[i], keterangan: e.target.value }; setAksesItems(n) }} placeholder={'Contoh: Rumah Sakit A\nBandara B\nPusat Kota'} rows={3} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div><Label htmlFor="access-radius">Radius akses</Label><Input id="access-radius" value={radius} onChange={e => setRadius(e.target.value)} placeholder="Contoh: 4 Km" /></div>
                <div><Label htmlFor="access-road">Nama jalan / tol</Label><Input id="access-road" value={tollInfo.name} onChange={e => setTollInfo({ ...tollInfo, name: e.target.value })} placeholder="Contoh: Jalan Tol Medan–Kuala Namu" /></div>
                <div><Label htmlFor="access-road-distance">Jarak jalan / tol</Label><Input id="access-road-distance" value={tollInfo.distance} onChange={e => setTollInfo({ ...tollInfo, distance: e.target.value })} placeholder="Contoh: 2,6 Km" /></div>
                <div><Label htmlFor="access-road-time">Waktu tempuh jalan / tol</Label><Input id="access-road-time" value={tollInfo.time} onChange={e => setTollInfo({ ...tollInfo, time: e.target.value })} placeholder="Contoh: 6 Menit" /></div>
              </div>
            </CardContent>
          </Card>

          {/* Kontak PIC */}
          <Card>
            <CardHeader><CardTitle className="text-base">Kontak PIC</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div><Label>Nama PIC</Label><Input {...register('pic_nama')} placeholder="Andi Pratama, S.E." /></div>
              <div><Label>Telepon</Label><Input {...register('pic_phone')} placeholder="+62 411 555 0182" /></div>
              <div><Label>Mobile / WA</Label><Input {...register('pic_mobile')} placeholder="+62 812 4400 7711" /></div>
              <div><Label>Email</Label><Input {...register('pic_email')} placeholder="asset.kerjasama@ptpn1.co.id" /></div>
              <div><Label>Kantor</Label><Input {...register('pic_kantor')} placeholder="Kantor Wilayah PTPN I — Makassar" /></div>
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
              Foto lama otomatis digunakan. Atur foto utama, foto vertikal, empat foto kecil, dan peta sesuai posisi pada preview. Peta harus berupa gambar lokasi/rute yang benar.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SLOT_IDS.map(slot => {
                const existingUrl = canvaPhoto(Object.fromEntries((savedKatalog?.foto ?? []).map(f => [f.slot_id, f.url])), slot.id)
                return (
                  <div key={slot.id} className="flex items-center gap-2 p-2 border rounded">
                    {existingUrl && (
                      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted">
                        <img src={existingUrl} alt={slot.label} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="text-xs truncate block">{slot.label}</span>
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
