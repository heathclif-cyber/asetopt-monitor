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
 * Satu aturan prognosa, dipakai grafik, tabel, ekspor RKAP, Perbandingan, dan Evaluasi Kinerja
 * agar angkanya selalu sama.
 *
 * "s.d. bulan X" (currentMonth) berarti bulan 0..X SUDAH TEREALISASI. Prognosa dimulai bulan X+1.
 *  - Bulan sampai X     : selalu realisasi (tidak pernah ditimpa isian manual atau target).
 *  - Dasar RKAP         : target RKAP bulan itu, dibatasi sisa target tahunan proker
 *                         (target tahun dikurangi realisasi dan prognosa yang sudah dihitung),
 *                         sehingga proker yang sudah melampaui RKAP tidak ditambah target lagi.
 *  - Dasar Jadwal       : Cash In = sisa tagihan yang jatuh tempo bulan itu;
 *                         Pendapatan = DPP tagihan yang jatuh tempo bulan itu.
 *  - Isian manual (rkap_prognosa) menimpa bulan prognosa; penonaktifan menimpa semuanya (0).
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
  const { month, currentMonth, target, realized, basis, jadwal, manual, nonaktif } = opts
  if (month <= currentMonth) return realized
  if (nonaktif) return 0
  if (manual != null) return manual
  return basis === 'jadwal' ? jadwal : target
}

/** Prognosa 12 bulan satu proker. Indeks 0..currentMonth = realisasi, sesudahnya = prognosa. */
export function prognosaProker(opts: {
  currentMonth: number
  /** Target RKAP per bulan (12 nilai) sesuai mode. */
  target: number[]
  /** Realisasi per bulan (12 nilai) sesuai mode. */
  realized: number[]
  basis: PrognosaBasis
  kind: PrognosaKind
  jadwal?: number[]
  manual?: Array<number | null>
  nonaktif?: number[]
}): number[] {
  const { currentMonth, target, realized, basis, kind, jadwal = [], manual = [], nonaktif = [] } = opts
  const targetTahun = target.reduce((s, v) => s + (v || 0), 0)
  const hasil: number[] = []
  let berjalan = 0
  for (let month = 0; month < 12; month++) {
    const sisaTarget = Math.max(0, targetTahun - berjalan)
    const nilai = prognosaBulan({
      month,
      currentMonth,
      target: Math.min(target[month] ?? 0, sisaTarget),
      realized: realized[month] ?? 0,
      basis,
      kind,
      jadwal: jadwal[month] ?? 0,
      manual: manual[month],
      nonaktif: nonaktif.includes(month),
    })
    hasil.push(nilai)
    berjalan += nilai
  }
  return hasil
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
  nonaktifBulan: NonaktifBulanPerKind
}): PrognosaEvaluasiRow[] {
  const { rows, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifBulan } = opts
  const hitung = (row: HOMasterRow, kind: PrognosaKind) => prognosaProker({
    currentMonth: endMonth,
    target: kind === 'cash_in' ? row.rkapBulan : row.rkapPendapatanBulan,
    realized: kind === 'cash_in'
      ? row.cashByMonth.map(m => m.totalDiluarJaminan)
      : row.pendapatanByMonth.map(m => m.total),
    basis,
    kind,
    jadwal: jadwal[kind][row.kodeMonika],
    manual: (kind === 'cash_in' ? manualCash : manualPendapatan)[row.kodeMonika],
    nonaktif: nonaktifBulan[kind][row.kodeMonika],
  })
  return rows.map(row => ({ kode: row.kodeMonika, cash: hitung(row, 'cash_in'), pendapatan: hitung(row, 'pendapatan') }))
}
