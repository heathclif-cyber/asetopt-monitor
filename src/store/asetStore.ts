import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Aset, AsetStatus } from '@/types'

interface AsetStore {
  daftarAset: Aset[]
  asetSelected: Aset | null
  isLoading: boolean
  fetchAset: () => Promise<void>
  addAset: (data: Omit<Aset, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  updateAset: (id: string, data: Partial<Aset>) => Promise<void>
  deleteAset: (id: string) => Promise<void>
  setSelected: (aset: Aset | null) => void
  updateStatus: (id: string, status: AsetStatus) => Promise<void>
}

export const useAsetStore = create<AsetStore>((set, get) => ({
  daftarAset: [],
  asetSelected: null,
  isLoading: false,

  fetchAset: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('aset')
      .select('*')
      .order('created_at', { ascending: false })
    if (!error && data) set({ daftarAset: data as Aset[] })
    set({ isLoading: false })
  },

  addAset: async (data) => {
    const { error } = await supabase.from('aset').insert(data)
    if (!error) await get().fetchAset()
  },

  updateAset: async (id, data) => {
    const { error } = await supabase.from('aset').update(data).eq('id', id)
    if (!error) await get().fetchAset()
  },

  deleteAset: async (id) => {
    const { error } = await supabase.from('aset').delete().eq('id', id)
    if (!error) await get().fetchAset()
  },

  setSelected: (aset) => set({ asetSelected: aset }),

  updateStatus: async (id, status) => {
    const { error } = await supabase.from('aset').update({ status }).eq('id', id)
    if (!error) await get().fetchAset()
  },
}))
