import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { RKAPItem } from '@/data/rkap2026'

export const BULAN_COLS = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const
export type BulanCol = typeof BULAN_COLS[number]

export interface RKAPTargetRow {
  id: string
  tahun: number
  no: number
  kode?: string
  nama: string
  total: number
  jan: number; feb: number; mar: number; apr: number
  mei: number; jun: number; jul: number; agu: number
  sep: number; okt: number; nov: number; des: number
  created_at?: string
}

export function rowToRKAPItem(row: RKAPTargetRow): RKAPItem {
  return {
    no: row.no,
    kode: row.kode ?? '',
    nama: row.nama,
    total: row.total,
    bulan: BULAN_COLS.map(col => row[col] ?? 0),
  }
}

interface RKAPStore {
  rows: RKAPTargetRow[]
  tahunAktif: number
  isLoading: boolean
  fetchRKAP: (tahun: number) => Promise<void>
  upsertRow: (data: Omit<RKAPTargetRow, 'id' | 'created_at'>) => Promise<void>
  deleteRow: (id: string, tahun: number) => Promise<void>
  bulkImport: (tahun: number, items: Array<Omit<RKAPTargetRow, 'id' | 'created_at'>>) => Promise<void>
  setTahunAktif: (tahun: number) => void
}

export const useRKAPStore = create<RKAPStore>((set, get) => ({
  rows: [],
  tahunAktif: new Date().getFullYear(),
  isLoading: false,

  fetchRKAP: async (tahun) => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('rkap_target')
      .select('*')
      .eq('tahun', tahun)
      .order('no', { ascending: true })
    if (error) console.error('[fetchRKAP]', error)
    if (data) set({ rows: data as RKAPTargetRow[], tahunAktif: tahun })
    set({ isLoading: false })
  },

  upsertRow: async (data) => {
    const payload = data as any
    if (payload.id) {
      const { id, ...rest } = payload
      const { error } = await supabase
        .from('rkap_target')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) console.error('[updateRow]', error)
    } else {
      const { error } = await supabase
        .from('rkap_target')
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'tahun,no' })
      if (error) console.error('[insertRow]', error)
    }
    await get().fetchRKAP(payload.tahun)
  },

  deleteRow: async (id, tahun) => {
    await supabase.from('rkap_target').delete().eq('id', id)
    await get().fetchRKAP(tahun)
  },

  bulkImport: async (tahun, items) => {
    set({ isLoading: true })
    // Hapus data lama untuk tahun tersebut, lalu insert semua baris baru
    await supabase.from('rkap_target').delete().eq('tahun', tahun)
    if (items.length > 0) {
      const { error } = await supabase.from('rkap_target').insert(
        items.map(r => ({ ...r, tahun, updated_at: new Date().toISOString() }))
      )
      if (error) console.error('[bulkImport]', error)
    }
    await get().fetchRKAP(tahun)
  },

  setTahunAktif: (tahun) => set({ tahunAktif: tahun }),
}))
