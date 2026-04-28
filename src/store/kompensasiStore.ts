import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { Kompensasi, Pembayaran, KompensasiWithStatus } from '@/types'
import { hitungDenda } from '@/utils/taxUtils'

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
  catatPembayaran: (data: Omit<Pembayaran, 'id' | 'created_at'>) => Promise<void>
  updatePembayaran: (id: string, data: Partial<Pick<Pembayaran, 'tgl_bayar' | 'nominal_bayar' | 'bukti_url' | 'keterangan'>>) => Promise<void>
  deletePembayaran: (id: string) => Promise<void>
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

  catatPembayaran: async (data) => {
    const { error } = await supabase.from('pembayaran').insert(data)
    if (error) throw new Error(`Gagal catat pembayaran: ${error.message}`)
    const kompensasi = Object.values(get().daftarKompensasi).flat().find(k => k.id === data.kompensasi_id)
    if (kompensasi) await get().fetchKompensasi(kompensasi.ks_id)
    await get().fetchAllKompensasi()
  },

  updatePembayaran: async (id, data) => {
    const { error } = await supabase.from('pembayaran').update(data).eq('id', id)
    if (error) throw new Error(`Gagal update pembayaran: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  deletePembayaran: async (id) => {
    const { error } = await supabase.from('pembayaran').delete().eq('id', id)
    if (error) throw new Error(`Gagal hapus pembayaran: ${error.message}`)
    await get().fetchAllKompensasi()
  },

  getKompensasiWithStatus: (kompensasi, pembayaran) => {
    const efektifTagihan = Math.max(0, kompensasi.total_tagihan - (kompensasi.pengurang ?? 0))
    const totalDibayar = pembayaran.reduce((sum, p) => sum + p.nominal_bayar, 0)
    const sisaTagihan = Math.max(0, efektifTagihan - totalDibayar)
    const dendaAkumulasi = hitungDenda({
      nominal: kompensasi.nominal,
      tglJatuhTempo: kompensasi.tgl_jatuh_tempo,
      tglHariIni: new Date(),
      persenDendaPerHari: kompensasi.persen_denda_per_hari / 100,
      maksHariBayar: kompensasi.maks_hari_bayar,
    })

    let statusBayar: KompensasiWithStatus['statusBayar'] = 'belum_bayar'
    if (totalDibayar >= efektifTagihan) {
      statusBayar = 'lunas'
    } else if (totalDibayar > 0) {
      statusBayar = dendaAkumulasi.hariTerlambat > 0 ? 'terlambat' : 'sebagian'
    } else if (dendaAkumulasi.hariTerlambat > 0) {
      statusBayar = 'terlambat'
    }

    return { ...kompensasi, efektifTagihan, totalDibayar, sisaTagihan, dendaAkumulasi, statusBayar }
  },
}))
