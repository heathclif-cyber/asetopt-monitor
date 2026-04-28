import { RKAPItem, BULAN_LABELS } from '@/data/rkap2026'

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
    // Prognosa:
    //   • bulan lewat / berjalan → realisasi aktual
    //   • bulan mendatang       → targetOriginal saja (BUKAN targetAdjusted agar tidak akumulasi)
    const prognosa = isFuture ? targetOriginal : realisasi

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
  tahun: number
): number[] {
  const arr = Array(12).fill(0)
  allKompensasi.forEach(k => {
    ;(k.pembayaran ?? []).forEach(p => {
      const d = new Date(p.tgl_bayar)
      if (d.getFullYear() === tahun) arr[d.getMonth()] += p.nominal_bayar
    })
  })
  return arr
}

// Backward-compat alias
export const getCashInPerBulan2026 = (kompensasi: Parameters<typeof getCashInPerBulanByYear>[0]) =>
  getCashInPerBulanByYear(kompensasi, 2026)
