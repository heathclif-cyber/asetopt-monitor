import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { KonsesiBangunan, KonsesiProfil, KonsesiSPPT } from '@/types'
import { useKonsesiStore } from '@/store/konsesiStore'

interface KonsesiMasterStore {
  konsesiKey: string | null
  profil: KonsesiProfil | null
  sppt: KonsesiSPPT[]
  bangunan: KonsesiBangunan[]
  isLoading: boolean
  semuaSPPT: KonsesiSPPT[]
  isLoadingSemua: boolean
  fetchAllSPPT: () => Promise<void>
  fetchDetail: (konsesiKey: string) => Promise<void>
  saveProfil: (data: Omit<KonsesiProfil, 'updated_at'>) => Promise<boolean>
  saveSPPT: (data: Omit<KonsesiSPPT, 'id' | 'created_at'>, id?: string) => Promise<boolean>
  deleteSPPT: (id: string) => Promise<void>
  saveBangunan: (data: Omit<KonsesiBangunan, 'id' | 'created_at'>, id?: string) => Promise<boolean>
  deleteBangunan: (id: string) => Promise<void>
}

// Keeps master aset counters (SPPT year, bangunan) current after an edit.
async function refreshAfterEdit(konsesiKey: string) {
  const store = useKonsesiMasterStore.getState()
  await Promise.all([
    store.fetchDetail(konsesiKey),
    useKonsesiStore.getState().fetchKonsesi(true),
    store.semuaSPPT.length ? store.fetchAllSPPT() : Promise.resolve(),
  ])
}

export const useKonsesiMasterStore = create<KonsesiMasterStore>((set, get) => ({
  konsesiKey: null,
  profil: null,
  sppt: [],
  bangunan: [],
  isLoading: false,
  semuaSPPT: [],
  isLoadingSemua: false,

  fetchAllSPPT: async () => {
    set({ isLoadingSemua: true })
    const { data, error } = await supabase.from('konsesi_sppt').select('*').order('tahun', { ascending: false })
    if (error) console.error('[fetchAllSPPT]', error)
    set({ semuaSPPT: (data ?? []) as KonsesiSPPT[], isLoadingSemua: false })
  },

  fetchDetail: async (konsesiKey) => {
    set({ isLoading: true, konsesiKey })
    const [profil, sppt, bangunan] = await Promise.all([
      supabase.from('konsesi_profil').select('*').eq('konsesi_key', konsesiKey),
      supabase.from('konsesi_sppt').select('*').eq('konsesi_key', konsesiKey).order('tahun', { ascending: false }),
      supabase.from('konsesi_bangunan').select('*').eq('konsesi_key', konsesiKey).order('created_at', { ascending: true }),
    ])
    for (const result of [profil, sppt, bangunan]) if (result.error) console.error('[fetchDetail]', result.error)
    // A slower response for a previously opened concession must not win.
    if (get().konsesiKey !== konsesiKey) return
    set({
      profil: (profil.data?.[0] as KonsesiProfil | undefined) ?? null,
      sppt: (sppt.data ?? []) as KonsesiSPPT[],
      bangunan: (bangunan.data ?? []) as KonsesiBangunan[],
      isLoading: false,
    })
  },

  saveProfil: async (data) => {
    const { error } = await supabase.from('konsesi_profil').upsert(data, { onConflict: 'konsesi_key' })
    if (error) { console.error('[saveProfil]', error); return false }
    await refreshAfterEdit(data.konsesi_key)
    return true
  },

  saveSPPT: async (data, id) => {
    const { error } = id
      ? await supabase.from('konsesi_sppt').update(data).eq('id', id)
      : await supabase.from('konsesi_sppt').insert(data)
    if (error) { console.error('[saveSPPT]', error); return false }
    await refreshAfterEdit(data.konsesi_key)
    return true
  },

  deleteSPPT: async (id) => {
    const { error } = await supabase.from('konsesi_sppt').delete().eq('id', id)
    if (error) console.error('[deleteSPPT]', error)
    const key = get().konsesiKey
    if (key) await refreshAfterEdit(key)
  },

  saveBangunan: async (data, id) => {
    const { error } = id
      ? await supabase.from('konsesi_bangunan').update(data).eq('id', id)
      : await supabase.from('konsesi_bangunan').insert(data)
    if (error) { console.error('[saveBangunan]', error); return false }
    await refreshAfterEdit(data.konsesi_key)
    return true
  },

  deleteBangunan: async (id) => {
    const { error } = await supabase.from('konsesi_bangunan').delete().eq('id', id)
    if (error) console.error('[deleteBangunan]', error)
    const key = get().konsesiKey
    if (key) await refreshAfterEdit(key)
  },
}))
