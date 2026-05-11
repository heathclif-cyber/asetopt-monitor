import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { PendapatanDiterimaDimuka, PengakuanPendapatan } from '@/types'
import { generateJadwalAmortisasi, tentukanStatusKontrak } from '@/utils/akrualUtils'

type PDDMCoreData = Omit<PendapatanDiterimaDimuka, 'id' | 'nilai_per_bulan' | 'sisa_dimuka' | 'sudah_diakui' | 'status' | 'created_at' | 'updated_at' | 'kerja_sama' | 'pengakuan_pendapatan'>

const RELATION_COLS = ['kerja_sama', 'pengakuan_pendapatan']

function stripRelationFields(data: any) {
  const copy = { ...data }
  for (const col of RELATION_COLS) {
    delete copy[col]
  }
  return copy
}

interface PendapatanStore {
  daftarPDDM: PendapatanDiterimaDimuka[]
  allPengakuan: PengakuanPendapatan[]
  isLoading: boolean

  syncAllPDDM: (allKompensasi: any[], daftarKS: any[]) => Promise<void>
  fetchAll: () => Promise<void>
  fetchByKS: (ksId: string) => Promise<PendapatanDiterimaDimuka[]>
  addKontrak: (data: PDDMCoreData) => Promise<string>
  updateKontrak: (id: string, data: Partial<PendapatanDiterimaDimuka>) => Promise<void>
  deleteKontrak: (id: string) => Promise<void>

  generateAmortisasi: (pddmId: string) => Promise<void>
  akuiPendapatan: (pengakuanId: string, pddmId: string, nominal: number) => Promise<void>
  getJadwalByPDDM: (pddmId: string) => Promise<PengakuanPendapatan[]>
}

