import type { Aset, Kompensasi } from '@/types'
import type { HOMasterRow } from '@/utils/laporanHOUtils'
import { resolveMonikaIdHO } from '@/utils/laporanHOUtils'
import { hitungPendapatan, hitungTagihan } from '@/utils/accountingTerms'

/**
 * rkap   : bulan mendatang = target RKAP bulan itu.
 * jadwal : bulan mendatang = tagihan kerja sama eksisting yang jatuh tempo di bulan itu.
 */
export type PrognosaBasis = 'rkap' | 'jadwal'
export type PrognosaKind = 'cash_in' | 'pendapatan'
export type JadwalPerKode = Record<string, number[]>
/** Bulan (0–11) yang prognosanya dinonaktifkan, per ID Monika. */
export type NonaktifBulan = Record<string, number[]>
export type NonaktifBulanPerKind = Record<PrognosaKind, NonaktifBulan>

export const PROGNOSA_BASIS_LABEL: Record<PrognosaBasis, string> = {
  rkap: 'Target RKAP',
  jadwal: 'Jadwal Kerja Sama',
}

/**
 * Satu aturan prognosa per proker per bulan, dipakai grafik, tabel, ekspor RKAP,
 * Perbandingan, dan Evaluasi Kinerja agar angkanya selalu sama.
 *
 * Cash In (jadwal)   : jadwal = sisa tagihan yang jatuh tempo bulan itu; bulan berjalan
 *                      = realisasi + sisa (realisasi bisa berasal dari tagihan bulan lain).
 * Pendapatan (jadwal): jadwal = DPP seluruh tagihan jatuh tempo bulan itu; bulan berjalan
 *                      = yang lebih besar antara realisasi dan jadwal (realisasi sudah bagian dari jadwal).
 */
export function prognosaBulan(opts: {
  month: number
  currentMonth: number
  target: number
  realized: number
  basis: PrognosaBasis
  kind: PrognosaKind
  jadwal: number
  manual?: number | null
  /** Prognosa bulan ini dinonaktifkan (diperkirakan tidak tercapai). */
  nonaktif?: boolean
}): number {
  const { month, currentMonth, target, realized, basis, kind, jadwal, manual, nonaktif } = opts
  // Nonaktif menang atas isian manual: bulan mendatang 0, bulan berjalan hanya yang sudah terealisasi.
  if (nonaktif && month >= currentMonth) return month === currentMonth ? realized : 0
  if (manual != null) return manual
  if (month > currentMonth) return basis === 'jadwal' ? jadwal : target
  if (month === currentMonth) {
    if (basis === 'rkap') return Math.max(realized, target)
    return kind === 'cash_in' ? realized + jadwal : Math.max(realized, jadwal)
  }
  return realized
}

/** Jadwal tagihan per ID Monika per bulan jatuh tempo pada tahun tertentu. */
export function getJadwalPerKode(
  allKompensasi: Kompensasi[],
  daftarAset: Aset[],
  tahun: number,
): Record<PrognosaKind, JadwalPerKode> {
  const asetById = new Map(daftarAset.map(a => [a.id, a]))
  const result: Record<PrognosaKind, JadwalPerKode> = { cash_in: {}, pendapatan: {} }
  allKompensasi.forEach(k => {
    const jt = String(k.tgl_jatuh_tempo ?? '').slice(0, 10)
    if (Number(jt.slice(0, 4)) !== tahun) return
    const month = Number(jt.slice(5, 7)) - 1
    if (month < 0 || month > 11) return
    const kode = resolveMonikaIdHO(k, k.kerja_sama, asetById)
    if (!kode) return
    const dibayar = (k.pembayaran ?? []).reduce((s, p) => s + (p.nominal_bayar || 0), 0)
    const sisa = Math.max(0, hitungTagihan(k) - dibayar)
    ;(result.cash_in[kode] ??= Array(12).fill(0))[month] += sisa
    ;(result.pendapatan[kode] ??= Array(12).fill(0))[month] += hitungPendapatan(k)
  })
  return result
}

export type PrognosaEvaluasiRow = { kode: string; cash: number[]; pendapatan: number[] }

/** Prognosa per proker untuk template Evaluasi Kinerja (hanya bulan setelah endMonth yang dipakai). */
export function buildPrognosaEvaluasi(opts: {
  rows: HOMasterRow[]
  endMonth: number
  basis: PrognosaBasis
  jadwal: Record<PrognosaKind, JadwalPerKode>
  manualCash: Record<string, Array<number | null>>
  manualPendapatan: Record<string, Array<number | null>>
  nonaktifCashIn: Set<string>
  nonaktifPsak: Set<string>
  nonaktifBulan: NonaktifBulanPerKind
}): PrognosaEvaluasiRow[] {
  const { rows, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifCashIn, nonaktifPsak, nonaktifBulan } = opts
  const build = (row: HOMasterRow, kind: PrognosaKind) => Array.from({ length: 12 }, (_, month) => {
    if (month <= endMonth) return 0
    const nonaktif = (kind === 'cash_in' ? nonaktifCashIn : nonaktifPsak).has(row.kodeMonika)
    if (nonaktif) return 0
    return prognosaBulan({
      month,
      currentMonth: endMonth,
      target: (kind === 'cash_in' ? row.rkapBulan : row.rkapPendapatanBulan)[month] ?? 0,
      realized: 0,
      basis,
      kind,
      jadwal: jadwal[kind][row.kodeMonika]?.[month] ?? 0,
      manual: (kind === 'cash_in' ? manualCash : manualPendapatan)[row.kodeMonika]?.[month],
      nonaktif: nonaktifBulan[kind][row.kodeMonika]?.includes(month),
    })
  })
  return rows.map(row => ({ kode: row.kodeMonika, cash: build(row, 'cash_in'), pendapatan: build(row, 'pendapatan') }))
}
