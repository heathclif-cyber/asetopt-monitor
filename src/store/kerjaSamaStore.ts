import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
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

// kerja_sama_aset is the single list of assets per agreement (luas per aset
// lives there); the primary kerja_sama.aset_id must always appear in it.
async function linkAset(ksId: string, asetId: string) {
  const { error } = await supabase
    .from('kerja_sama_aset')
    .upsert({ ks_id: ksId, aset_id: asetId }, { onConflict: 'ks_id,aset_id', ignoreDuplicates: true })
  if (error) console.error('[linkAset]', error)
}

export const useKerjaSamaStore = create<KerjaSamaStore>((set, get) => ({
  daftarKS: [],
  ksSelected: null,
  isLoading: false,

  fetchKS: async () => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('kerja_sama')
      .select('*, aset(*)')
      .order('created_at', { ascending: false })
    if (error) console.error('[fetchKS]', error)
    if (data) set({ daftarKS: data as KerjaSama[] })
    set({ isLoading: false })
  },

  addKS: async (data) => {
    const { data: inserted } = await supabase
      .from('kerja_sama')
      .insert(data)
      .select()
      .single()
    if (inserted?.id && data.aset_id) await linkAset(inserted.id, data.aset_id)
    await get().fetchKS()
    return inserted?.id ?? null
  },

  updateKS: async (id, data) => {
    const { id: _id, created_at, aset, kerja_sama_aset, ...updateData } = data as any
    const previousAsetId = get().daftarKS.find(ks => ks.id === id)?.aset_id
    await supabase.from('kerja_sama').update(updateData).eq('id', id)
    if (updateData.aset_id && updateData.aset_id !== previousAsetId) {
      if (previousAsetId) await supabase.from('kerja_sama_aset').delete().eq('ks_id', id).eq('aset_id', previousAsetId)
      await linkAset(id, updateData.aset_id)
    }
    await get().fetchKS()
  },

  updateStatusKS: async (id, status) => {
    await supabase.from('kerja_sama').update({ status }).eq('id', id)
    await get().fetchKS()
  },

  setSelected: (ks) => set({ ksSelected: ks }),
}))
