/**
 * Standar istilah keuangan AsetOpt — single source of truth untuk label UI.
 * Lihat STANDAR_AKUNTANSI.md di root proyek.
 */
import type { Kompensasi, Pembayaran, CashIn } from '@/types'

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
