import { RKAPItem, BULAN_LABELS } from '@/data/rkap2026'
import { PengakuanPendapatan, PendapatanDiterimaDimuka } from '@/types'

export interface MonthSummary {
  bulanIdx: number
  label: string
  targetOriginal: number
  carryOver: number
  targetAdjusted: number   // targetOriginal + carryOver (untuk acuan catch-up bulan ini)
  realisasi: number
  selisih: number          // realisasi - targetAdjusted (negatif = defisit → jadi carryOver)
  achievement: number
  prognosa: number         // past: realisasi aktual; future: targetOriginal (tanpa carry-over)
  isFuture: boolean
}

export function hitungRKAP(
  items: RKAPItem[],
  cashInPerBulan: number[],
  bulanSekarang: number = new Date().getMonth(),
): MonthSummary[] {
  const results: MonthSummary[] = []
  let carryOver = 0

  for (let i = 0; i < 12; i++) {
    const targetOriginal = items.reduce((sum, item) => sum + (item.bulan[i] ?? 0), 0)
    const currentCarryOver = carryOver
    const targetAdjusted  = targetOriginal + currentCarryOver
    const realisasi = cashInPerBulan[i] ?? 0
    const selisih   = realisasi - targetAdjusted
    // Carry-over hanya dari bulan yang sudah berjalan (bukan proyeksi)
    carryOver = (i <= bulanSekarang && selisih < 0) ? Math.abs(selisih) : 0

    const isFuture = i > bulanSekarang
    const isCurrent = i === bulanSekarang
    // Prognosa:
    //   • bulan lewat          → realisasi aktual
    //   • bulan berjalan       → realisasi (jika ada), atau target (jika belum)
    //   • bulan mendatang      → targetOriginal saja (BUKAN targetAdjusted agar tidak akumulasi)
    const prognosa = isFuture ? targetOriginal : isCurrent ? Math.max(realisasi, targetOriginal) : realisasi

    results.push({
      bulanIdx: i,
      label: BULAN_LABELS[i],
      targetOriginal,
      carryOver: currentCarryOver,
      targetAdjusted,
      realisasi,
      selisih,
      achievement: targetAdjusted > 0 ? Math.min(999, (realisasi / targetAdjusted) * 100) : 100,
      prognosa,
      isFuture,
    })
  }
  return results
}


export function getCashInPerBulanByYear(
  allKompensasi: { pembayaran?: { tgl_bayar: string; nominal_bayar: number }[] }[],
  tahun: number,
  allCashIn: { tgl_terima: string; nominal: number }[] = []
): number[] {
  const arr = Array(12).fill(0)
  allKompensasi.forEach(k => {
    ;(k.pembayaran ?? []).forEach(p => {
      const d = new Date(p.tgl_bayar)
      if (d.getFullYear() === tahun) arr[d.getMonth()] += p.nominal_bayar
    })
  })
  allCashIn.forEach(ci => {
    const d = new Date(ci.tgl_terima)
    if (d.getFullYear() === tahun) arr[d.getMonth()] += ci.nominal
  })
  return arr
}

// Backward-compat alias
export const getCashInPerBulan2026 = (kompensasi: Parameters<typeof getCashInPerBulanByYear>[0], allCashIn?: any[]) =>
  getCashInPerBulanByYear(kompensasi, 2026, allCashIn)

export function getPendapatanPerBulanByYear(
  allPengakuan: PengakuanPendapatan[],
  tahun: number
): number[] {
  const arr = Array(12).fill(0)
  allPengakuan
    .filter(e => e.status === 'diakui')
    .forEach(e => {
      const d = new Date(e.tgl_awal)
      if (d.getFullYear() === tahun) arr[d.getMonth()] += e.nominal
    })
  return arr
}

export function getPendapatanPerKode(
  allPengakuan: PengakuanPendapatan[],
  daftarPDDM: PendapatanDiterimaDimuka[],
  allKompensasi: { ks_id: string; tgl_jatuh_tempo: string; rkap_kode: string | null }[],
  tahun: number
): Record<string, number[]> {
  const byKey: Record<string, number[]> = {}

  allPengakuan
    .filter(pp => pp.status === 'diakui')
    .forEach(pp => {
      const pddm = daftarPDDM.find(p => p.id === pp.pddm_id)
      if (!pddm?.ks_id) return
      const komp = allKompensasi.find(
        k => k.ks_id === pddm.ks_id && k.tgl_jatuh_tempo === pp.tgl_awal
      )
      const key = komp?.rkap_kode
      if (!key) return
      if (!byKey[key]) byKey[key] = Array(12).fill(0)
      const d = new Date(pp.tgl_awal)
      if (d.getFullYear() === tahun) {
        byKey[key][d.getMonth()] += pp.nominal
      }
    })

  return byKey
}
