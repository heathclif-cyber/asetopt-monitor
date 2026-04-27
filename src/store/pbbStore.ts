import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { PBB } from '@/types'

interface PBBStore {
  dataPBB: Record<string, PBB[]>
  allPBB: PBB[]
  isLoading: boolean
  fetchPBB: (asetId: string) => Promise<void>
  fetchAllPBB: () => Promise<void>
  addPBB: (data: Omit<PBB, 'id' | 'created_at' | 'aset'>) => Promise<void>
  updatePBB: (id: string, data: Partial<PBB>, asetId: string) => Promise<void>
}

export const usePBBStore = create<PBBStore>((set, get) => ({
  dataPBB: {},
  allPBB: [],
  isLoading: false,

  fetchPBB: async (asetId) => {
    const { data } = await supabase
      .from('pbb')
      .select('*')
      .eq('aset_id', asetId)
      .order('tahun', { ascending: false })
    if (data) set(s => ({ dataPBB: { ...s.dataPBB, [asetId]: data as PBB[] } }))
  },

  fetchAllPBB: async () => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('pbb')
      .select('*, aset(*)')
      .order('tahun', { ascending: false })
    if (data) {
      const byAset: Record<string, PBB[]> = {}
      ;(data as PBB[]).forEach(p => {
        if (!byAset[p.aset_id]) byAset[p.aset_id] = []
        byAset[p.aset_id].push(p)
      })
      set({ dataPBB: byAset, allPBB: data as PBB[] })
    }
    set({ isLoading: false })
  },

  addPBB: async (data) => {
    const { error } = await supabase.from('pbb').insert(data)
    if (!error) await get().fetchPBB(data.aset_id)
  },

  updatePBB: async (id, data, asetId) => {
    const { error } = await supabase.from('pbb').update(data).eq('id', id)
    if (!error) await get().fetchPBB(asetId)
  },
}))
