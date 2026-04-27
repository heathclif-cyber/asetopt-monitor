import { create } from 'zustand'
import { api } from '@/lib/api'
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
    const { data } = await api.get<PenilaianKJPP[]>(`/api/kjpp?aset_id=${asetId}`)
    if (data) set(state => ({ dataPenilaian: { ...state.dataPenilaian, [asetId]: data } }))
    set({ isLoading: false })
  },

  fetchAllKJPP: async () => {
    set({ isLoading: true })
    const { data } = await api.get<PenilaianKJPP[]>('/api/kjpp')
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
    await api.post('/api/kjpp', data)
    await get().fetchKJPP(data.aset_id)
  },

  updateKJPP: async (id, data) => {
    const existing = Object.values(get().dataPenilaian).flat().find(k => k.id === id)
    await api.put(`/api/kjpp/${id}`, data)
    if (existing) await get().fetchKJPP(existing.aset_id)
  },

  deleteKJPP: async (id, asetId) => {
    await api.delete(`/api/kjpp/${id}`)
    await get().fetchKJPP(asetId)
  },

  getKJPPTerbaru: (asetId) => {
    const list = get().dataPenilaian[asetId]
    return list?.[0] ?? null
  },
}))
