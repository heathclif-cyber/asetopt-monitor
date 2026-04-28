-- Migration 009: Idempotent fix — cash_in + pbb payment tracking
-- Aman dijalankan ulang; semua perintah menggunakan IF NOT EXISTS

-- 1. Buat tabel cash_in jika belum ada (migration 007 mungkin belum dijalankan)
CREATE TABLE IF NOT EXISTS cash_in (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id          UUID NOT NULL REFERENCES kerja_sama(id) ON DELETE CASCADE,
  kompensasi_id  UUID REFERENCES kompensasi(id) ON DELETE SET NULL,
  jenis          VARCHAR(50) NOT NULL DEFAULT 'denda',
  tgl_terima     DATE NOT NULL,
  nominal        DECIMAL(15,2) NOT NULL CHECK (nominal > 0),
  keterangan     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cash_in_ks_id ON cash_in(ks_id);
CREATE INDEX IF NOT EXISTS idx_cash_in_tgl   ON cash_in(tgl_terima);

ALTER TABLE cash_in ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cash_in' AND policyname = 'Allow authenticated full access'
  ) THEN
    CREATE POLICY "Allow authenticated full access"
      ON cash_in FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cash_in' AND policyname = 'Allow anon full access'
  ) THEN
    CREATE POLICY "Allow anon full access"
      ON cash_in FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Kolom objek bumi & bangunan pada tabel pbb (idempotent dari migration 008)
ALTER TABLE pbb
  ADD COLUMN IF NOT EXISTS luas_tanah_sppt      DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_tanah_ks        DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_tanah_per_m2    DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_sppt   DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_ks     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_bangunan_per_m2 DECIMAL(15,2) DEFAULT 0;

-- 3. Kolom pembayaran PBB aktual (tanggal dan jumlah yang benar-benar dibayar ke kas negara)
ALTER TABLE pbb
  ADD COLUMN IF NOT EXISTS tgl_bayar_pbb      DATE,
  ADD COLUMN IF NOT EXISTS jumlah_pbb_dibayar DECIMAL(15,2);
