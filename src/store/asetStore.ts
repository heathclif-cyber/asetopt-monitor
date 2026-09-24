import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Aset, AsetKonsesi, AsetStatus } from '@/types'

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
  saveKonsesiLinks: (asetId: string, links: Pick<AsetKonsesi, 'konsesi_key' | 'konsesi_nama'>[]) => Promise<void>
}

export const useAsetStore = create<AsetStore>((set, get) => ({
  daftarAset: [],
  asetSelected: null,
  isLoading: false,

  fetchAset: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('aset')
      .select('*, aset_konsesi(*)')
      .order('created_at', { ascending: false })
    if (error) console.error('[fetchAset] error:', error)
    if (data) set({ daftarAset: data })
    set({ isLoading: false })
  },

  addAset: async (data) => {
    const { aset_konsesi, ...insertData } = data as any
    const { data: inserted, error } = await supabase.from('aset').insert(insertData).select().single()
    if (error) console.error('[addAset] error:', error)
    if (inserted?.id && aset_konsesi?.length) await get().saveKonsesiLinks(inserted.id, aset_konsesi)
    await get().fetchAset()
  },

  updateAset: async (id, data) => {
    const { id: _id, created_at, updated_at, aset_konsesi, ...updateData } = data as any
    await supabase.from('aset').update(updateData).eq('id', id)
    await get().fetchAset()
  },

  deleteAset: async (id) => {
    await supabase.from('aset').delete().eq('id', id)
    await get().fetchAset()
  },

  setSelected: (aset) => set({ asetSelected: aset }),

  updateStatus: async (id, status) => {
    await supabase.from('aset').update({ status }).eq('id', id)
    await get().fetchAset()
  },

  saveKonsesiLinks: async (asetId, links) => {
    const current = get().daftarAset.find(a => a.id === asetId)?.aset_konsesi ?? []
    const wanted = new Set(links.map(link => link.konsesi_key))
    const removed = current.filter(link => !wanted.has(link.konsesi_key))
    const added = links.filter(link => !current.some(existing => existing.konsesi_key === link.konsesi_key))
    for (const link of removed) {
      const { error } = await supabase.from('aset_konsesi').delete().eq('id', link.id)
      if (error) console.error('[saveKonsesiLinks] delete', error)
    }
    if (added.length) {
      const { error } = await supabase.from('aset_konsesi').insert(added.map(link => ({ aset_id: asetId, ...link })))
      if (error) console.error('[saveKonsesiLinks] insert', error)
    }
  },
}))
