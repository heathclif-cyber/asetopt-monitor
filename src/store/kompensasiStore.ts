import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Kompensasi, Pembayaran, KompensasiWithStatus } from '@/types'
import { findTglPelunasan, hitungDenda } from '@/utils/taxUtils'

interface KompensasiStore {
  daftarKompensasi: Record<string, Kompensasi[]>
  allKompensasi: Kompensasi[]
  isLoading: boolean
  fetchKompensasi: (ksId: string) => Promise<void>
  fetchAllKompensasi: () => Promise<void>
  addKompensasi: (data: Omit<Kompensasi, 'id' | 'nominal_ppn' | 'nominal_pph' | 'total_tagihan' | 'created_at' | 'kerja_sama' | 'pembayaran'>) => Promise<void>
  bulkAddKompensasi: (items: Omit<Kompensasi, 'id' | 'nominal_ppn' | 'nominal_pph' | 'total_tagihan' | 'created_at' | 'kerja_sama' | 'pembayaran'>[]) => Promise<void>
  updateKompensasi: (id: string, data: Partial<Kompensasi>) => Promise<void>
  deleteKompensasi: (id: string) => Promise<void>
  getKompensasiWithStatus: (kompensasi: Kompensasi, pembayaran: Pembayaran[]) => KompensasiWithStatus
}

const GENERATED_COLS = ['nominal_ppn', 'nominal_pph', 'total_tagihan']

function stripKompensasiMeta(data: any) {
  const copy = { ...data }
  for (const col of [...GENERATED_COLS, 'id', 'created_at', 'kerja_sama', 'pembayaran']) {
    delete copy[col]
  }
  return copy
}

export const useKompensasiStore = create<KompensasiStore>((set, get) => ({
  daftarKompensasi: {},
  allKompensasi: [],
  isLoading: false,

  fetchKompensasi: async (ksId) => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('kompensasi')
      .select('*, pembayaran(*), kerja_sama(*, aset(*))')
      .eq('ks_id', ksId)
      .order('tgl_jatuh_tempo', { ascending: true })
    if (data) set(state => ({ daftarKompensasi: { ...state.daftarKompensasi, [ksId]: data as Kompensasi[] } }))
    set({ isLoading: false })
  },

  fetchAllKompensasi: async () => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('kompensasi')
      .select('*, pembayaran(*), kerja_sama(*, aset(*))')
      .order('tgl_jatuh_tempo', { ascending: true })
    if (data) set({ allKompensasi: data as Kompensasi[] })
    set({ isLoading: false })
  },

  addKompensasi: async (data) => {
    const { error } = await supabase.from('kompensasi').insert(data)
    if (error) throw new Error(`Gagal menambah kompensasi: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  bulkAddKompensasi: async (items) => {
    const { error } = await supabase.from('kompensasi').insert(items)
    if (error) throw new Error(`Gagal bulk insert kompensasi: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  updateKompensasi: async (id, data) => {
    const payload = stripKompensasiMeta(data)
    const { error } = await supabase.from('kompensasi').update(payload).eq('id', id)
    if (error) throw new Error(`Gagal update kompensasi: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  deleteKompensasi: async (id) => {
    const { error } = await supabase.from('kompensasi').delete().eq('id', id)
    if (error) throw new Error(`Gagal hapus kompensasi: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  getKompensasiWithStatus: (kompensasi, pembayaran) => {
    const efektifTagihan = Math.max(0, kompensasi.total_tagihan - (kompensasi.pengurang ?? 0))
    const totalDibayar = pembayaran.reduce((sum, p) => sum + p.nominal_bayar, 0)
    const sisaTagihan = Math.max(0, efektifTagihan - totalDibayar)
    const isLunas = efektifTagihan > 0 && totalDibayar + 0.5 >= efektifTagihan

    // Lunas: denda membeku di tgl pelunasan. Belum lunas: denda s.d. hari ini.
    const tglAcuanDenda = isLunas
      ? (findTglPelunasan(pembayaran, efektifTagihan) ?? new Date())
      : new Date()

    const dendaAkumulasi = hitungDenda({
      nominal: kompensasi.nominal,
      tglJatuhTempo: kompensasi.tgl_jatuh_tempo,
      tglHariIni: tglAcuanDenda,
      persenDendaPerHari: (kompensasi.persen_denda_per_hari ?? 0) / 100,
      // Grace denda: 0 — lewat JT langsung ber-denda.
      // (maks_hari_bayar dulu dipakai sebagai grace 14hr → telat 14 hari denda 0)
      maksHariBayar: 0,
    })

    let statusBayar: KompensasiWithStatus['statusBayar'] = 'belum_bayar'
    if (isLunas) {
      statusBayar = 'lunas'
    } else if (totalDibayar > 0) {
      statusBayar = dendaAkumulasi.hariTerlambat > 0 ? 'terlambat' : 'sebagian'
    } else if (dendaAkumulasi.hariTerlambat > 0) {
      statusBayar = 'terlambat'
    }

    return { ...kompensasi, efektifTagihan, totalDibayar, sisaTagihan, dendaAkumulasi, statusBayar }
  },
}))