export const usePendapatanStore = create<PendapatanStore>((set, get) => ({
  daftarPDDM: [],
  allPengakuan: [],
  isLoading: false,

  fetchAll: async () => {
    set({ isLoading: true })

    // Auto-recognition: akui semua entri proyeksi yang tgl_awal-nya sudah lewat
    const today = new Date().toISOString().split('T')[0]
    const { data: perluDiakui } = await supabase
      .from('pengakuan_pendapatan')
      .select('id, pddm_id, nominal')
      .eq('status', 'proyeksi')
      .lte('tgl_awal', today)

    if (perluDiakui && perluDiakui.length > 0) {
      const ids = perluDiakui.map(e => e.id)
      await supabase.from('pengakuan_pendapatan').update({ status: 'diakui' }).in('id', ids)

      const byPDDM: Record<string, number> = {}
      perluDiakui.forEach(e => { byPDDM[e.pddm_id] = (byPDDM[e.pddm_id] || 0) + e.nominal })

      for (const [pddmId, tambahan] of Object.entries(byPDDM)) {
        const { data: p } = await supabase
          .from('pendapatan_diterima_dimuka')
          .select('sudah_diakui, total_nkm')
          .eq('id', pddmId)
          .single()
        const cur = (p as any)?.sudah_diakui ?? 0
        const total = (p as any)?.total_nkm ?? 0
        const baru = cur + tambahan
        const statusBaru = tentukanStatusKontrak(total, baru)
        await supabase.from('pendapatan_diterima_dimuka')
          .update({ sudah_diakui: baru, status: statusBaru })
          .eq('id', pddmId)
      }
    }

    const { data: pddmRaw, error: err1 } = await supabase
      .from('pendapatan_diterima_dimuka')
      .select('*, kerja_sama(*, aset(*))')
      .order('created_at', { ascending: true })
    if (err1) console.error('[PendapatanStore] fetchAll PDDM:', err1)

    // Auto-dedup: 1 KS hanya boleh punya 1 PDDM — simpan yang TERBARU
    if (pddmRaw && pddmRaw.length > 0) {
      const seen = new Set<string>()
      const dups: string[] = []
      // Proses dari paling baru (descending order sudah dari .order('created_at', {ascending: true}))
      // Balik array agar yang terbaru disimpan, yang lama dihapus
      const reversed = [...pddmRaw].reverse()
      const clean = reversed.filter((p: any) => {
        if (!p.ks_id) return true
        if (seen.has(p.ks_id)) { dups.push(p.id); return false }
        seen.add(p.ks_id)
        return true
      })
      if (dups.length > 0) {
        await supabase.from('pendapatan_diterima_dimuka').delete().in('id', dups)
      }
      set({ daftarPDDM: clean.reverse() as PendapatanDiterimaDimuka[] })
    } else if (pddmRaw) {
      set({ daftarPDDM: pddmRaw as PendapatanDiterimaDimuka[] })
    }

    const { data: pp, error: err2 } = await supabase
      .from('pengakuan_pendapatan')
      .select('*')
      .order('periode_ke', { ascending: true })
    if (err2) console.error('[PendapatanStore] fetchAll PP:', err2)
    if (pp) set({ allPengakuan: pp as PengakuanPendapatan[] })

    set({ isLoading: false })
  },

  fetchByKS: async (ksId) => {
    const { data } = await supabase
      .from('pendapatan_diterima_dimuka')
      .select('*, kerja_sama(*, aset(*))')
      .eq('ks_id', ksId)
      .order('created_at', { ascending: false })
    return (data ?? []) as PendapatanDiterimaDimuka[]
  },

  syncAllPDDM: async (allKompensasi: any[], daftarKS: any[]) => {
    const existingKS = new Set(get().daftarPDDM.map(p => p.ks_id))

    // Group kompensasi by ks_id
    const byKS: Record<string, any[]> = {}
    allKompensasi.forEach(k => {
      if (!k.ks_id || !k.nominal || k.nominal <= 0) return
      if (!byKS[k.ks_id]) byKS[k.ks_id] = []
      byKS[k.ks_id].push(k)
    })

    for (const [ksId, kompList] of Object.entries(byKS)) {
      const ks = daftarKS.find(x => x.id === ksId)
      if (!ks) continue

      // Urutkan kompensasi by tgl_jatuh_tempo
      kompList.sort((a, b) => new Date(a.tgl_jatuh_tempo).getTime() - new Date(b.tgl_jatuh_tempo).getTime())
      const totalNKM = kompList.reduce((s, k) => s + (k.nominal ?? 0), 0)

      // Cek apakah sudah ada PDDM untuk KS ini
      let pddmId: string | null = null
      if (existingKS.has(ksId)) {
        pddmId = get().daftarPDDM.find(p => p.ks_id === ksId)?.id ?? null
      }
      if (!pddmId) {
        const { data: already } = await supabase
          .from('pendapatan_diterima_dimuka')
          .select('id')
          .eq('ks_id', ksId)
          .limit(1)
        if (already && already.length > 0) {
          pddmId = (already[0] as any).id
        }
      }

      try {
        if (!pddmId) {
          // Buat baru
          const { data: inserted, error } = await supabase
            .from('pendapatan_diterima_dimuka')
            .insert({
              ks_id: ksId,
              nama_kontrak: `${ks.nama_mitra} — ${(ks.aset as any)?.nama_aset ?? 'Aset'}`,
              total_nkm: totalNKM,
              total_bulan: kompList.length,
              tgl_mulai: ks.tgl_mulai,
              tgl_selesai: ks.tgl_selesai,
              sudah_diakui: 0,
              status: 'aktif',
            })
            .select('id').single()
          if (error || !inserted) continue
          pddmId = (inserted as any).id
        } else {
          // Update existing — update NKM, total_bulan
          await supabase.from('pendapatan_diterima_dimuka')
            .update({ total_nkm: totalNKM, total_bulan: kompList.length })
            .eq('id', pddmId)
          // Hapus entri amortisasi lama, buat ulang
          await supabase.from('pengakuan_pendapatan').delete().eq('pddm_id', pddmId)
        }

        // Satu kompensasi = satu entri amortisasi, full nominal, diakui di tahun jatuh tempo
        const entries = kompList.map((k, i) => ({
          pddm_id: pddmId!,
          periode_ke: i + 1,
          tgl_awal: k.tgl_jatuh_tempo,
          tgl_akhir: k.tgl_jatuh_tempo,
          nominal: k.nominal,
          status: 'proyeksi',
        }))
        await supabase.from('pengakuan_pendapatan').insert(entries)
      } catch (e) {
        console.error('[PendapatanStore] Auto-sync PDDM gagal untuk KS:', ksId, e)
      }
    }
  },

  addKontrak: async (data) => {
    const { data: inserted, error } = await supabase.from('pendapatan_diterima_dimuka').insert({
      ...data,
      sudah_diakui: 0,
      status: 'aktif',
    }).select('id').single()
    if (error) throw new Error(`Gagal menambah kontrak PDDM: ${error.message}`)
    await get().fetchAll()
    return (inserted as any)?.id as string
  },

  updateKontrak: async (id, data) => {
    const payload = stripRelationFields(data)
    const { error } = await supabase
      .from('pendapatan_diterima_dimuka')
      .update(payload)
      .eq('id', id)
    if (error) throw new Error(`Gagal update kontrak PDDM: ${error.message}`)
    await get().fetchAll()
  },

  deleteKontrak: async (id) => {
    const { error } = await supabase
      .from('pendapatan_diterima_dimuka')
      .delete()
      .eq('id', id)
    if (error) throw new Error(`Gagal hapus kontrak PDDM: ${error.message}`)
    await get().fetchAll()
  },

  generateAmortisasi: async (pddmId) => {
    const pddm = get().daftarPDDM.find(p => p.id === pddmId)
    if (!pddm) throw new Error('Kontrak PDDM tidak ditemukan')

    const { data: existing } = await supabase
      .from('pengakuan_pendapatan')
      .select('id')
      .eq('pddm_id', pddmId)
    if (existing && existing.length > 0) {
      throw new Error('Jadwal amortisasi sudah pernah dibuat. Hapus entri terlebih dahulu untuk regenerasi.')
    }

    const entries = generateJadwalAmortisasi(
      pddmId,
      pddm.total_nkm,
      pddm.total_bulan,
      pddm.tgl_mulai,
    )

    const { error } = await supabase.from('pengakuan_pendapatan').insert(entries)
    if (error) throw new Error(`Gagal generate amortisasi: ${error.message}`)
    await get().fetchAll()
  },

  akuiPendapatan: async (pengakuanId, pddmId, nominal) => {
    const { error: err1 } = await supabase
      .from('pengakuan_pendapatan')
      .update({ status: 'diakui' })
      .eq('id', pengakuanId)
    if (err1) throw new Error(`Gagal akui pendapatan: ${err1.message}`)

    const { data: pddm } = await supabase
      .from('pendapatan_diterima_dimuka')
      .select('sudah_diakui, total_nkm')
      .eq('id', pddmId)
      .single()

    const currentDiakui = (pddm as any)?.sudah_diakui ?? 0
    const totalNKM = (pddm as any)?.total_nkm ?? 0
    const newDiakui = currentDiakui + nominal
    const newStatus = tentukanStatusKontrak(totalNKM, newDiakui)

    const { error: err2 } = await supabase
      .from('pendapatan_diterima_dimuka')
      .update({ sudah_diakui: newDiakui, status: newStatus })
      .eq('id', pddmId)
    if (err2) throw new Error(`Gagal update sudah_diakui: ${err2.message}`)

    await get().fetchAll()
  },

  getJadwalByPDDM: async (pddmId) => {
    const { data } = await supabase
      .from('pengakuan_pendapatan')
      .select('*')
      .eq('pddm_id', pddmId)
      .order('periode_ke', { ascending: true })
    return (data ?? []) as PengakuanPendapatan[]
  },
}))
