import { create } from 'zustand'
import { gisApi } from '@/lib/gisApi'
import type { GISKonsesiReference } from '@/types/gis'

interface KonsesiStore {
  daftarKonsesi: GISKonsesiReference[]
  isLoading: boolean
  error: string
  fetchKonsesi: (force?: boolean) => Promise<void>
}

// Master aset comes from the GIS concession layer; one shared load serves the
// master page, the aset dioptimalkan form and the kerja sama form.
export const useKonsesiStore = create<KonsesiStore>((set, get) => ({
  daftarKonsesi: [],
  isLoading: false,
  error: '',

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
}))
