import { PBBProporsionalResult } from '@/types'

interface DataPBBItem {
  tahun: number
  nilaiPBB: number
  luas_tanah_sppt?: number | null
  luas_tanah_ks?: number | null
  njop_tanah_per_m2?: number | null
  luas_bangunan_sppt?: number | null
  luas_bangunan_ks?: number | null
  njop_bangunan_per_m2?: number | null
}

interface HitungPBBParams {
  tglMulaiKS: string
  tglSelesaiKS: string
  dataPBB: DataPBBItem[]
}

interface HitungPBBResult {
  detail: PBBProporsionalResult[]
  totalPBBDitanggung: number
}

export function hitungPBBProporsional(params: HitungPBBParams): HitungPBBResult {
  const { tglMulaiKS, tglSelesaiKS, dataPBB } = params
  const hasil: PBBProporsionalResult[] = []

  dataPBB.forEach(item => {
    const {
      tahun, nilaiPBB,
      luas_tanah_sppt, luas_tanah_ks, njop_tanah_per_m2,
      luas_bangunan_sppt, luas_bangunan_ks, njop_bangunan_per_m2,
    } = item

    const awalTahun  = new Date(`${tahun}-01-01`)
    const akhirTahun = new Date(`${tahun}-12-31`)

    const mulaiIris   = new Date(Math.max(new Date(tglMulaiKS).getTime(),  awalTahun.getTime()))
    const selesaiIris = new Date(Math.min(new Date(tglSelesaiKS).getTime(), akhirTahun.getTime()))
    if (mulaiIris > selesaiIris) return

    const hariDalamTahun = Math.round((akhirTahun.getTime() - awalTahun.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const hariKS         = Math.round((selesaiIris.getTime() - mulaiIris.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const proporsiWaktu  = hariKS / hariDalamTahun

    // Proporsi luasan — NJOP-weighted: (luas_ks × njop/m²) / (luas_sppt × njop/m²)
    const njopTanahSppt     = (luas_tanah_sppt     ?? 0) * (njop_tanah_per_m2     ?? 0)
    const njopBangunanSppt  = (luas_bangunan_sppt   ?? 0) * (njop_bangunan_per_m2  ?? 0)
    const njopSppt          = njopTanahSppt + njopBangunanSppt

    const njopTanahKS    = (luas_tanah_ks    ?? 0) * (njop_tanah_per_m2    ?? 0)
    const njopBangunanKS = (luas_bangunan_ks  ?? 0) * (njop_bangunan_per_m2 ?? 0)
    const njopKS         = njopTanahKS + njopBangunanKS

    const hasAreaData  = njopSppt > 0
    const proporsiArea = hasAreaData ? (njopKS / njopSppt) : 1

    const proporsi        = proporsiArea * proporsiWaktu
    const pbbProporsional = nilaiPBB * proporsi

    hasil.push({
      tahun, nilaiPBB,
      njopSppt, njopKS, proporsiArea, hasAreaData,
      hariKS, hariDalamTahun, proporsiWaktu,
      proporsi, pbbProporsional,
    })
  })

  const totalPBBDitanggung = hasil.reduce((acc, r) => acc + r.pbbProporsional, 0)
  return { detail: hasil, totalPBBDitanggung }
}
