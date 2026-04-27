import { DendaResult, SuratPeringatan } from '@/types'

interface HitungDendaParams {
  nominal: number
  tglJatuhTempo: string
  tglHariIni: Date
  persenDendaPerHari?: number
}

export function hitungDenda(params: HitungDendaParams): DendaResult {
  const { nominal, tglJatuhTempo, tglHariIni, persenDendaPerHari = 0.001 } = params
  const jtTempo = new Date(tglJatuhTempo)
  const hari = Math.max(0, Math.floor((tglHariIni.getTime() - jtTempo.getTime()) / (1000 * 60 * 60 * 24)))
  const nominalDenda = nominal * persenDendaPerHari * hari
  const persenAkumulasi = (nominalDenda / nominal) * 100
  return { hariTerlambat: hari, nominalDenda, persenAkumulasi }
}

interface TentukanStatusSPParams {
  persenDenda: number
  riwayatSP: SuratPeringatan[]
}

export type AksiSP = 'TIDAK_ADA' | 'TERBITKAN_SP1' | 'TERBITKAN_SP2' | 'TERBITKAN_SP3' | 'LAKUKAN_PEMUTUSAN' | 'MONITORING'

export function tentukanStatusSP(params: TentukanStatusSPParams): { aksi: AksiSP } {
  const { persenDenda, riwayatSP } = params
  const hariIni = new Date()
  const spAktif = riwayatSP.filter(sp => sp.jenis !== 'PUTUS')
  const spTerakhir = spAktif[spAktif.length - 1]

  if (!spTerakhir) {
    if (persenDenda >= 5) return { aksi: 'TERBITKAN_SP1' }
    return { aksi: 'TIDAK_ADA' }
  }

  const hariSejak = Math.floor((hariIni.getTime() - new Date(spTerakhir.tgl_terbit).getTime()) / (1000 * 60 * 60 * 24))

  if (spTerakhir.jenis === 'SP1' && hariSejak >= 14) return { aksi: 'TERBITKAN_SP2' }
  if (spTerakhir.jenis === 'SP2' && hariSejak >= 14) return { aksi: 'TERBITKAN_SP3' }
  if (spTerakhir.jenis === 'SP3' && hariSejak >= 14) return { aksi: 'LAKUKAN_PEMUTUSAN' }

  return { aksi: 'MONITORING' }
}
