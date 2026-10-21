-- Penonaktifan prognosa berlaku khusus per dasar prognosa:
-- yang diatur pada dasar 'rkap' tidak ikut berlaku pada dasar 'jadwal', dan sebaliknya.
ALTER TABLE rkap_prognosa_nonaktif
  ADD COLUMN IF NOT EXISTS dasar VARCHAR(10) NOT NULL DEFAULT 'rkap' CHECK (dasar IN ('rkap', 'jadwal'));

ALTER TABLE rkap_prognosa_nonaktif DROP CONSTRAINT IF EXISTS rkap_prognosa_nonaktif_tahun_kode_basis_bulan_key;
CREATE UNIQUE INDEX IF NOT EXISTS rkap_prognosa_nonaktif_unik
  ON rkap_prognosa_nonaktif (tahun, kode, basis, dasar, bulan);
