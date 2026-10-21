import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { PendapatanDiterimaDimuka, PengakuanPendapatan } from '@/types'

interface PendapatanStore {
  daftarPDDM: PendapatanDiterimaDimuka[]
  allPengakuan: PengakuanPendapatan[]
  isLoading: boolean
  fetchAll: () => Promise<void>
}

export const usePendapatanStore = create<PendapatanStore>((set) => ({
  daftarPDDM: [],
  allPengakuan: [],
  isLoading: false,
  fetchAll: async () => {
    set({ isLoading: true })
    try {
      const [parents, entries] = await Promise.all([
        supabase.from('pendapatan_diterima_dimuka').select('*, kerja_sama(*, aset(*))').order('created_at', { ascending: true }),
        supabase.from('pengakuan_pendapatan').select('*').order('periode_ke', { ascending: true }),
      ])
      if (parents.error) console.error('[PendapatanStore]', parents.error)
      else set({ daftarPDDM: (parents.data ?? []) as PendapatanDiterimaDimuka[] })
      if (entries.error) console.error('[PendapatanStore]', entries.error)
      else set({ allPengakuan: (entries.data ?? []) as PengakuanPendapatan[] })
    } finally {
      set({ isLoading: false })
    }
  },
}))
