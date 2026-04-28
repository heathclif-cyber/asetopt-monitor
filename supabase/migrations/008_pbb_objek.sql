-- Tambah kolom detail Objek Bumi & Bangunan pada SPPT ke tabel pbb
-- Memungkinkan kalkulasi PBB proporsional berdasarkan luasan (area) DAN waktu

ALTER TABLE pbb
  ADD COLUMN IF NOT EXISTS luas_tanah_sppt   DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_tanah_ks     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_tanah_per_m2 DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_sppt   DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_ks     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_bangunan_per_m2 DECIMAL(15,2) DEFAULT 0;
