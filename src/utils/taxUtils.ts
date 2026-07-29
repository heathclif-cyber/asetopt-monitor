import { DendaResult, Pembayaran, SuratPeringatan } from '@/types'

interface HitungDendaParams {
  nominal: number
  tglJatuhTempo: string
  /** Tanggal acuan: hari ini (belum lunas) atau tgl pelunasan (sudah lunas) */
  tglHariIni: Date | string
  persenDendaPerHari?: number
  /**
   * Toleransi hari setelah JT sebelum denda mulai (opsional).
   * 0 = denda dihitung sejak hari pertama lewat JT.
   * Catatan: offset JT (mis. 14 hari dari awal periode) sudah jadi tgl_jatuh_tempo —
   * jangan dobel-hitung dengan grace besar di sini.
   */
  maksHariBayar?: number
}

/** Parse YYYY-MM-DD / Date ke siang lokal — hindari off-by-one timezone UTC. */
function parseLocalNoon(input: Date | string): Date {
  if (input instanceof Date) {
    const x = new Date(input)
    x.setHours(12, 0, 0, 0)
    return x
  }
  const key = String(input).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return new Date(`${key}T12:00:00`)
  }
  const x = new Date(input)
  x.setHours(12, 0, 0, 0)
  return x
}

function daysBetween(from: Date | string, to: Date | string): number {
  const a = parseLocalNoon(from).getTime()
  const b = parseLocalNoon(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

/**
 * Denda keterlambatan.
 * - hariTerlambat = hari sejak JT (0 jika bayar pada/sebelum JT)
 * - hari ber-denda = hariTerlambat − maksHariBayar (min 0)
 * - nominal = nominal × %/hari × hari ber-denda
 *
 * Untuk tagihan lunas, panggil dengan tglHariIni = tgl pelunasan
 * agar denda membeku di tanggal bayar (bukan terus naik s.d. hari ini).
 */
export function hitungDenda(params: HitungDendaParams): DendaResult {
  const {
    nominal,
    tglJatuhTempo,
    tglHariIni,
    persenDendaPerHari = 0.001,
    maksHariBayar = 0,
  } = params

  const hariTerlambat = Math.max(0, daysBetween(tglJatuhTempo, tglHariIni))
  const grace = Math.max(0, maksHariBayar ?? 0)
  const hariBerDenda = Math.max(0, hariTerlambat - grace)
  const base = Math.max(0, nominal ?? 0)
  const nominalDenda = base * (persenDendaPerHari ?? 0) * hariBerDenda
  const persenAkumulasi = base > 0 && nominalDenda > 0 ? (nominalDenda / base) * 100 : 0

  return { hariTerlambat, nominalDenda, persenAkumulasi }
}

/** Tgl bayar kumulatif pertama yang membuat total ≥ efektif tagihan. */
export function findTglPelunasan(
  payments: Pick<Pembayaran, 'tgl_bayar' | 'nominal_bayar'>[],
  efektif: number,
): string | null {
  if (efektif <= 0 || !payments?.length) return null
  const sorted = [...payments].sort((a, b) =>
    String(a.tgl_bayar).slice(0, 10).localeCompare(String(b.tgl_bayar).slice(0, 10)),
  )
  let cum = 0
  for (const p of sorted) {
    cum += p.nominal_bayar || 0
    if (cum + 0.5 >= efektif) return String(p.tgl_bayar).slice(0, 10)
  }
  return null
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
