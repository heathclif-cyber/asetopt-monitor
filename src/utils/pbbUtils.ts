import { PBBProporsionalResult } from '@/types'

interface DataPBBItem {
  tahun: number
  nilaiPBB: number
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

  dataPBB.forEach(({ tahun, nilaiPBB }) => {
    const awalTahun = new Date(`${tahun}-01-01`)
    const akhirTahun = new Date(`${tahun}-12-31`)

    const mulaiIris = new Date(Math.max(new Date(tglMulaiKS).getTime(), awalTahun.getTime()))
    const selesaiIris = new Date(Math.min(new Date(tglSelesaiKS).getTime(), akhirTahun.getTime()))

    if (mulaiIris > selesaiIris) return

    const hariDalamTahun = Math.round((akhirTahun.getTime() - awalTahun.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const hariKS = Math.round((selesaiIris.getTime() - mulaiIris.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const proporsi = hariKS / hariDalamTahun
    const pbbProporsional = nilaiPBB * proporsi

    hasil.push({ tahun, nilaiPBB, proporsi, pbbProporsional, hariKS, hariDalamTahun })
  })

  const totalPBBDitanggung = hasil.reduce((acc, r) => acc + r.pbbProporsional, 0)
  return { detail: hasil, totalPBBDitanggung }
}
