import { create } from 'zustand'
import { api } from '@/lib/api'
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
    const { data } = await api.get<Aset[]>('/api/aset')
    if (data) set({ daftarAset: data })
    set({ isLoading: false })
  },

  addAset: async (data) => {
    await api.post('/api/aset', data)
    await get().fetchAset()
  },

  updateAset: async (id, data) => {
    const current = get().daftarAset.find(a => a.id === id)
    await api.put(`/api/aset/${id}`, { ...current, ...data })
    await get().fetchAset()
  },

  deleteAset: async (id) => {
    await api.delete(`/api/aset/${id}`)
    await get().fetchAset()
  },

  setSelected: (aset) => set({ asetSelected: aset }),

  updateStatus: async (id, status) => {
    const current = get().daftarAset.find(a => a.id === id)
    await api.put(`/api/aset/${id}`, { ...current, status })
    await get().fetchAset()
  },
}))
