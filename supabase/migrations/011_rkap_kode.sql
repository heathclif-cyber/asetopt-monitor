-- Migration 011: Tambah kolom kode RKAP ke semua tabel yang relevan

-- ── rkap_target ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rkap_target (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun       INTEGER NOT NULL,
  no          INTEGER NOT NULL,
  kode        VARCHAR(50),
  nama        VARCHAR(255) NOT NULL,
  total       BIGINT DEFAULT 0,
  jan         BIGINT DEFAULT 0, feb  BIGINT DEFAULT 0, mar BIGINT DEFAULT 0,
  apr         BIGINT DEFAULT 0, mei  BIGINT DEFAULT 0, jun BIGINT DEFAULT 0,
  jul         BIGINT DEFAULT 0, agu  BIGINT DEFAULT 0, sep BIGINT DEFAULT 0,
  okt         BIGINT DEFAULT 0, nov  BIGINT DEFAULT 0, des BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tahun, no)
);

ALTER TABLE rkap_target ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rkap_target' AND policyname = 'Allow anon full access'
  ) THEN
    CREATE POLICY "Allow anon full access" ON rkap_target FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Tambah kolom jika tabel sudah ada tapi belum punya kolom kode
ALTER TABLE rkap_target ADD COLUMN IF NOT EXISTS kode VARCHAR(50);

-- ── kompensasi ─────────────────────────────────────────────────────────────────
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS rkap_kode VARCHAR(50);

-- ── pbb ────────────────────────────────────────────────────────────────────────
ALTER TABLE pbb ADD COLUMN IF NOT EXISTS rkap_kode VARCHAR(50);

-- ── cash_in ────────────────────────────────────────────────────────────────────
ALTER TABLE cash_in ADD COLUMN IF NOT EXISTS rkap_kode VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_cash_in_rkap_kode     ON cash_in(rkap_kode);
CREATE INDEX IF NOT EXISTS idx_kompensasi_rkap_kode  ON kompensasi(rkap_kode);
CREATE INDEX IF NOT EXISTS idx_pbb_rkap_kode         ON pbb(rkap_kode);
