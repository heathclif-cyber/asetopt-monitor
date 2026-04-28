import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { CashIn, CashInJenis } from '@/types'

interface CashInStore {
  daftarCashIn: Record<string, CashIn[]>  // key: ks_id
  allCashIn: CashIn[]
  isLoading: boolean
  fetchCashIn: (ksId: string) => Promise<void>
  fetchAllCashIn: () => Promise<void>
  addCashIn: (data: Omit<CashIn, 'id' | 'created_at' | 'kerja_sama' | 'kompensasi'>) => Promise<void>
  updateCashIn: (id: string, data: Partial<Pick<CashIn, 'jenis' | 'tgl_terima' | 'nominal' | 'keterangan' | 'kompensasi_id'>>) => Promise<void>
  deleteCashIn: (id: string) => Promise<void>
}

export const useCashInStore = create<CashInStore>((set, get) => ({
  daftarCashIn: {},
  allCashIn: [],
  isLoading: false,

  fetchCashIn: async (ksId) => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('cash_in')
      .select('*, kerja_sama(*, aset(*))')
      .eq('ks_id', ksId)
      .order('tgl_terima', { ascending: false })
    if (data) set(state => ({ daftarCashIn: { ...state.daftarCashIn, [ksId]: data as CashIn[] } }))
    set({ isLoading: false })
  },

  fetchAllCashIn: async () => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('cash_in')
      .select('*, kerja_sama(*, aset(*))')
      .order('tgl_terima', { ascending: false })
    if (data) set({ allCashIn: data as CashIn[] })
    set({ isLoading: false })
  },

  addCashIn: async (data) => {
    const { error } = await supabase.from('cash_in').insert(data)
    if (error) throw new Error(`Gagal menambah cash in: ${error.message}`)
    await get().fetchAllCashIn()
    await get().fetchCashIn(data.ks_id)
  },

  updateCashIn: async (id, data) => {
    const { error } = await supabase.from('cash_in').update(data).eq('id', id)
    if (error) throw new Error(`Gagal update cash in: ${error.message}`)
    await get().fetchAllCashIn()
  },

  deleteCashIn: async (id) => {
    const { error } = await supabase.from('cash_in').delete().eq('id', id)
    if (error) throw new Error(`Gagal hapus cash in: ${error.message}`)
    await get().fetchAllCashIn()
  },
}))

export const CASH_IN_JENIS_LABEL: Record<CashInJenis, string> = {
  denda: 'Denda Keterlambatan',
  lainnya: 'Pendapatan Lainnya',
}
