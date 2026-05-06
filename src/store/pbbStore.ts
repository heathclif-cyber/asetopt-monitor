import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { PBB, PBBObjek } from '@/types'

export interface PBBObjekInput {
  nama_objek: string
  no_sppt?: string | null
  nilai_pbb_objek: number
  luas_tanah_sppt: number
  luas_tanah_ks: number
  njop_tanah_per_m2: number
  luas_bangunan_sppt: number
  luas_bangunan_ks: number
  njop_bangunan_per_m2: number
}

type PBBCoreData = Omit<PBB, 'id' | 'created_at' | 'aset' | 'pbb_objek' |
  'luas_tanah_sppt' | 'luas_tanah_ks' | 'njop_tanah_per_m2' |
  'luas_bangunan_sppt' | 'luas_bangunan_ks' | 'njop_bangunan_per_m2'>

interface PBBStore {
  dataPBB: Record<string, PBB[]>
  allPBB: PBB[]
  isLoading: boolean
  fetchPBB: (asetId: string) => Promise<void>
  fetchAllPBB: () => Promise<void>
  addPBB: (data: PBBCoreData, objek: PBBObjekInput[]) => Promise<void>
  updatePBB: (id: string, data: Partial<PBB>, asetId: string, objek?: PBBObjekInput[]) => Promise<void>
  deletePBB: (id: string) => Promise<void>
}

async function upsertObjek(pbbId: string, objek: PBBObjekInput[]) {
  await supabase.from('pbb_objek').delete().eq('pbb_id', pbbId)
  if (objek.length > 0) {
    const { error } = await supabase.from('pbb_objek').insert(
      objek.map(o => ({ ...o, pbb_id: pbbId }))
    )
    if (error) throw new Error(`Gagal menyimpan objek PBB: ${error.message}`)
  }
}

export const usePBBStore = create<PBBStore>((set, get) => ({
  dataPBB: {},
  allPBB: [],
  isLoading: false,

  fetchPBB: async (asetId) => {
    const { data, error } = await supabase
      .from('pbb')
      .select('*, pbb_objek(*)')
      .eq('aset_id', asetId)
      .order('tahun', { ascending: false })
    if (error) console.error('[fetchPBB]', error)
    if (data) set(s => ({ dataPBB: { ...s.dataPBB, [asetId]: data as PBB[] } }))
  },

  fetchAllPBB: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('pbb')
      .select('*, aset(*), pbb_objek(*)')
      .order('tahun', { ascending: false })
    if (error) console.error('[fetchAllPBB]', error)
    if (data) {
      const byAset: Record<string, PBB[]> = {}
      data.forEach(p => {
        if (!byAset[p.aset_id]) byAset[p.aset_id] = []
        byAset[p.aset_id].push(p as PBB)
      })
      set({ dataPBB: byAset, allPBB: data as PBB[] })
    }
    set({ isLoading: false })
  },

  addPBB: async (data, objek) => {
    const nilai_pbb = objek.reduce((sum, o) => sum + (o.nilai_pbb_objek ?? 0), 0)
    const { data: rows, error } = await supabase
      .from('pbb')
      .upsert({ ...data, nilai_pbb }, { onConflict: 'aset_id,tahun' })
      .select()
    if (error) throw new Error(`Gagal menyimpan PBB: ${error.message}`)
    const pbbId = rows![0].id
    await upsertObjek(pbbId, objek)
    await get().fetchAllPBB()
  },

  updatePBB: async (id, data, _asetId, objek?) => {
    const { id: _id, created_at, aset, pbb_objek, ...rest } = data as any
    const updateData: Record<string, unknown> = { ...rest }

    if (objek !== undefined) {
      updateData.nilai_pbb = objek.reduce((sum, o) => sum + (o.nilai_pbb_objek ?? 0), 0)
    }

    const { error } = await supabase.from('pbb').update(updateData).eq('id', id)
    if (error) throw new Error(`Gagal update PBB: ${error.message}`)

    if (objek !== undefined) {
      await upsertObjek(id, objek)
    }

    await get().fetchAllPBB()
  },

  deletePBB: async (id) => {
    const { error } = await supabase.from('pbb').delete().eq('id', id)
    if (error) throw new Error(`Gagal hapus PBB: ${error.message}`)
    await get().fetchAllPBB()
  },
}))
