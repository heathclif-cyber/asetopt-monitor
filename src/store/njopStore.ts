import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { NJOP } from '@/types'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'

interface NJOPStore {
  dataNJOP: Record<string, NJOP[]>
  isLoading: boolean
  fetchNJOP: (asetId: string) => Promise<void>
  fetchAllNJOP: () => Promise<void>
  addNJOP: (data: Omit<NJOP, 'id' | 'created_at'>) => Promise<void>
  updateNJOP: (id: string, data: Partial<NJOP>) => Promise<void>
  deleteNJOP: (id: string, asetId: string) => Promise<void>
  getNJOPTerbaru: (asetId: string) => NJOP | null
  hitungPotensiAset: (asetId: string, luasTanah: number, luasBangunan: number) => ReturnType<typeof hitungPotensiNJOP> | null
}

export const useNJOPStore = create<NJOPStore>((set, get) => ({
  dataNJOP: {},
  isLoading: false,

  fetchNJOP: async (asetId) => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('njop')
      .select('*')
      .eq('aset_id', asetId)
      .order('tahun', { ascending: false })
    if (!error && data) {
      set(state => ({ dataNJOP: { ...state.dataNJOP, [asetId]: data as NJOP[] } }))
    }
    set({ isLoading: false })
  },

  fetchAllNJOP: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('njop')
      .select('*')
      .order('tahun', { ascending: false })
    if (!error && data) {
      const byAset: Record<string, NJOP[]> = {}
      ;(data as NJOP[]).forEach(n => {
        if (!byAset[n.aset_id]) byAset[n.aset_id] = []
        byAset[n.aset_id].push(n)
      })
      set({ dataNJOP: byAset })
    }
    set({ isLoading: false })
  },

  addNJOP: async (data) => {
    const { error } = await supabase.from('njop').insert(data)
    if (!error) await get().fetchNJOP(data.aset_id)
  },

  updateNJOP: async (id, data) => {
    const { error, data: updated } = await supabase.from('njop').update(data).eq('id', id).select().single()
    if (!error && updated) await get().fetchNJOP((updated as NJOP).aset_id)
  },

  deleteNJOP: async (id, asetId) => {
    const { error } = await supabase.from('njop').delete().eq('id', id)
    if (!error) await get().fetchNJOP(asetId)
  },

  getNJOPTerbaru: (asetId) => {
    const list = get().dataNJOP[asetId]
    if (!list || list.length === 0) return null
    return list[0]
  },

  hitungPotensiAset: (asetId, luasTanah, luasBangunan) => {
    const njop = get().getNJOPTerbaru(asetId)
    if (!njop) return null
    return hitungPotensiNJOP({
      njopTanahPerM2: njop.nilai_tanah_per_m2,
      luasTanahM2: luasTanah,
      njopBangunanPerM2: njop.nilai_bangunan_per_m2,
      luasBangunanM2: luasBangunan,
    })
  },
}))
