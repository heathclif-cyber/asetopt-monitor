import { create } from 'zustand'
import { api } from '@/lib/api'
import { Kompensasi, Pembayaran, KompensasiWithStatus } from '@/types'
import { hitungDenda } from '@/utils/taxUtils'

interface KompensasiStore {
  daftarKompensasi: Record<string, Kompensasi[]>
  allKompensasi: Kompensasi[]
  isLoading: boolean
  fetchKompensasi: (ksId: string) => Promise<void>
  fetchAllKompensasi: () => Promise<void>
  addKompensasi: (data: Omit<Kompensasi, 'id' | 'nominal_ppn' | 'nominal_pph' | 'total_tagihan' | 'created_at' | 'kerja_sama' | 'pembayaran'>) => Promise<void>
  updateKompensasi: (id: string, data: Partial<Kompensasi>) => Promise<void>
  catatPembayaran: (data: Omit<Pembayaran, 'id' | 'created_at'>) => Promise<void>
  getKompensasiWithStatus: (kompensasi: Kompensasi, pembayaran: Pembayaran[]) => KompensasiWithStatus
}

export const useKompensasiStore = create<KompensasiStore>((set, get) => ({
  daftarKompensasi: {},
  allKompensasi: [],
  isLoading: false,

  fetchKompensasi: async (ksId) => {
    set({ isLoading: true })
    const { data } = await api.get<Kompensasi[]>(`/api/kompensasi?ks_id=${ksId}`)
    if (data) set(state => ({ daftarKompensasi: { ...state.daftarKompensasi, [ksId]: data } }))
    set({ isLoading: false })
  },

  fetchAllKompensasi: async () => {
    set({ isLoading: true })
    const { data } = await api.get<Kompensasi[]>('/api/kompensasi')
    if (data) set({ allKompensasi: data })
    set({ isLoading: false })
  },

  addKompensasi: async (data) => {
    await api.post('/api/kompensasi', data)
    await get().fetchKompensasi(data.ks_id)
  },

  updateKompensasi: async (id, data) => {
    await api.put(`/api/kompensasi/${id}`, data)
    await get().fetchAllKompensasi()
  },

  catatPembayaran: async (data) => {
    await api.post('/api/pembayaran', data)
    const kompensasi = Object.values(get().daftarKompensasi).flat().find(k => k.id === data.kompensasi_id)
    if (kompensasi) await get().fetchKompensasi(kompensasi.ks_id)
    await get().fetchAllKompensasi()
  },

  getKompensasiWithStatus: (kompensasi, pembayaran) => {
    const totalDibayar = pembayaran.reduce((sum, p) => sum + p.nominal_bayar, 0)
    const sisaTagihan = Math.max(0, kompensasi.total_tagihan - totalDibayar)
    const dendaAkumulasi = hitungDenda({
      nominal: kompensasi.nominal,
      tglJatuhTempo: kompensasi.tgl_jatuh_tempo,
      tglHariIni: new Date(),
      persenDendaPerHari: kompensasi.persen_denda_per_hari / 100,
    })

    let statusBayar: KompensasiWithStatus['statusBayar'] = 'belum_bayar'
    if (totalDibayar >= kompensasi.total_tagihan) {
      statusBayar = 'lunas'
    } else if (totalDibayar > 0) {
      statusBayar = dendaAkumulasi.hariTerlambat > 0 ? 'terlambat' : 'sebagian'
    } else if (dendaAkumulasi.hariTerlambat > 0) {
      statusBayar = 'terlambat'
    }

    return { ...kompensasi, totalDibayar, sisaTagihan, dendaAkumulasi, statusBayar }
  },
}))
