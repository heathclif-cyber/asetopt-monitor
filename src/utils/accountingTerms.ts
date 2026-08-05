/**
 * Standar istilah keuangan AsetOpt — single source of truth (SSOT).
 * Semua laporan (HO, Pendapatan, Monitoring, Piutang) WAJIB memakai helper ini.
 * Lihat STANDAR_AKUNTANSI.md di root proyek.
 */
import type { Kompensasi, Pembayaran, CashIn, PPHMode } from '@/types'

/** Label resmi — jangan hardcode string lain di UI keuangan */
export const AK = {
  nominal: 'Nominal',
  pendapatan: 'Pendapatan',
  tagihan: 'Tagihan',
  cashIn: 'Cash In',
  sisa: 'Sisa',
  piutang: 'Piutang',
  targetRkap: 'Target RKAP',
  capaian: 'Capaian',
  ppn: 'PPN',
  pph: 'PPH',
  pbb: 'PBB',
  noBilling: 'No Billing',
  denda: 'Denda',
} as const

/** Tagihan efektif yang ditagihkan ke mitra */
export function hitungTagihan(k: Pick<Kompensasi, 'total_tagihan' | 'pengurang'>): number {
  return Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
}

/** Pendapatan (akrual) = DPP / nominal sewa */
export function hitungPendapatan(k: Pick<Kompensasi, 'nominal'>): number {
  return Math.max(0, k.nominal ?? 0)
}

/** Hasil alokasi 1 pembayaran ke kolom format HO */
export interface AlokasiPembayaranHO {
  /** Porsi DPP (pokok) */
  kompensasi: number
  /** Porsi PPN (positif) */
  ppn: number
  /** Porsi PPH — negatif hanya jika pph_mode = bukti_potong; selain itu 0 */
  pph: number
  /**
   * Total Cash In SSOT = **nominal_bayar** (uang masuk aktual).
   * Invariant: kompensasi + ppn + pph === total (selisih pembulatan ke kompensasi).
   */
  total: number
}

/**
 * Alokasi pembayaran → kolom HO (Kompensasi / PPN / PPH).
 *
 * **SSOT Total = `bayar` (uang masuk), bukan hasil hitung ulang pajak.**
 *
 * - `pph_mode = bukti_potong`: mitra transfer DPP+PPN−PPH → PPH dicatat negatif
 * - `pph_mode = none` (atau lain): PPH **tidak** mengurangi Cash In → pph kolom = 0
 * - Kelebihan bayar di atas tagihan → ditambahkan ke kompensasi
 */
export function alokasiPembayaranKeHO(
  k: Pick<Kompensasi, 'nominal' | 'nominal_ppn' | 'nominal_pph' | 'total_tagihan' | 'pengurang' | 'pph_mode'>,
  bayar: number,
): AlokasiPembayaranHO {
  if (!(bayar > 0)) return { kompensasi: 0, ppn: 0, pph: 0, total: 0 }

  const dpp = hitungPendapatan(k)
  const ppnBase = Math.max(0, k.nominal_ppn ?? 0)
  const pphAbs = Math.max(0, k.nominal_pph ?? 0)
  const mode = (k.pph_mode ?? 'none') as PPHMode
  const pphReduces = mode === 'bukti_potong'
  const tagihan = hitungTagihan(k)

  // Tidak ada tagihan efektif → seluruh bayar = kompensasi (Cash In tetap = bayar)
  if (tagihan <= 0.5) {
    return { kompensasi: bayar, ppn: 0, pph: 0, total: bayar }
  }

  const ratio = Math.min(1, bayar / tagihan)
  let kompensasi = dpp * ratio
  let ppn = ppnBase * ratio
  let pph = pphReduces && pphAbs > 0 ? -pphAbs * ratio : 0

  // Kelebihan bayar di atas tagihan → ke kompensasi
  if (bayar > tagihan + 0.5) {
    kompensasi += bayar - tagihan
  }

  // Kunci invariant: komponen wajib menjumlah ke bayar (SSOT)
  const drift = bayar - (kompensasi + ppn + pph)
  if (Math.abs(drift) > 0.005) {
    kompensasi += drift
  }

  return {
    kompensasi,
    ppn,
    pph,
    total: bayar,
  }
}

/** Cash In dari daftar pembayaran */
export function hitungCashInPembayaran(
  payments: Pick<Pembayaran, 'nominal_bayar' | 'tgl_bayar'>[],
  opts?: { tahun?: number; bulan?: number[]; asOfKey?: string },
): number {
  let s = 0
  for (const p of payments ?? []) {
    if (!p.tgl_bayar || !(p.nominal_bayar > 0)) continue
    const key = String(p.tgl_bayar).slice(0, 10)
    if (opts?.asOfKey && key > opts.asOfKey) continue
    if (opts?.tahun != null) {
      const y = Number(key.slice(0, 4))
      if (y !== opts.tahun) continue
    }
    if (opts?.bulan && opts.bulan.length > 0 && opts.bulan.length < 12) {
      const m = Number(key.slice(5, 7)) - 1
      if (!opts.bulan.includes(m)) continue
    }
    s += p.nominal_bayar || 0
  }
  return s
}

/** Cash In dari tabel cash_in (denda / lainnya) */
export function hitungCashInLain(
  items: Pick<CashIn, 'nominal' | 'tgl_terima'>[],
  opts?: { tahun?: number; bulan?: number[] },
): number {
  let s = 0
  for (const ci of items ?? []) {
    if (!ci.tgl_terima || !(ci.nominal > 0)) continue
    const key = String(ci.tgl_terima).slice(0, 10)
    if (opts?.tahun != null && Number(key.slice(0, 4)) !== opts.tahun) continue
    if (opts?.bulan && opts.bulan.length > 0 && opts.bulan.length < 12) {
      const m = Number(key.slice(5, 7)) - 1
      if (!opts.bulan.includes(m)) continue
    }
    s += ci.nominal || 0
  }
  return s
}

export function hitungSisa(tagihan: number, cashIn: number): number {
  return Math.max(0, tagihan - cashIn)
}

export function hitungCapaian(realisasi: number, target: number): number | null {
  if (target <= 0) return null
  return (realisasi / target) * 100
}

/** Label periode jelas untuk UI */
export function labelPeriode(
  tahun: number,
  months: number[],
  mode: 'bulan' | 'sd' = 'bulan',
  bulanLabels: readonly string[] = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ],
): string {
  if (!months.length) return String(tahun)
  const sorted = [...months].sort((a, b) => a - b)
  const end = sorted[sorted.length - 1]
  const start = sorted[0]
  const continuousFromJan =
    mode === 'sd' || (start === 0 && sorted.every((m, i) => m === i))
  if (continuousFromJan && sorted.length > 1) {
    return `Januari s.d. ${bulanLabels[end]} ${tahun}`
  }
  if (sorted.length === 1) return `${bulanLabels[end]} ${tahun}`
  return `${sorted.map(m => bulanLabels[m]).join(', ')} ${tahun}`
}
