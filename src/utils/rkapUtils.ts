import { RKAPItem, BULAN_LABELS } from '@/data/rkap2026'

export interface MonthSummary {
  bulanIdx: number
  label: string
  targetOriginal: number
  carryOver: number
  targetAdjusted: number
  realisasi: number
  selisih: number
  achievement: number
  prognosa: number      // realisasi jika sudah lewat/berjalan, targetAdjusted jika belum
  isFuture: boolean     // true jika belum berjalan
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
    const targetAdjusted = targetOriginal + currentCarryOver
    const realisasi = cashInPerBulan[i] ?? 0
    const selisih = realisasi - targetAdjusted
    carryOver = selisih < 0 ? Math.abs(selisih) : 0

    const isFuture = i > bulanSekarang
    // Prognosa: bulan lewat/berjalan → realisasi aktual; bulan mendatang → targetAdjusted
    const prognosa = isFuture ? targetAdjusted : realisasi

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
