import { create } from 'zustand'
import { api } from '@/lib/api'
import { Kompensasi, SuratPeringatan, LogNotifikasi, SPJenis } from '@/types'
import { cekJatuhTempoH14 } from '@/utils/notifikasiUtils'
import { kirimWA } from '@/services/waService'

interface NotifikasiStore {
  jatuhTempoH14: Kompensasi[]
  spAktif: SuratPeringatan[]
  logNotifikasi: LogNotifikasi[]
  isLoading: boolean
  checkJatuhTempo: (allKompensasi: Kompensasi[]) => void
  fetchSPAktif: () => Promise<void>
  fetchLog: () => Promise<void>
  terbitkanSP: (ksId: string, kompensasiId: string | null, jenis: SPJenis) => Promise<void>
  kirimNotifWA: (params: { noWA: string; pesan: string; ksId: string; jenis: string }) => Promise<boolean>
  fetchAllSP: () => Promise<SuratPeringatan[]>
}

export const useNotifikasiStore = create<NotifikasiStore>((set, get) => ({
  jatuhTempoH14: [],
  spAktif: [],
  logNotifikasi: [],
  isLoading: false,

  checkJatuhTempo: (allKompensasi) => {
    set({ jatuhTempoH14: cekJatuhTempoH14(allKompensasi) })
  },

  fetchSPAktif: async () => {
    const { data } = await api.get<SuratPeringatan[]>('/api/surat-peringatan?status=aktif')
    if (data) set({ spAktif: data })
  },

  fetchLog: async () => {
    set({ isLoading: true })
    const { data } = await api.get<LogNotifikasi[]>('/api/log-notifikasi')
    if (data) set({ logNotifikasi: data })
    set({ isLoading: false })
  },

  terbitkanSP: async (ksId, kompensasiId, jenis) => {
    const tglTerbit = new Date().toISOString().split('T')[0]
    const tglDeadline = new Date()
    tglDeadline.setDate(tglDeadline.getDate() + 14)

    await api.post('/api/surat-peringatan', {
      ks_id: ksId,
      kompensasi_id: kompensasiId,
      jenis,
      tgl_terbit: tglTerbit,
      tgl_deadline: tglDeadline.toISOString().split('T')[0],
      status: 'aktif',
    })

    const newStatus = jenis === 'PUTUS' ? 'putus' : jenis.toLowerCase()
    // update status KS via backend — fetch current KS first
    const { data: ksList } = await api.get<any[]>('/api/kerja-sama')
    const ks = ksList?.find(k => k.id === ksId)
    if (ks) await api.put(`/api/kerja-sama/${ksId}`, { ...ks, status: newStatus })

    await get().fetchSPAktif()
  },

  kirimNotifWA: async ({ noWA, pesan, ksId, jenis }) => {
    const result = await kirimWA({ noWA, pesan })
    await api.post('/api/log-notifikasi', {
      ks_id: ksId,
      jenis,
      no_wa: noWA,
      pesan,
      status_kirim: result.status ? 'terkirim' : 'gagal',
    })
    await get().fetchLog()
    return result.status
  },

  fetchAllSP: async () => {
    const { data } = await api.get<SuratPeringatan[]>('/api/surat-peringatan')
    return data ?? []
  },
}))
