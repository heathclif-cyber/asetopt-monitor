import { PengakuanPendapatan, PendapatanDiterimaDimuka, PendapatanAkrualStats } from '@/types'

export function hitungNilaiPerBulan(totalNKM: number, totalBulan: number): number {
  if (totalBulan <= 0) return 0
  return totalNKM / totalBulan
}

export function generateJadwalAmortisasi(
  pddmId: string,
  totalNKM: number,
  totalBulan: number,
  tglMulai: string,
): Omit<PengakuanPendapatan, 'id' | 'created_at'>[] {
  const jumlahTahun = Math.ceil(totalBulan / 12)
  const nilaiPerTahun = Math.floor((totalNKM / jumlahTahun) * 100) / 100
  const mulai = new Date(tglMulai)
  const entries: Omit<PengakuanPendapatan, 'id' | 'created_at'>[] = []
  let sumNominal = 0

  for (let i = 0; i < jumlahTahun; i++) {
    const tglAwal = new Date(mulai.getFullYear(), mulai.getMonth() + i * 12, 1)
    const tglAkhir = new Date(mulai.getFullYear(), mulai.getMonth() + (i + 1) * 12, 0)
    const isLast = i === jumlahTahun - 1
    const nominal = isLast
      ? totalNKM - sumNominal
      : nilaiPerTahun
    sumNominal += nominal
    entries.push({
      pddm_id: pddmId,
      periode_ke: i + 1,
      tgl_awal: tglAwal.toISOString().split('T')[0],
      tgl_akhir: tglAkhir.toISOString().split('T')[0],
      nominal: Math.round(nominal * 100) / 100,
      status: 'proyeksi',
    })
  }
  return entries
}

export function hitungPendapatanDiakui(entries: PengakuanPendapatan[]): number {
  return entries
    .filter(e => e.status === 'diakui')
    .reduce((sum, e) => sum + e.nominal, 0)
}

export function hitungSisaDimuka(totalNKM: number, sudahDiakui: number): number {
  return Math.max(0, totalNKM - sudahDiakui)
}

export function hitungProgressPersen(totalNKM: number, sudahDiakui: number): number {
  if (totalNKM <= 0) return 0
  return Math.min(100, (sudahDiakui / totalNKM) * 100)
}

export function tentukanStatusKontrak(totalNKM: number, sudahDiakui: number): 'aktif' | 'selesai' {
  return sudahDiakui >= totalNKM ? 'selesai' : 'aktif'
}

export function hitungPendapatanAkrualStats(
  daftarPDDM: PendapatanDiterimaDimuka[],
  allPengakuan: PengakuanPendapatan[],
  cashPerBulan: number[],
  tahun: number = new Date().getFullYear(),
): PendapatanAkrualStats {
  const kontrakAktif = daftarPDDM.filter(p => p.status === 'aktif')

  const akrualPerBulan = Array(12).fill(0) as number[]
  allPengakuan
    .filter(e => e.status === 'diakui')
    .forEach(e => {
      const d = new Date(e.tgl_awal)
      if (d.getFullYear() === tahun) {
        akrualPerBulan[d.getMonth()] += e.nominal
      }
    })

  const totalDiakuiYTD = akrualPerBulan.reduce((s, v) => s + v, 0)

  const kontrakTerbesar = [...kontrakAktif]
    .sort((a, b) => b.total_nkm - a.total_nkm)
    .slice(0, 5)
    .map(k => ({
      id: k.id,
      namaKontrak: k.nama_kontrak,
      totalNKM: k.total_nkm,
      sudahDiakui: k.sudah_diakui,
      sisaDimuka: k.sisa_dimuka,
      progress: hitungProgressPersen(k.total_nkm, k.sudah_diakui),
    }))

  return {
    totalDimuka: kontrakAktif.reduce((s, k) => s + k.sisa_dimuka, 0),
    totalDiakuiYTD,
    totalDiakuiKontrak: daftarPDDM.reduce((s, k) => s + k.sudah_diakui, 0),
    totalKontrak: kontrakAktif.length,
    totalNKM: kontrakAktif.reduce((s, k) => s + k.total_nkm, 0),
    akrualPerBulan,
    cashPerBulan,
    kontrakTerbesar,
  }
}
