import { create } from 'zustand'
import { api } from '@/lib/api'
import { NJOP } from '@/types'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'

interface NJOPStore {
  dataNJOP: Record<string, NJOP[]>
  isLoading: boolean
  fetchNJOP: (asetId: string) => Promise<void>
  fetchAllNJOP: () => Promise<void>
  addNJOP: (data: Omit<NJOP, 'id' | 'created_at'>) => Promise<void>
  updateNJOP: (id: string, data: Partial<NJOP>) => Promise<void>
  deleteNJOP: (id: string, asetId: string) => Promise<void>
  getNJOPTerbaru: (asetId: string) => NJOP | null
  hitungPotensiAset: (asetId: string, luasTanah: number, luasBangunan: number) => ReturnType<typeof hitungPotensiNJOP> | null
}

export const useNJOPStore = create<NJOPStore>((set, get) => ({
  dataNJOP: {},
  isLoading: false,

  fetchNJOP: async (asetId) => {
    set({ isLoading: true })
    const { data } = await api.get<NJOP[]>(`/api/njop?aset_id=${asetId}`)
    if (data) set(state => ({ dataNJOP: { ...state.dataNJOP, [asetId]: data } }))
    set({ isLoading: false })
  },

  fetchAllNJOP: async () => {
    set({ isLoading: true })
    const { data } = await api.get<NJOP[]>('/api/njop')
    if (data) {
      const byAset: Record<string, NJOP[]> = {}
      data.forEach(n => {
        if (!byAset[n.aset_id]) byAset[n.aset_id] = []
        byAset[n.aset_id].push(n)
      })
      set({ dataNJOP: byAset })
    }
    set({ isLoading: false })
  },

  addNJOP: async (data) => {
    await api.post('/api/njop', data)
    await get().fetchNJOP(data.aset_id)
  },

  updateNJOP: async (id, data) => {
    const existing = Object.values(get().dataNJOP).flat().find(n => n.id === id)
    await api.put(`/api/njop/${id}`, data)
    if (existing) await get().fetchNJOP(existing.aset_id)
  },

  deleteNJOP: async (id, asetId) => {
    await api.delete(`/api/njop/${id}`)
    await get().fetchNJOP(asetId)
  },

  getNJOPTerbaru: (asetId) => {
    const list = get().dataNJOP[asetId]
    return list?.[0] ?? null
  },

  hitungPotensiAset: (asetId, luasTanah, luasBangunan) => {
    const njop = get().getNJOPTerbaru(asetId)
    if (!njop) return null
    return hitungPotensiNJOP({
      njopTanahPerM2: njop.nilai_tanah_per_m2,
      luasTanahM2: luasTanah,
      njopBangunanPerM2: njop.nilai_bangunan_per_m2,
      luasBangunanM2: luasBangunan,
    })
  },
}))
