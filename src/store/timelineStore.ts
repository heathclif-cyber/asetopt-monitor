import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
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
    const { data } = await supabase
      .from('timeline_program')
      .select('*')
      .eq('aset_id', asetId)
      .order('urutan', { ascending: true })
    if (data) set(s => ({ daftarTahapan: { ...s.daftarTahapan, [asetId]: data } }))
  },

  fetchAllTimeline: async () => {
    set({ isLoading: true })
    const [{ data: tl }, { data: pr }] = await Promise.all([
      supabase.from('timeline_program').select('*').order('urutan', { ascending: true }),
      supabase.from('prospek_mitra').select('*').order('created_at', { ascending: false }),
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
    await supabase.from('timeline_program').insert(data)
    await get().fetchTimeline(data.aset_id)
  },

  updateTahapan: async (id, data, asetId) => {
    const { id: _id, created_at, ...updateData } = data as any
    await supabase.from('timeline_program').update(updateData).eq('id', id)
    await get().fetchTimeline(asetId)
  },

  deleteTahapan: async (id, asetId) => {
    await supabase.from('timeline_program').delete().eq('id', id)
    await get().fetchTimeline(asetId)
  },

  fetchProspek: async (asetId) => {
    const { data } = await supabase
      .from('prospek_mitra')
      .select('*')
      .eq('aset_id', asetId)
      .order('created_at', { ascending: false })
    if (data) set(s => ({ daftarProspek: { ...s.daftarProspek, [asetId]: data } }))
  },

  addProspek: async (data) => {
    await supabase.from('prospek_mitra').insert(data)
    await get().fetchProspek(data.aset_id)
  },

  updateProspek: async (id, data, asetId) => {
    const { id: _id, created_at, ...updateData } = data as any
    await supabase.from('prospek_mitra').update(updateData).eq('id', id)
    await get().fetchProspek(asetId)
  },
}))
