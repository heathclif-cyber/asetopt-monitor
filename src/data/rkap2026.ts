export interface RKAPItem {
  no: number
  kode: string
  nama: string
  total: number    // Rupiah
  bulan: number[]  // 12 bulan [Jan..Des], Rupiah
}

export const BULAN_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
