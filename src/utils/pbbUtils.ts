import { PBBProporsionalResult, PBBObjekProporsionalResult } from '@/types'

interface ObjekDataItem {
  nama_objek?: string
  nilai_pbb_objek: number
  luas_tanah_sppt?: number | null
  luas_tanah_ks?: number | null
  njop_tanah_per_m2?: number | null
  luas_bangunan_sppt?: number | null
  luas_bangunan_ks?: number | null
  njop_bangunan_per_m2?: number | null
}

interface DataPBBItem {
  tahun: number
  nilaiPBB: number
  // Rincian per objek (preferensi baru)
  objek?: ObjekDataItem[]
  // Legacy single-object fields (backward compat)
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

function hitungNJOP(item: ObjekDataItem): { njopSppt: number; njopKS: number } {
  const njopSppt =
    (item.luas_tanah_sppt ?? 0) * (item.njop_tanah_per_m2 ?? 0) +
    (item.luas_bangunan_sppt ?? 0) * (item.njop_bangunan_per_m2 ?? 0)
  const njopKS =
    (item.luas_tanah_ks ?? 0) * (item.njop_tanah_per_m2 ?? 0) +
    (item.luas_bangunan_ks ?? 0) * (item.njop_bangunan_per_m2 ?? 0)
  return { njopSppt, njopKS }
}

export function hitungPBBProporsional(params: HitungPBBParams): HitungPBBResult {
  const { tglMulaiKS, tglSelesaiKS, dataPBB } = params
  const hasil: PBBProporsionalResult[] = []

  dataPBB.forEach(item => {
    const { tahun, nilaiPBB } = item

    const awalTahun  = new Date(`${tahun}-01-01`)
    const akhirTahun = new Date(`${tahun}-12-31`)
    const mulaiIris  = new Date(Math.max(new Date(tglMulaiKS).getTime(),  awalTahun.getTime()))
    const selesaiIris= new Date(Math.min(new Date(tglSelesaiKS).getTime(), akhirTahun.getTime()))
    if (mulaiIris > selesaiIris) return

    const hariDalamTahun = Math.round((akhirTahun.getTime() - awalTahun.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const hariKS         = Math.round((selesaiIris.getTime() - mulaiIris.getTime()) / (1000 * 60 * 60 * 24)) + 1
    const proporsiWaktu  = hariKS / hariDalamTahun

    // Gunakan pbb_objek jika ada, fallback ke legacy single-object
    const daftarObjek: ObjekDataItem[] =
      item.objek && item.objek.length > 0
        ? item.objek
        : [{
            nama_objek: 'Objek 1',
            nilai_pbb_objek: nilaiPBB,
            luas_tanah_sppt:    item.luas_tanah_sppt,
            luas_tanah_ks:      item.luas_tanah_ks,
            njop_tanah_per_m2:  item.njop_tanah_per_m2,
            luas_bangunan_sppt: item.luas_bangunan_sppt,
            luas_bangunan_ks:   item.luas_bangunan_ks,
            njop_bangunan_per_m2: item.njop_bangunan_per_m2,
          }]

    const objekDetail: PBBObjekProporsionalResult[] = daftarObjek.map(o => {
      const { njopSppt: njopSpptObjek, njopKS: njopKSObjek } = hitungNJOP(o)
      const hasAreaDataObjek  = njopSpptObjek > 0
      const proporsiAreaObjek = hasAreaDataObjek ? Math.min(njopKSObjek / njopSpptObjek, 1) : 1
      const pbbProporsionalObjek = o.nilai_pbb_objek * proporsiAreaObjek * proporsiWaktu
      return {
        nama_objek: o.nama_objek ?? 'Objek',
        nilaiPBBObjek: o.nilai_pbb_objek,
        njopSpptObjek, njopKSObjek,
        proporsiAreaObjek, hasAreaDataObjek,
        pbbProporsionalObjek,
      }
    })

    // Agregasi lintas objek
    const njopSppt      = objekDetail.reduce((s, o) => s + o.njopSpptObjek, 0)
    const njopKS        = objekDetail.reduce((s, o) => s + o.njopKSObjek, 0)
    const hasAreaData   = objekDetail.some(o => o.hasAreaDataObjek)
    const proporsiArea  = hasAreaData && njopSppt > 0 ? njopKS / njopSppt : 1
    const pbbProporsional = objekDetail.reduce((s, o) => s + o.pbbProporsionalObjek, 0)
    const proporsi      = Math.min(hasAreaData ? proporsiArea * proporsiWaktu : proporsiWaktu, 1)

    hasil.push({
      tahun, nilaiPBB,
      njopSppt, njopKS, proporsiArea, hasAreaData,
      hariKS, hariDalamTahun, proporsiWaktu,
      proporsi, pbbProporsional,
      objekDetail,
    })
  })

  const totalPBBDitanggung = hasil.reduce((acc, r) => acc + r.pbbProporsional, 0)
  return { detail: hasil, totalPBBDitanggung }
}
