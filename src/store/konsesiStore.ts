import { create } from 'zustand'
import { gisApi } from '@/lib/gisApi'
import type { GISKonsesiReference, GISOpsetLuasKonsesi } from '@/types/gis'

interface KonsesiStore {
  daftarKonsesi: GISKonsesiReference[]
  isLoading: boolean
  error: string
  fetchKonsesi: (force?: boolean) => Promise<void>
  luasOpset: GISOpsetLuasKonsesi[]
  fetchLuasOpset: () => Promise<void>
  getLuasOpset: (asetId: string, konsesiKey?: string) => number | null
}

// Master aset comes from the GIS concession layer; one shared load serves the
// master page, the aset dioptimalkan form and the kerja sama form.
export const useKonsesiStore = create<KonsesiStore>((set, get) => ({
  daftarKonsesi: [],
  isLoading: false,
  error: '',
  luasOpset: [],

  fetchKonsesi: async (force = false) => {
    if (get().isLoading || (!force && get().daftarKonsesi.length)) return
    set({ isLoading: true, error: '' })
    try {
      const result = await gisApi.konsesiReference()
      set({ daftarKonsesi: result.data })
    } catch (error) {
      console.error('[fetchKonsesi]', error)
      set({ error: error instanceof Error ? error.message : 'Data konsesi GIS tidak dapat dimuat.' })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchLuasOpset: async () => {
    try {
      const result = await gisApi.opsetLuasKonsesi()
      set({ luasOpset: result.data })
    } catch (error) {
      console.error('[fetchLuasOpset]', error)
    }
  },

  // KS land area measured on the map; null when the asset has no OPSET polygon.
  getLuasOpset: (asetId, konsesiKey) => {
    const rows = get().luasOpset.filter(row => row.aset_id === asetId && (!konsesiKey || row.konsesi_key === konsesiKey))
    return rows.length ? rows.reduce((sum, row) => sum + row.luas_m2, 0) : null
  },
}))
