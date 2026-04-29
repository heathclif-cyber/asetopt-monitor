-- Migration 014: Pastikan semua kolom tabel pbb ada (idempotent)
-- Jalankan jika migration 008/009/011 belum pernah diaplikasikan

ALTER TABLE pbb
  ADD COLUMN IF NOT EXISTS luas_tanah_sppt      DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_tanah_ks        DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_tanah_per_m2    DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_sppt   DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS luas_bangunan_ks     DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS njop_bangunan_per_m2 DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tgl_bayar_pbb        DATE,
  ADD COLUMN IF NOT EXISTS jumlah_pbb_dibayar   DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS rkap_kode            VARCHAR(50);

-- Pastikan RLS anon policy ada
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pbb' AND policyname = 'Allow anon full access'
  ) THEN
    CREATE POLICY "Allow anon full access" ON pbb FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;
