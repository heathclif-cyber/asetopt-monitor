import { RKAP_2026, BULAN_LABELS } from '@/data/rkap2026'

export interface MonthSummary {
  bulanIdx: number
  label: string
  targetOriginal: number
  carryOver: number      // defisit dari bulan sebelumnya
  targetAdjusted: number // targetOriginal + carryOver
  realisasi: number
  selisih: number        // realisasi - targetAdjusted
  achievement: number    // persen pencapaian
}

export function hitungRKAP(cashInPerBulan: number[]): MonthSummary[] {
  const results: MonthSummary[] = []
  let carryOver = 0

  for (let i = 0; i < 12; i++) {
    const targetOriginal = RKAP_2026.reduce((sum, item) => sum + item.bulan[i], 0)
    const currentCarryOver = carryOver
    const targetAdjusted = targetOriginal + currentCarryOver
    const realisasi = cashInPerBulan[i] ?? 0
    const selisih = realisasi - targetAdjusted

    // Defisit yang belum terpenuhi carry ke bulan berikutnya
    carryOver = selisih < 0 ? Math.abs(selisih) : 0

    results.push({
      bulanIdx: i,
      label: BULAN_LABELS[i],
      targetOriginal,
      carryOver: currentCarryOver,
      targetAdjusted,
      realisasi,
      selisih,
      achievement: targetAdjusted > 0 ? Math.min(999, (realisasi / targetAdjusted) * 100) : 100,
    })
  }
  return results
}

export function getCashInPerBulan2026(allKompensasi: { pembayaran?: { tgl_bayar: string; nominal_bayar: number }[] }[]): number[] {
  const arr = Array(12).fill(0)
  allKompensasi.forEach(k => {
    ;(k.pembayaran ?? []).forEach(p => {
      const d = new Date(p.tgl_bayar)
      if (d.getFullYear() === 2026) {
        arr[d.getMonth()] += p.nominal_bayar
      }
    })
  })
  return arr
}
