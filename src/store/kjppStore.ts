import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { PenilaianKJPP } from '@/types'

interface KJPPStore {
  dataPenilaian: Record<string, PenilaianKJPP[]>
  isLoading: boolean
  fetchKJPP: (asetId: string) => Promise<void>
  fetchAllKJPP: () => Promise<void>
  addKJPP: (data: Omit<PenilaianKJPP, 'id' | 'total_nilai' | 'created_at'>) => Promise<void>
  updateKJPP: (id: string, data: Partial<PenilaianKJPP>) => Promise<void>
  deleteKJPP: (id: string, asetId: string) => Promise<void>
  getKJPPTerbaru: (asetId: string) => PenilaianKJPP | null
}

export const useKJPPStore = create<KJPPStore>((set, get) => ({
  dataPenilaian: {},
  isLoading: false,

  fetchKJPP: async (asetId) => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('penilaian_kjpp')
      .select('*')
      .eq('aset_id', asetId)
      .order('tgl_penilaian', { ascending: false })
    if (!error && data) {
      set(state => ({ dataPenilaian: { ...state.dataPenilaian, [asetId]: data as PenilaianKJPP[] } }))
    }
    set({ isLoading: false })
  },

  fetchAllKJPP: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('penilaian_kjpp')
      .select('*')
      .order('tgl_penilaian', { ascending: false })
    if (!error && data) {
      const byAset: Record<string, PenilaianKJPP[]> = {}
      ;(data as PenilaianKJPP[]).forEach(k => {
        if (!byAset[k.aset_id]) byAset[k.aset_id] = []
        byAset[k.aset_id].push(k)
      })
      set({ dataPenilaian: byAset })
    }
    set({ isLoading: false })
  },

  addKJPP: async (data) => {
    const { error } = await supabase.from('penilaian_kjpp').insert(data)
    if (!error) await get().fetchKJPP(data.aset_id)
  },

  updateKJPP: async (id, data) => {
    const existing = Object.values(get().dataPenilaian).flat().find(k => k.id === id)
    const { error } = await supabase.from('penilaian_kjpp').update(data).eq('id', id)
    if (!error && existing) await get().fetchKJPP(existing.aset_id)
  },

  deleteKJPP: async (id, asetId) => {
    const { error } = await supabase.from('penilaian_kjpp').delete().eq('id', id)
    if (!error) await get().fetchKJPP(asetId)
  },

  getKJPPTerbaru: (asetId) => {
    const list = get().dataPenilaian[asetId]
    if (!list || list.length === 0) return null
    return list[0]
  },
}))
