import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { PrognosaBasis } from '@/utils/prognosaUtils'

export const PROGNOSA_COLS = ['jul', 'agu', 'sep', 'okt', 'nov', 'des'] as const

export type PrognosaRow = {
  tahun: number
  kode: string
  nama: string
  cash_jul: number; cash_agu: number; cash_sep: number; cash_okt: number; cash_nov: number; cash_des: number
  pendapatan_jul: number; pendapatan_agu: number; pendapatan_sep: number; pendapatan_okt: number; pendapatan_nov: number; pendapatan_des: number
}

export interface NonaktifRow {
  id: string
  tahun: number
  kode: string
  basis: 'cash_in' | 'pendapatan'
  /** Dasar prognosa tempat penonaktifan ini berlaku; tidak ikut berlaku pada dasar lain. */
  dasar: PrognosaBasis
  /** -1 = seluruh proker; 0–11 = bulan tertentu */
  bulan: number
  alasan: string | null
}

interface PrognosaStore {
  tahun: number | null
  basis: PrognosaBasis
  manualRows: PrognosaRow[]
  nonaktifRows: NonaktifRow[]
  isLoading: boolean
  fetchPrognosa: (tahun: number) => Promise<void>
  setBasis: (tahun: number, basis: PrognosaBasis, username?: string | null) => Promise<void>
  simpanNonaktif: (input: { tahun: number; kode: string; basis: 'cash_in' | 'pendapatan'; dasar: PrognosaBasis; tambah: number[]; hapus: number[]; alasan: string; username?: string | null }) => Promise<void>
  resetNonaktif: (tahun: number, basis: 'cash_in' | 'pendapatan', dasar: PrognosaBasis) => Promise<void>
  _simpanNonaktifKeServer: PrognosaStore['simpanNonaktif']
}

export const usePrognosaStore = create<PrognosaStore>((set, get) => ({
  tahun: null,
  basis: 'rkap',
  manualRows: [],
  nonaktifRows: [],
  isLoading: false,

  fetchPrognosa: async (tahun) => {
    set({ isLoading: true })
    const [manual, nonaktif, setting] = await Promise.all([
      supabase.from('rkap_prognosa').select('*').eq('tahun', tahun),
      supabase.from('rkap_prognosa_nonaktif').select('*').eq('tahun', tahun),
      supabase.from('rkap_prognosa_setting').select('*').eq('tahun', tahun),
    ])
    if (manual.error) console.error('[prognosaStore] manual', manual.error)
    if (nonaktif.error) console.error('[prognosaStore] nonaktif', nonaktif.error)
    if (setting.error) console.error('[prognosaStore] setting', setting.error)
    set({
      tahun,
      manualRows: (manual.data ?? []) as PrognosaRow[],
      nonaktifRows: (nonaktif.data ?? []) as NonaktifRow[],
      basis: ((setting.data ?? [])[0]?.basis as PrognosaBasis | undefined) ?? 'rkap',
      isLoading: false,
    })
  },

  // Layar langsung berubah; penyimpanan menyusul. Bila gagal, kembali ke nilai sebelumnya.
  setBasis: async (tahun, basis, username) => {
    const sebelumnya = get().basis
    set({ basis })
    const { error } = await supabase.from('rkap_prognosa_setting')
      .upsert({ tahun, basis, diubah_oleh: username ?? null, updated_at: new Date().toISOString() }, { onConflict: 'tahun' })
    if (error) {
      set({ basis: sebelumnya })
      throw new Error(error.message || 'Gagal menyimpan dasar prognosa')
    }
  },

  simpanNonaktif: async ({ tahun, kode, basis, dasar, tambah, hapus, alasan, username }) => {
    set(state => ({
      nonaktifRows: [
        ...state.nonaktifRows.filter(r => !(r.tahun === tahun && r.kode === kode && r.basis === basis && r.dasar === dasar && hapus.includes(r.bulan))),
        ...tambah.map(bulan => ({ id: `sementara-${kode}-${basis}-${dasar}-${bulan}`, tahun, kode, basis, dasar, bulan, alasan: alasan || null })),
      ],
    }))
    try {
      await get()._simpanNonaktifKeServer({ tahun, kode, basis, dasar, tambah, hapus, alasan, username })
    } catch (e) {
      await get().fetchPrognosa(tahun)
      throw e
    }
    await get().fetchPrognosa(tahun)
  },

  _simpanNonaktifKeServer: async ({ tahun, kode, basis, dasar, tambah, hapus, alasan, username }) => {
    if (hapus.length) {
      const { error } = await supabase.from('rkap_prognosa_nonaktif').delete()
        .eq('tahun', tahun).eq('kode', kode).eq('basis', basis).eq('dasar', dasar).in('bulan', hapus)
      if (error) throw new Error(error.message || 'Gagal menyimpan penonaktifan')
    }
    if (tambah.length) {
      const { error } = await supabase.from('rkap_prognosa_nonaktif').insert(
        tambah.map(bulan => ({ tahun, kode, basis, dasar, bulan, alasan: alasan || null, dibuat_oleh: username ?? null })),
      )
      if (error) throw new Error(error.message || 'Gagal menyimpan penonaktifan')
    }
  },

  resetNonaktif: async (tahun, basis, dasar) => {
    const { error } = await supabase.from('rkap_prognosa_nonaktif').delete().eq('tahun', tahun).eq('basis', basis).eq('dasar', dasar)
    if (error) throw new Error(error.message || 'Gagal mereset')
    await get().fetchPrognosa(tahun)
  },
}))
