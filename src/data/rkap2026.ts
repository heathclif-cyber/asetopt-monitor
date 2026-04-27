export interface RKAPItem {
  no: number
  nama: string
  total: number    // Rupiah
  bulan: number[]  // 12 bulan [Jan..Des], Rupiah
}

const k = 1_000

export const RKAP_2026: RKAPItem[] = [
  { no: 1,  nama: 'Aset Pabrik Gula (Non Spinoff SGN)',       total: 4523144*k, bulan: [0,0,0,0,0,0,0,0,0,0,0,4523144*k] },
  { no: 2,  nama: 'Lahan Takalar - Gapoktan',                 total: 600000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,600000*k] },
  { no: 3,  nama: 'Lahan Tinanggea (Stockpile)',               total: 406000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,406000*k] },
  { no: 4,  nama: 'Lahan Tinanggea (Jalan Tambang)',           total: 0,         bulan: [0,0,0,0,0,0,0,0,0,0,0,0] },
  { no: 5,  nama: 'Bangunan Jalan Boulevard Makassar',         total: 585000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,585000*k] },
  { no: 6,  nama: 'Lahan Sidrap',                             total: 300000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,300000*k] },
  { no: 7,  nama: 'Lahan Jalan Alauddin Makassar',             total: 275000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,275000*k] },
  { no: 8,  nama: 'Lahan Kebun Marinsow',                      total: 275000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,275000*k] },
  { no: 9,  nama: 'Lahan Jl Masjid Raya & Jl Kangkung',       total: 294000*k,  bulan: [0,0,0,0,0,147000*k,0,0,0,0,0,147000*k] },
  { no: 10, nama: 'Bangunan Jalan Slamet Riyadi Makassar',     total: 395800*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,395800*k] },
  { no: 11, nama: 'Lahan Jalan Biru Bone',                     total: 108000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,108000*k] },
  { no: 12, nama: 'Bangunan Mess Jl Masjid Raya Makassar',     total: 370000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,370000*k] },
  { no: 13, nama: 'Lahan Desa Galung',                         total: 100000*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,100000*k] },
  { no: 14, nama: 'Lahan Jl Kemakmuran & Samudra Soppeng',     total: 50000*k,   bulan: [0,0,0,0,0,0,0,0,0,0,0,50000*k] },
  { no: 15, nama: 'Bangunan Ruko Jalan Pengayoman',            total: 90000*k,   bulan: [7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k,7500*k] },
  { no: 16, nama: 'Bangunan Eks LO Ambon',                     total: 75000*k,   bulan: [0,0,0,0,0,0,0,0,0,0,0,75000*k] },
  { no: 17, nama: 'Lahan Eks Pabrik Kapas (Mini Soccer)',       total: 25500*k,   bulan: [0,0,0,0,0,0,0,0,0,0,0,25500*k] },
  { no: 18, nama: 'Lahan Eks Pabrik Kapas (Studio Foto)',       total: 14500*k,   bulan: [0,0,0,0,0,7250*k,0,0,0,0,0,7250*k] },
  { no: 19, nama: 'Lahan Eks Pabrik Kapas (Papan Iklan)',       total: 2100*k,    bulan: [2100*k,0,0,0,0,0,0,0,0,0,0,0] },
  { no: 20, nama: 'Bangunan Kantor Direksi - Gedung Timur',     total: 47000*k,   bulan: [0,0,0,0,0,0,0,0,0,0,0,47000*k] },
  { no: 21, nama: 'Bangunan Kantor Direksi - Pelayanan 13',     total: 24000*k,   bulan: [0,0,0,0,0,0,0,0,0,0,0,24000*k] },
  { no: 22, nama: 'Bangunan Jalan Bambapuang Makassar',         total: 27000*k,   bulan: [27000*k,0,0,0,0,0,0,0,0,0,0,0] },
  { no: 23, nama: 'Lahan Unit Kabaru',                          total: 259091*k,  bulan: [0,0,0,0,0,0,0,0,0,0,0,259091*k] },
]

export const BULAN_LABELS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

export const TOTAL_TARGET_2026 = RKAP_2026.reduce((s, i) => s + i.total, 0)
