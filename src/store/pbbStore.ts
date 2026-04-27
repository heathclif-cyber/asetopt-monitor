import { create } from 'zustand'
import { api } from '@/lib/api'
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
    const { data } = await api.get<PBB[]>(`/api/pbb?aset_id=${asetId}`)
    if (data) set(s => ({ dataPBB: { ...s.dataPBB, [asetId]: data } }))
  },

  fetchAllPBB: async () => {
    set({ isLoading: true })
    const { data } = await api.get<PBB[]>('/api/pbb')
    if (data) {
      const byAset: Record<string, PBB[]> = {}
      data.forEach(p => {
        if (!byAset[p.aset_id]) byAset[p.aset_id] = []
        byAset[p.aset_id].push(p)
      })
      set({ dataPBB: byAset, allPBB: data })
    }
    set({ isLoading: false })
  },

  addPBB: async (data) => {
    await api.post('/api/pbb', data)
    await get().fetchPBB(data.aset_id)
  },

  updatePBB: async (id, data, asetId) => {
    await api.put(`/api/pbb/${id}`, data)
    await get().fetchPBB(asetId)
  },
}))
