import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type {
  KatalogAset, KatalogAksesibilitas, KatalogLingkungan, KatalogSkema, KatalogFoto,
  KatalogFactsheetData, KatalogLayout, NJOP, PenilaianKJPP,
} from '@/types'
import { formatRupiah } from '@/lib/utils'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'

interface KatalogStore {
  daftarKatalog: KatalogAset[]
  katalogSelected: KatalogAset | null
  isLoading: boolean
  isSaving: boolean

  fetchAll: () => Promise<void>
  fetchById: (id: string) => Promise<KatalogAset | null>
  fetchByAsetId: (asetId: string) => Promise<KatalogAset | null>

  createKatalog: (data: {
    katalog: Omit<KatalogAset, 'id' | 'created_at' | 'updated_at' | 'aset' | 'aksesibilitas' | 'lingkungan' | 'skema' | 'foto'>
    aksesibilitas: Omit<KatalogAksesibilitas, 'id' | 'katalog_id'>[]
    lingkungan: Omit<KatalogLingkungan, 'id' | 'katalog_id'>[]
    skema: Omit<KatalogSkema, 'id' | 'katalog_id'>[]
  }) => Promise<string | null>

  updateKatalog: (id: string, data: {
    katalog: Partial<Omit<KatalogAset, 'id' | 'created_at' | 'updated_at' | 'aset' | 'aksesibilitas' | 'lingkungan' | 'skema' | 'foto'>>
    aksesibilitas?: Omit<KatalogAksesibilitas, 'id' | 'katalog_id'>[]
    lingkungan?: Omit<KatalogLingkungan, 'id' | 'katalog_id'>[]
    skema?: Omit<KatalogSkema, 'id' | 'katalog_id'>[]
  }) => Promise<void>

  deleteKatalog: (id: string) => Promise<void>

  uploadFoto: (katalogId: string, slotId: string, file: File) => Promise<string | null>
  deleteFoto: (katalogId: string, fotoId: string) => Promise<void>
  setSelected: (katalog: KatalogAset | null) => void

  // Helper: convert DB data to factsheet render data
  toFactsheetData: (katalog: KatalogAset, njop?: NJOP | null, kjpp?: PenilaianKJPP | null) => KatalogFactsheetData
}

