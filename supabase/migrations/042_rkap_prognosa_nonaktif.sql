-- Prognosa yang dinonaktifkan karena diperkirakan tidak tercapai.
-- bulan -1 = seluruh sisa tahun untuk proker itu (nonaktif proker, tidak ikut target/carry-over);
-- bulan 0..11 = hanya bulan tersebut (prognosa bulan itu menjadi 0, atau realisasi bila bulan berjalan).
CREATE TABLE IF NOT EXISTS rkap_prognosa_nonaktif (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun        INTEGER NOT NULL,
  kode         VARCHAR(50) NOT NULL,
  basis        VARCHAR(20) NOT NULL CHECK (basis IN ('cash_in', 'pendapatan')),
  bulan        SMALLINT NOT NULL CHECK (bulan BETWEEN -1 AND 11),
  alasan       TEXT,
  dibuat_oleh  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tahun, kode, basis, bulan)
);

ALTER TABLE rkap_prognosa_nonaktif ENABLE ROW LEVEL SECURITY;

-- Dasar prognosa per tahun, dipakai bersama semua halaman (RKAP Monitor, Dashboard, ekspor).
-- basis: 'rkap' = target RKAP; 'jadwal' = jadwal jatuh tempo kerja sama eksisting.
CREATE TABLE IF NOT EXISTS rkap_prognosa_setting (
  tahun       INTEGER PRIMARY KEY,
  basis       VARCHAR(10) NOT NULL DEFAULT 'rkap' CHECK (basis IN ('rkap', 'jadwal')),
  diubah_oleh TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE rkap_prognosa_setting ENABLE ROW LEVEL SECURITY;
