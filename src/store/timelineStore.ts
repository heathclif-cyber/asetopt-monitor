import { create } from 'zustand'
import { api } from '@/lib/api'
import { TimelineProgram, ProspekMitra } from '@/types'

interface TimelineStore {
  daftarTahapan: Record<string, TimelineProgram[]>
  daftarProspek: Record<string, ProspekMitra[]>
  allTimeline: TimelineProgram[]
  allProspek: ProspekMitra[]
  isLoading: boolean
  fetchTimeline: (asetId: string) => Promise<void>
  fetchAllTimeline: () => Promise<void>
  addTahapan: (data: Omit<TimelineProgram, 'id' | 'created_at'>) => Promise<void>
  updateTahapan: (id: string, data: Partial<TimelineProgram>, asetId: string) => Promise<void>
  deleteTahapan: (id: string, asetId: string) => Promise<void>
  fetchProspek: (asetId: string) => Promise<void>
  addProspek: (data: Omit<ProspekMitra, 'id' | 'created_at'>) => Promise<void>
  updateProspek: (id: string, data: Partial<ProspekMitra>, asetId: string) => Promise<void>
}

export const useTimelineStore = create<TimelineStore>((set, get) => ({
  daftarTahapan: {},
  daftarProspek: {},
  allTimeline: [],
  allProspek: [],
  isLoading: false,

  fetchTimeline: async (asetId) => {
    const { data } = await api.get<TimelineProgram[]>(`/api/timeline?aset_id=${asetId}`)
    if (data) set(s => ({ daftarTahapan: { ...s.daftarTahapan, [asetId]: data } }))
  },

  fetchAllTimeline: async () => {
    set({ isLoading: true })
    const [{ data: tl }, { data: pr }] = await Promise.all([
      api.get<TimelineProgram[]>('/api/timeline'),
      api.get<ProspekMitra[]>('/api/prospek'),
    ])

    if (tl) {
      const byAset: Record<string, TimelineProgram[]> = {}
      tl.forEach(t => {
        if (!byAset[t.aset_id]) byAset[t.aset_id] = []
        byAset[t.aset_id].push(t)
      })
      set({ daftarTahapan: byAset, allTimeline: tl })
    }

    if (pr) {
      const byAset: Record<string, ProspekMitra[]> = {}
      pr.forEach(p => {
        if (!byAset[p.aset_id]) byAset[p.aset_id] = []
        byAset[p.aset_id].push(p)
      })
      set({ daftarProspek: byAset, allProspek: pr })
    }
    set({ isLoading: false })
  },

  addTahapan: async (data) => {
    await api.post('/api/timeline', data)
    await get().fetchTimeline(data.aset_id)
  },

  updateTahapan: async (id, data, asetId) => {
    await api.put(`/api/timeline/${id}`, data)
    await get().fetchTimeline(asetId)
  },

  deleteTahapan: async (id, asetId) => {
    await api.delete(`/api/timeline/${id}`)
    await get().fetchTimeline(asetId)
  },

  fetchProspek: async (asetId) => {
    const { data } = await api.get<ProspekMitra[]>(`/api/prospek?aset_id=${asetId}`)
    if (data) set(s => ({ daftarProspek: { ...s.daftarProspek, [asetId]: data } }))
  },

  addProspek: async (data) => {
    await api.post('/api/prospek', data)
    await get().fetchProspek(data.aset_id)
  },

  updateProspek: async (id, data, asetId) => {
    await api.put(`/api/prospek/${id}`, data)
    await get().fetchProspek(asetId)
  },
}))
