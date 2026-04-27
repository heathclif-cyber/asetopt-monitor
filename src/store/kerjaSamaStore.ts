import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { KerjaSama, KerjaSamaStatus } from '@/types'

interface KerjaSamaStore {
  daftarKS: KerjaSama[]
  ksSelected: KerjaSama | null
  isLoading: boolean
  fetchKS: () => Promise<void>
  addKS: (data: Omit<KerjaSama, 'id' | 'created_at' | 'aset'>) => Promise<string | null>
  updateKS: (id: string, data: Partial<KerjaSama>) => Promise<void>
  updateStatusKS: (id: string, status: KerjaSamaStatus) => Promise<void>
  setSelected: (ks: KerjaSama | null) => void
}

export const useKerjaSamaStore = create<KerjaSamaStore>((set, get) => ({
  daftarKS: [],
  ksSelected: null,
  isLoading: false,

  fetchKS: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('kerja_sama')
      .select('*, aset(*)')
      .order('created_at', { ascending: false })
    if (!error && data) set({ daftarKS: data as KerjaSama[] })
    set({ isLoading: false })
  },

  addKS: async (data) => {
    const { data: inserted, error } = await supabase.from('kerja_sama').insert(data).select().single()
    if (!error && inserted) {
      await get().fetchKS()
      return (inserted as KerjaSama).id
    }
    return null
  },

  updateKS: async (id, data) => {
    const { error } = await supabase.from('kerja_sama').update(data).eq('id', id)
    if (!error) await get().fetchKS()
  },

  updateStatusKS: async (id, status) => {
    const { error } = await supabase.from('kerja_sama').update({ status }).eq('id', id)
    if (!error) await get().fetchKS()
  },

  setSelected: (ks) => set({ ksSelected: ks }),
}))
