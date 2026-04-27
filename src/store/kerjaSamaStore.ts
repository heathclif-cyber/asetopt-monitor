import { create } from 'zustand'
import { api } from '@/lib/api'
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
    const { data } = await api.get<KerjaSama[]>('/api/kerja-sama')
    if (data) set({ daftarKS: data })
    set({ isLoading: false })
  },

  addKS: async (data) => {
    const { data: inserted } = await api.post<KerjaSama>('/api/kerja-sama', data)
    await get().fetchKS()
    return inserted?.id ?? null
  },

  updateKS: async (id, data) => {
    const current = get().daftarKS.find(k => k.id === id)
    await api.put(`/api/kerja-sama/${id}`, { ...current, ...data })
    await get().fetchKS()
  },

  updateStatusKS: async (id, status) => {
    const current = get().daftarKS.find(k => k.id === id)
    await api.put(`/api/kerja-sama/${id}`, { ...current, status })
    await get().fetchKS()
  },

  setSelected: (ks) => set({ ksSelected: ks }),
}))
