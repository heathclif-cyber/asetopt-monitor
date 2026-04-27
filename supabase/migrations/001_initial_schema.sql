-- AsetOpt Monitor — Initial Schema Migration

-- Master aset
CREATE TABLE IF NOT EXISTS aset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kode_aset VARCHAR(50) UNIQUE NOT NULL,
  nama_aset VARCHAR(255) NOT NULL,
  alamat TEXT,
  luas_tanah_m2 DECIMAL(12,2),
  luas_bangunan_m2 DECIMAL(12,2),
  status VARCHAR(50) DEFAULT 'pipeline',
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Data NJOP per aset per tahun
CREATE TABLE IF NOT EXISTS njop (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  tahun INTEGER NOT NULL,
  nilai_tanah_per_m2 DECIMAL(15,2) NOT NULL,
  nilai_bangunan_per_m2 DECIMAL(15,2) DEFAULT 0,
  sumber VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aset_id, tahun)
);

-- Penilaian KJPP
CREATE TABLE IF NOT EXISTS penilaian_kjpp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  tgl_penilaian DATE NOT NULL,
  nama_kjpp VARCHAR(255),
  no_laporan VARCHAR(100),
  nilai_tanah DECIMAL(15,2) DEFAULT 0,
  nilai_bangunan DECIMAL(15,2) DEFAULT 0,
  total_nilai DECIMAL(15,2) GENERATED ALWAYS AS (nilai_tanah + nilai_bangunan) STORED,
  berlaku_hingga DATE,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Timeline program optimalisasi (Jalur A)
CREATE TABLE IF NOT EXISTS timeline_program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  nama_tahapan VARCHAR(255) NOT NULL,
  urutan INTEGER NOT NULL,
  tgl_target DATE,
  tgl_realisasi DATE,
  status VARCHAR(50) DEFAULT 'belum',
  pic VARCHAR(255),
  kendala TEXT,
  tindak_lanjut TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prospek mitra (Jalur A)
CREATE TABLE IF NOT EXISTS prospek_mitra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  nama_calon_mitra VARCHAR(255) NOT NULL,
  kontak_pic VARCHAR(255),
  no_telepon VARCHAR(50),
  tgl_pendekatan DATE,
  progress VARCHAR(100) DEFAULT 'identifikasi',
  catatan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kerja sama aktif (Jalur B)
CREATE TABLE IF NOT EXISTS kerja_sama (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  prospek_id UUID REFERENCES prospek_mitra(id),
  nama_mitra VARCHAR(255) NOT NULL,
  no_perjanjian VARCHAR(100),
  tgl_mulai DATE NOT NULL,
  tgl_selesai DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'aktif',
  no_wa_mitra VARCHAR(20),
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Kompensasi per kerja sama
CREATE TABLE IF NOT EXISTS kompensasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id UUID REFERENCES kerja_sama(id) ON DELETE CASCADE,
  periode_label VARCHAR(100),
  nominal DECIMAL(15,2) NOT NULL,
  ppn_persen DECIMAL(5,2) DEFAULT 11,
  pph_persen DECIMAL(5,2) DEFAULT 10,
  nominal_ppn DECIMAL(15,2) GENERATED ALWAYS AS (nominal * ppn_persen / 100) STORED,
  nominal_pph DECIMAL(15,2) GENERATED ALWAYS AS (nominal * pph_persen / 100) STORED,
  total_tagihan DECIMAL(15,2) GENERATED ALWAYS AS (nominal + (nominal * ppn_persen / 100)) STORED,
  maks_hari_bayar INTEGER DEFAULT 14,
  persen_denda_per_hari DECIMAL(5,4) DEFAULT 0.1,
  tgl_jatuh_tempo DATE NOT NULL,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Realisasi pembayaran
CREATE TABLE IF NOT EXISTS pembayaran (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kompensasi_id UUID REFERENCES kompensasi(id) ON DELETE CASCADE,
  tgl_bayar DATE NOT NULL,
  nominal_bayar DECIMAL(15,2) NOT NULL,
  bukti_url TEXT,
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Surat peringatan
CREATE TABLE IF NOT EXISTS surat_peringatan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id UUID REFERENCES kerja_sama(id) ON DELETE CASCADE,
  kompensasi_id UUID REFERENCES kompensasi(id),
  jenis VARCHAR(10) NOT NULL,
  tgl_terbit DATE NOT NULL,
  tgl_deadline DATE NOT NULL,
  status VARCHAR(50) DEFAULT 'aktif',
  keterangan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PBB per aset per tahun
CREATE TABLE IF NOT EXISTS pbb (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID REFERENCES aset(id) ON DELETE CASCADE,
  tahun INTEGER NOT NULL,
  nilai_pbb DECIMAL(15,2) NOT NULL,
  tgl_jatuh_tempo DATE,
  status_bayar VARCHAR(50) DEFAULT 'belum',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(aset_id, tahun)
);

-- Log notifikasi WA
CREATE TABLE IF NOT EXISTS log_notifikasi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id UUID REFERENCES kerja_sama(id),
  jenis VARCHAR(100),
  no_wa VARCHAR(20),
  pesan TEXT,
  status_kirim VARCHAR(50),
  tgl_kirim TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger updated_at untuk tabel aset
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_aset_updated_at
  BEFORE UPDATE ON aset
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (aktifkan setelah konfigurasi auth)
ALTER TABLE aset ENABLE ROW LEVEL SECURITY;
ALTER TABLE njop ENABLE ROW LEVEL SECURITY;
ALTER TABLE penilaian_kjpp ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_program ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospek_mitra ENABLE ROW LEVEL SECURITY;
ALTER TABLE kerja_sama ENABLE ROW LEVEL SECURITY;
ALTER TABLE kompensasi ENABLE ROW LEVEL SECURITY;
ALTER TABLE pembayaran ENABLE ROW LEVEL SECURITY;
ALTER TABLE surat_peringatan ENABLE ROW LEVEL SECURITY;
ALTER TABLE pbb ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_notifikasi ENABLE ROW LEVEL SECURITY;

-- Policy: authenticated users can do everything (sesuaikan dengan kebutuhan organisasi)
CREATE POLICY "Allow authenticated full access" ON aset FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON njop FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON penilaian_kjpp FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON timeline_program FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON prospek_mitra FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON kerja_sama FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON kompensasi FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON pembayaran FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON surat_peringatan FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON pbb FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON log_notifikasi FOR ALL TO authenticated USING (true);
