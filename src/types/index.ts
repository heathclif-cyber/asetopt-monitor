export type AsetStatus = 'pipeline' | 'prospek' | 'negosiasi' | 'aktif_ks' | 'selesai'
export type PPHMode = 'none' | 'bukti_potong'
export type TimelineStatus = 'belum' | 'proses' | 'selesai' | 'terlambat'
export type ProspekProgress = 'identifikasi' | 'penjajakan' | 'penawaran' | 'negosiasi' | 'gagal' | 'berhasil'
export type KerjaSamaStatus = 'aktif' | 'sp1' | 'sp2' | 'sp3' | 'putus' | 'selesai'
export type SPJenis = 'SP1' | 'SP2' | 'SP3' | 'PUTUS'
export type NotifJenis = 'jatuh_tempo_h14' | 'SP1' | 'SP2' | 'SP3' | 'pemutusan'
export type CashInJenis = 'denda' | 'lainnya'

export interface Aset {
  id: string
  kode_aset: string
  nama_aset: string
  alamat: string | null
  luas_tanah_m2: number | null
  luas_bangunan_m2: number | null
  status: AsetStatus
  keterangan: string | null
  created_at: string
  updated_at: string
}

export interface NJOP {
  id: string
  aset_id: string
  tahun: number
  nilai_tanah_per_m2: number
  nilai_bangunan_per_m2: number
  sumber: string | null
  created_at: string
}

export interface PenilaianKJPP {
  id: string
  aset_id: string
  tgl_penilaian: string
  nama_kjpp: string | null
  no_laporan: string | null
  nilai_tanah: number
  nilai_bangunan: number
  total_nilai: number
  berlaku_hingga: string | null
  keterangan: string | null
  created_at: string
}

export interface TimelineProgram {
  id: string
  aset_id: string
  nama_tahapan: string
  urutan: number
  tgl_target: string | null
  tgl_realisasi: string | null
  status: TimelineStatus
  pic: string | null
  kendala: string | null
  tindak_lanjut: string | null
  created_at: string
}

export interface ProspekMitra {
  id: string
  aset_id: string
  nama_calon_mitra: string
  kontak_pic: string | null
  no_telepon: string | null
  tgl_pendekatan: string | null
  progress: ProspekProgress
  catatan: string | null
  created_at: string
}

export interface KerjaSama {
  id: string
  aset_id: string
  prospek_id: string | null
  nama_mitra: string
  no_perjanjian: string | null
  tgl_mulai: string
  tgl_selesai: string
  status: KerjaSamaStatus
  no_wa_mitra: string | null
  keterangan: string | null
  created_at: string
  aset?: Aset
}

export interface Kompensasi {
  id: string
  ks_id: string
  periode_label: string | null
  nominal: number
  ppn_persen: number
  pph_persen: number
  pph_mode: PPHMode
  nominal_ppn: number
  nominal_pph: number
  total_tagihan: number
  maks_hari_bayar: number
  persen_denda_per_hari: number
  tgl_jatuh_tempo: string
  keterangan: string | null
  created_at: string
  kerja_sama?: KerjaSama
  pembayaran?: Pembayaran[]
}

export interface Pembayaran {
  id: string
  kompensasi_id: string
  tgl_bayar: string
  nominal_bayar: number
  bukti_url: string | null
  keterangan: string | null
  created_at: string
}

export interface SuratPeringatan {
  id: string
  ks_id: string
  kompensasi_id: string | null
  jenis: SPJenis
  tgl_terbit: string
  tgl_deadline: string
  status: string
  keterangan: string | null
  created_at: string
  kerja_sama?: KerjaSama
}

export interface PBB {
  id: string
  aset_id: string
  tahun: number
  nilai_pbb: number
  // Objek Bumi
  luas_tanah_sppt: number | null
  luas_tanah_ks: number | null
  njop_tanah_per_m2: number | null
  // Objek Bangunan
  luas_bangunan_sppt: number | null
  luas_bangunan_ks: number | null
  njop_bangunan_per_m2: number | null
  tgl_jatuh_tempo: string | null
  tgl_bayar_pbb: string | null
  jumlah_pbb_dibayar: number | null
  status_bayar: string
  created_at: string
  aset?: Aset
}

export interface LogNotifikasi {
  id: string
  ks_id: string | null
  jenis: string | null
  no_wa: string | null
  pesan: string | null
  status_kirim: string | null
  tgl_kirim: string
  kerja_sama?: KerjaSama
}

export interface PotensiPendapatan {
  aset: Aset
  njopTerbaru: NJOP | null
  kjppTerbaru: PenilaianKJPP | null
  potensiTanah: number
  potensiBangunan: number
  totalPotensiNJOP: number
}

export interface PBBProporsionalResult {
  tahun: number
  nilaiPBB: number
  // Proporsi luasan (NJOP KS / NJOP SPPT)
  njopSppt: number
  njopKS: number
  proporsiArea: number
  hasAreaData: boolean
  // Proporsi waktu (hari KS / hari tahun)
  hariKS: number
  hariDalamTahun: number
  proporsiWaktu: number
  // Gabungan
  proporsi: number
  pbbProporsional: number
}

export interface DendaResult {
  hariTerlambat: number
  nominalDenda: number
  persenAkumulasi: number
}

export interface KompensasiWithStatus extends Kompensasi {
  totalDibayar: number
  sisaTagihan: number
  dendaAkumulasi: DendaResult
  statusBayar: 'lunas' | 'sebagian' | 'belum_bayar' | 'terlambat'
}

export interface CashIn {
  id: string
  ks_id: string
  kompensasi_id: string | null
  jenis: CashInJenis
  tgl_terima: string
  nominal: number
  keterangan: string | null
  created_at: string
  kerja_sama?: KerjaSama
  kompensasi?: Pick<Kompensasi, 'id' | 'periode_label'>
}
