import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
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
    const { data } = await supabase
      .from('surat_peringatan')
      .select('*, kerja_sama(*, aset(*))')
      .eq('status', 'aktif')
      .order('tgl_terbit', { ascending: false })
    if (data) set({ spAktif: data as SuratPeringatan[] })
  },

  fetchLog: async () => {
    set({ isLoading: true })
    const { data } = await supabase
      .from('log_notifikasi')
      .select('*, kerja_sama(*, aset(*))')
      .order('tgl_kirim', { ascending: false })
    if (data) set({ logNotifikasi: data as LogNotifikasi[] })
    set({ isLoading: false })
  },

  terbitkanSP: async (ksId, kompensasiId, jenis) => {
    const tglTerbit = new Date().toISOString().split('T')[0]
    const tglDeadlineDate = new Date()
    tglDeadlineDate.setDate(tglDeadlineDate.getDate() + 14)
    const tglDeadline = tglDeadlineDate.toISOString().split('T')[0]

    await supabase.from('surat_peringatan').insert({
      ks_id: ksId,
      kompensasi_id: kompensasiId,
      jenis,
      tgl_terbit: tglTerbit,
      tgl_deadline: tglDeadline,
      status: 'aktif',
    })

    const newStatus = jenis === 'PUTUS' ? 'putus' : jenis.toLowerCase()
    await supabase.from('kerja_sama').update({ status: newStatus }).eq('id', ksId)

    await get().fetchSPAktif()
  },

  kirimNotifWA: async ({ noWA, pesan, ksId, jenis }) => {
    const result = await kirimWA({ noWA, pesan })
    await supabase.from('log_notifikasi').insert({
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
    const { data } = await supabase
      .from('surat_peringatan')
      .select('*, kerja_sama(*, aset(*))')
      .order('tgl_terbit', { ascending: false })
    return (data as SuratPeringatan[]) ?? []
  },
}))
