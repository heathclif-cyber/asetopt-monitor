const TARIF_TANAH = 0.0333
const TARIF_BANGUNAN = 0.0664

export interface HitungPotensiParams {
  njopTanahPerM2: number
  luasTanahM2: number
  njopBangunanPerM2: number
  luasBangunanM2: number
}

export interface PotensiResult {
  potensiTanah: number
  potensiBangunan: number
  totalPotensi: number
}

export function hitungPotensiNJOP(params: HitungPotensiParams): PotensiResult {
  const { njopTanahPerM2, luasTanahM2, njopBangunanPerM2, luasBangunanM2 } = params
  const potensiTanah = njopTanahPerM2 * luasTanahM2 * TARIF_TANAH
  const potensiBangunan = njopBangunanPerM2 * luasBangunanM2 * TARIF_BANGUNAN
  const totalPotensi = potensiTanah + potensiBangunan
  return { potensiTanah, potensiBangunan, totalPotensi }
}
