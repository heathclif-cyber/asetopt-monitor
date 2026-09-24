import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { NJOP } from '@/types'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'

interface NJOPStore {
  dataNJOP: Record<string, NJOP[]>
  isLoading: boolean
  fetchNJOP: (asetId: string) => Promise<void>
  fetchAllNJOP: () => Promise<void>
  getNJOPTerbaru: (asetId: string) => NJOP | null
  hitungPotensiAset: (asetId: string, luasTanah: number, luasBangunan: number) => ReturnType<typeof hitungPotensiNJOP> | null
}

interface SPPTRow {
  id: string
  konsesi_key: string
  tahun: number
  no_sppt: string | null
  njop_tanah_per_m2: number
  njop_bangunan_per_m2: number
  created_at: string
}

// NJOP is owned by the concession (konsesi_sppt). Optimised assets read the
// NJOP of the concession(s) they are linked to through aset_konsesi, so every
// module keeps its per-aset lookups while there is one source of the value.
export const useNJOPStore = create<NJOPStore>((set, get) => ({
  dataNJOP: {},
  isLoading: false,

  fetchNJOP: async () => {
    await get().fetchAllNJOP()
  },

  fetchAllNJOP: async () => {
    set({ isLoading: true })
    const [sppt, links] = await Promise.all([
      supabase.from('konsesi_sppt').select('id, konsesi_key, tahun, no_sppt, njop_tanah_per_m2, njop_bangunan_per_m2, created_at').order('tahun', { ascending: false }),
      supabase.from('aset_konsesi').select('aset_id, konsesi_key'),
    ])
    if (sppt.error) console.error('[fetchAllNJOP] sppt', sppt.error)
    if (links.error) console.error('[fetchAllNJOP] aset_konsesi', links.error)
    const byKonsesi = new Map<string, SPPTRow[]>()
    for (const row of (sppt.data ?? []) as SPPTRow[]) byKonsesi.set(row.konsesi_key, [...(byKonsesi.get(row.konsesi_key) ?? []), row])
    const byAset: Record<string, NJOP[]> = {}
    for (const link of (links.data ?? []) as { aset_id: string; konsesi_key: string }[]) {
      for (const row of byKonsesi.get(link.konsesi_key) ?? []) {
        (byAset[link.aset_id] ??= []).push({
          id: row.id,
          aset_id: link.aset_id,
          tahun: row.tahun,
          nilai_tanah_per_m2: Number(row.njop_tanah_per_m2),
          nilai_bangunan_per_m2: Number(row.njop_bangunan_per_m2),
          sumber: row.no_sppt ? `SPPT ${row.no_sppt}` : 'SPPT/NJOP konsesi',
          created_at: row.created_at,
        })
      }
    }
    for (const list of Object.values(byAset)) list.sort((a, b) => b.tahun - a.tahun)
    set({ dataNJOP: byAset, isLoading: false })
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
