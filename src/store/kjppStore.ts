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
    const { data } = await supabase
      .from('penilaian_kjpp')
      .select('*')
      .eq('aset_id', asetId)
      .order('tgl_penilaian', { ascending: false })
    if (data) set(state => ({ dataPenilaian: { ...state.dataPenilaian, [asetId]: data } }))
    set({ isLoading: false })
  },

  fetchAllKJPP: async () => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('penilaian_kjpp')
      .select('*')
      .order('tgl_penilaian', { ascending: false })
    if (data) {
      const byAset: Record<string, PenilaianKJPP[]> = {}
      data.forEach(k => {
        if (!byAset[k.aset_id]) byAset[k.aset_id] = []
        byAset[k.aset_id].push(k)
      })
      set({ dataPenilaian: byAset })
    }
    set({ isLoading: false })
  },

  addKJPP: async (data) => {
    await supabase.from('penilaian_kjpp').insert(data)
    await get().fetchKJPP(data.aset_id)
  },

  updateKJPP: async (id, data) => {
    // total_nilai adalah GENERATED ALWAYS kolom, tidak bisa diupdate
    const { id: _id, total_nilai, created_at, ...updateData } = data as any
    await supabase.from('penilaian_kjpp').update(updateData).eq('id', id)
    const asetId = Object.entries(get().dataPenilaian).find(([, list]) => list.some(k => k.id === id))?.[0]
    if (asetId) await get().fetchKJPP(asetId)
  },

  deleteKJPP: async (id, asetId) => {
    await supabase.from('penilaian_kjpp').delete().eq('id', id)
    await get().fetchKJPP(asetId)
  },

  getKJPPTerbaru: (asetId) => {
    const list = get().dataPenilaian[asetId]
    return list?.[0] ?? null
  },
}))
