import { Kompensasi } from '@/types'
import { formatRupiah, formatTanggal } from '@/lib/utils'

export function cekJatuhTempoH14(daftarKompensasi: Kompensasi[]): Kompensasi[] {
  const hariIni = new Date()
  hariIni.setHours(0, 0, 0, 0)
  const h14 = new Date()
  h14.setDate(h14.getDate() + 14)
  h14.setHours(23, 59, 59, 999)

  return daftarKompensasi.filter(k => {
    const jt = new Date(k.tgl_jatuh_tempo)
    return jt >= hariIni && jt <= h14
  })
}

interface BuatPesanWAParams {
  namaAset: string
  namaMitra: string
  nominal: number
  tglJatuhTempo: string
  jenisPesan: string
}

export function buatPesanWA(params: BuatPesanWAParams): string {
  const { namaAset, namaMitra, nominal, tglJatuhTempo, jenisPesan } = params

  const pesan: Record<string, string> = {
    jatuh_tempo_h14: `Yth. ${namaMitra},\n\nKami menginformasikan bahwa kompensasi kerja sama aset *${namaAset}* sebesar *${formatRupiah(nominal)}* akan jatuh tempo pada *${formatTanggal(tglJatuhTempo)}*.\n\nMohon segera melakukan pembayaran sesuai ketentuan perjanjian.\n\nTerima kasih.`,
    SP1: `Yth. ${namaMitra},\n\n*SURAT PERINGATAN PERTAMA (SP1)*\n\nKompensasi aset *${namaAset}* telah melewati batas pembayaran. Mohon segera melunasi kewajiban dalam 14 hari sejak surat ini diterbitkan.\n\nTerima kasih.`,
    SP2: `Yth. ${namaMitra},\n\n*SURAT PERINGATAN KEDUA (SP2)*\n\nHingga saat ini kompensasi aset *${namaAset}* belum dilunasi. Ini adalah peringatan kedua. Pelunasan wajib dilakukan dalam 14 hari.\n\nTerima kasih.`,
    SP3: `Yth. ${namaMitra},\n\n*SURAT PERINGATAN KETIGA (SP3)*\n\nKompensasi aset *${namaAset}* belum juga dilunasi. Ini adalah peringatan terakhir. Jika tidak dilunasi dalam 14 hari, kerja sama akan diputus.\n\nTerima kasih.`,
  }

  return pesan[jenisPesan] || ''
}
