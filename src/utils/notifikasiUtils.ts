import { Kompensasi, SPJenis, SuratPeringatan } from '@/types'
import { getSPDeadline, hitungDenda, tentukanStatusSP } from '@/utils/taxUtils'
import { formatRupiah, formatTanggal } from '@/lib/utils'

export function cekJatuhTempoH14(daftarKompensasi: Kompensasi[]): Kompensasi[] {
  const hariIni = new Date()
  hariIni.setHours(0, 0, 0, 0)
  const h14 = new Date()
  h14.setDate(h14.getDate() + 14)
  h14.setHours(23, 59, 59, 999)

  return daftarKompensasi.filter(k => {
    const efektifTagihan = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
    if (totalDibayar >= efektifTagihan && efektifTagihan > 0) return false
    if (efektifTagihan <= 0) return false

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

export interface SPEligibility {
  jenis: SPJenis | null
  tglLayak: Date | null
  eligible: boolean
  alasan: string
  kompensasiId: string | null
  totalSisa: number
  persenDenda: number
}

export function getSPEligibility(
  kompensasi: Kompensasi[],
  riwayatSP: SuratPeringatan[],
  today = new Date(),
): SPEligibility {
  const outstanding = kompensasi.map(k => ({
    k,
    sisa: Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0) - (k.pembayaran ?? []).reduce((sum, p) => sum + Number(p.nominal_bayar), 0)),
  })).filter(item => item.sisa > 0.5)
  const totalSisa = outstanding.reduce((sum, item) => sum + item.sisa, 0)
  const candidates = outstanding.filter(({ k }) => k.nominal > 0 && k.persen_denda_per_hari > 0).map(({ k }) => {
    const date = new Date(`${k.tgl_jatuh_tempo.slice(0, 10)}T12:00:00`)
    date.setDate(date.getDate() + Math.ceil(5 / k.persen_denda_per_hari - 1e-9))
    return { k, date, persen: hitungDenda({ nominal: k.nominal, tglJatuhTempo: k.tgl_jatuh_tempo, tglHariIni: today, persenDendaPerHari: k.persen_denda_per_hari / 100, maksHariBayar: 0 }).persenAkumulasi }
  }).filter(item => Number.isFinite(item.date.getTime())).sort((a, b) => a.date.getTime() - b.date.getTime())
  const candidate = candidates[0]
  const latest = riwayatSP.filter(sp => sp.status === 'aktif').sort((a, b) => b.tgl_terbit.localeCompare(a.tgl_terbit) || b.created_at.localeCompare(a.created_at))[0]
  const blocked = (alasan: string): SPEligibility => ({ jenis: null, tglLayak: null, eligible: false, alasan, kompensasiId: null, totalSisa, persenDenda: candidate?.persen ?? 0 })
  if (!outstanding.length) return blocked('Tidak ada tagihan yang belum lunas.')
  if (latest?.jenis === 'PUTUS') return blocked('Pemutusan sudah diterbitkan.')
  if (!latest && !candidate) return blocked('Tidak ada tagihan dengan tarif denda untuk mencapai ambang SP1.')
  const result = tentukanStatusSP({ persenDenda: candidate?.persen ?? 0, riwayatSP, tglHariIni: today })
  const next: Record<SPJenis, SPJenis | null> = { SP1: 'SP2', SP2: 'SP3', SP3: 'PUTUS', PUTUS: null }
  const jenis = latest ? next[latest.jenis] : 'SP1'
  const tglLayak = latest ? getSPDeadline(latest) : candidate!.date
  const eligible = ['TERBITKAN_SP1', 'TERBITKAN_SP2', 'TERBITKAN_SP3', 'LAKUKAN_PEMUTUSAN'].includes(result.aksi)
  return {
    jenis, tglLayak, eligible,
    alasan: eligible ? `${jenis} dapat diterbitkan.` : `${jenis} dapat diterbitkan mulai ${formatTanggal(tglLayak.toLocaleDateString('en-CA'))}.`,
    kompensasiId: outstanding.find(item => item.k.id === latest?.kompensasi_id)?.k.id ?? candidate?.k.id ?? outstanding[0].k.id,
    totalSisa, persenDenda: candidate?.persen ?? 0,
  }
}