export const useKatalogStore = create<KatalogStore>((set, get) => ({
  daftarKatalog: [],
  katalogSelected: null,
  isLoading: false,
  isSaving: false,

  fetchAll: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('katalog_aset')
      .select('*, aset(*), aksesibilitas:katalog_aksesibilitas(*), lingkungan:katalog_lingkungan(*), skema:katalog_skema(*), foto:katalog_foto(*)')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[katalogStore.fetchAll]', error)
      set({ isLoading: false })
      return
    }
    set({ daftarKatalog: data as KatalogAset[], isLoading: false })
  },

  fetchById: async (id) => {
    const { data, error } = await supabase
      .from('katalog_aset')
      .select('*, aset(*), aksesibilitas:katalog_aksesibilitas(*), lingkungan:katalog_lingkungan(*), skema:katalog_skema(*), foto:katalog_foto(*)')
      .eq('id', id)
      .single()
    if (error) {
      console.error('[katalogStore.fetchById]', error)
      return null
    }
    return data as KatalogAset
  },

  fetchByAsetId: async (asetId) => {
    const { data, error } = await supabase
      .from('katalog_aset')
      .select('*, aset(*), aksesibilitas:katalog_aksesibilitas(*), lingkungan:katalog_lingkungan(*), skema:katalog_skema(*), foto:katalog_foto(*)')
      .eq('aset_id', asetId)
      .maybeSingle()
    if (error) {
      console.error('[katalogStore.fetchByAsetId]', error)
      return null
    }
    return data as KatalogAset | null
  },

  createKatalog: async ({ katalog, aksesibilitas, lingkungan, skema }) => {
    set({ isSaving: true })
    const { data, error } = await supabase
      .from('katalog_aset')
      .insert(katalog)
      .select('id')
      .single()
    if (error) {
      console.error('[katalogStore.createKatalog]', error)
      set({ isSaving: false })
      return null
    }
    const id = data.id
    // Insert child records
    if (aksesibilitas.length > 0) {
      await supabase.from('katalog_aksesibilitas').insert(aksesibilitas.map((a, i) => ({ ...a, katalog_id: id, urutan: a.urutan ?? i })))
    }
    if (lingkungan.length > 0) {
      await supabase.from('katalog_lingkungan').insert(lingkungan.map((l, i) => ({ ...l, katalog_id: id, urutan: l.urutan ?? i })))
    }
    if (skema.length > 0) {
      await supabase.from('katalog_skema').insert(skema.map((s, i) => ({ ...s, katalog_id: id, urutan: s.urutan ?? i })))
    }
    await get().fetchAll()
    set({ isSaving: false })
    return id
  },

  updateKatalog: async (id, { katalog, aksesibilitas, lingkungan, skema }) => {
    set({ isSaving: true })
    const { id: _id, created_at, updated_at, aset, ...updateData } = katalog as any
    await supabase.from('katalog_aset').update(updateData).eq('id', id)

    if (aksesibilitas !== undefined) {
      await supabase.from('katalog_aksesibilitas').delete().eq('katalog_id', id)
      if (aksesibilitas.length > 0) {
        await supabase.from('katalog_aksesibilitas').insert(aksesibilitas.map((a, i) => ({ ...a, katalog_id: id, urutan: a.urutan ?? i })))
      }
    }
    if (lingkungan !== undefined) {
      await supabase.from('katalog_lingkungan').delete().eq('katalog_id', id)
      if (lingkungan.length > 0) {
        await supabase.from('katalog_lingkungan').insert(lingkungan.map((l, i) => ({ ...l, katalog_id: id, urutan: l.urutan ?? i })))
      }
    }
    if (skema !== undefined) {
      await supabase.from('katalog_skema').delete().eq('katalog_id', id)
      if (skema.length > 0) {
        await supabase.from('katalog_skema').insert(skema.map((s, i) => ({ ...s, katalog_id: id, urutan: s.urutan ?? i })))
      }
    }
    await get().fetchAll()
    set({ isSaving: false })
  },

  deleteKatalog: async (id) => {
    await supabase.from('katalog_aset').delete().eq('id', id)
    await get().fetchAll()
  },

  uploadFoto: async (katalogId, slotId, file) => {
    // Convert file to base64 data URL (no storage bucket needed)
    const toBase64 = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
    try {
      const dataUrl = await toBase64(file)

      // Replace existing photo in same slot
      const { data: existing } = await supabase
        .from('katalog_foto')
        .select('id')
        .eq('katalog_id', katalogId)
        .eq('slot_id', slotId)
      if (existing && existing.length > 0) {
        await supabase.from('katalog_foto').delete().eq('id', existing[0].id)
      }

      await supabase.from('katalog_foto').insert({
        katalog_id: katalogId,
        slot_id: slotId,
        url: dataUrl,
        urutan: 0,
      })
      await get().fetchAll()
      return dataUrl
    } catch (err) {
      console.error('[katalogStore.uploadFoto]', err)
      return null
    }
  },

  deleteFoto: async (_katalogId, fotoId) => {
    await supabase.from('katalog_foto').delete().eq('id', fotoId)
    await get().fetchAll()
  },

  setSelected: (katalog) => set({ katalogSelected: katalog }),

  toFactsheetData: (katalog, njop, kjpp) => {
    const aset = katalog.aset
    const akses = katalog.aksesibilitas ?? []
    const lingk = katalog.lingkungan ?? []
    const skm = katalog.skema ?? []
    const foto = katalog.foto ?? []

    const photos: Record<string, string> = {}
    foto.forEach(f => { photos[f.slot_id] = f.url })

    // Extract region from alamat
    const extractRegion = (alamat: string | null | undefined): string => {
      if (!alamat) return ''
      const parts = alamat.split(',').map(p => p.trim())
      const kota = parts.find(p => p.startsWith('Kota ') || p.startsWith('Kabupaten '))
      const prov = parts.find(p => p.startsWith('Provinsi '))
      if (kota && prov) return `${kota.replace(/^(Kota|Kabupaten) /, '')}, ${prov.replace(/^Provinsi /, '')}`
      if (kota) return kota.replace(/^(Kota|Kabupaten) /, '')
      const filtered = parts.filter(p => p && !p.startsWith('Jl') && !p.startsWith('Kel') && !p.startsWith('Kec'))
      if (filtered.length >= 2) return `${filtered[filtered.length-2]}, ${filtered[filtered.length-1]}`
      return ''
    }

    const landArea = aset?.luas_tanah_m2?.toLocaleString('id-ID') ?? '0'
    const landAreaHa = aset?.luas_tanah_m2 ? (aset.luas_tanah_m2 / 10000).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 }) : '0'
    const buildingArea = aset?.luas_bangunan_m2?.toLocaleString('id-ID') ?? '0'

    // Compute NJOP-based values
    const njopPerM2 = njop ? formatRupiah(njop.nilai_tanah_per_m2) : ''

    // Total nilai: prioritaskan KJPP, fallback ke potensi NJOP (3.33% tanah + 6.64% bangunan)
    let totalValueM = ''
    let appraisalDate = ''
    let appraisalSource = ''
    if (kjpp) {
      totalValueM = (kjpp.total_nilai / 1_000_000_000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      appraisalDate = new Date(kjpp.tgl_penilaian).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
      appraisalSource = kjpp.nama_kjpp ?? 'Penilaian KJPP'
    } else if (njop && aset?.luas_tanah_m2) {
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

    // Sertifikat: from aset data first, then katalog form, then empty
    const certDetail = (aset as any)?.sertifikat || katalog.sertifikat_detail || ''
    const certOwner = katalog.sertifikat_pemilik || (certDetail ? 'PT Perkebunan Nusantara I' : '')

    return {
      code: aset?.kode_aset ?? '',
      name: aset?.nama_aset ?? '',
      tagline: katalog.tagline ?? '',
      category: 'Tanah & Bangunan',
      status: aset?.status === 'aktif_ks' ? 'Dalam Kerjasama' : 'Tersedia untuk Kerjasama',
      address: aset?.alamat ?? '',
      region: extractRegion(aset?.alamat),
      coordinates: { lat: katalog.coordinates_lat ?? '', lng: katalog.coordinates_lng ?? '' },
      landArea,
      landAreaHa,
      buildingArea,
      buildingCondition: katalog.kondisi_bangunan ?? '',
      certificate: certDetail,
      certificateOwner: certOwner,
      zoning: katalog.zonasi || 'Zona Pelayanan Umum — Skala Kota (K-3)',
      topography: katalog.topografi || 'Datar, elevasi 14–18 mdpl',
      njop: njopPerM2,
      totalValue: totalValueM,
      valueUnit: 'Miliar',
      appraisalDate,
      appraisalSource,
      recommendation: katalog.rekomendasi_pengembangan ?? '',
      recommendationSummary: katalog.rekomendasi_summary ?? '',
      partnershipSchemes: skm.map(s => ({ code: s.kode, name: s.nama ?? '', note: s.catatan ?? '' })),
      accessibility: akses.map(a => ({ label: a.label, value: a.nilai ?? '', sub: a.keterangan ?? '' })),
      surroundings: lingk.map(l => ({ name: l.nama, distance: l.jarak ?? '', type: l.tipe ?? '' })),
      pic: {
        name: katalog.pic_nama ?? '',
        title: katalog.pic_jabatan ?? '',
        phone: katalog.pic_phone ?? '',
        mobile: katalog.pic_mobile ?? '',
        email: katalog.pic_email ?? '',
        office: katalog.pic_kantor ?? '',
      },
      documentDate: katalog.tgl_dokumen ?? '',
      documentRef: katalog.ref_dokumen ?? '',
      photos,
    }
  },
}))
