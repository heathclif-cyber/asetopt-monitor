-- Migration 006: Ensure complete schema (idempotent / safe to re-run)
-- Jalankan di Supabase SQL Editor jika belum pernah menjalankan 005_pph_mode.sql

-- 1. Pastikan kolom pph_mode ada di tabel kompensasi
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS pph_mode VARCHAR(20) NOT NULL DEFAULT 'none';

-- 2. Recreate total_tagihan agar formula memperhitungkan pph_mode (bukti potong)
--    DROP + ADD karena GENERATED ALWAYS tidak bisa di-ALTER secara langsung
ALTER TABLE kompensasi DROP COLUMN IF EXISTS total_tagihan;
ALTER TABLE kompensasi ADD COLUMN total_tagihan DECIMAL(15,2)
  GENERATED ALWAYS AS (
    nominal + (nominal * ppn_persen / 100)
    - CASE WHEN pph_mode = 'bukti_potong' THEN nominal * pph_persen / 100 ELSE 0 END
  ) STORED;

-- 3. Pastikan RLS policy anon ada untuk semua tabel
--    (agar anon key bisa INSERT/UPDATE/DELETE tanpa login)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY['aset','njop','penilaian_kjpp','timeline_program',
                          'prospek_mitra','kerja_sama','kompensasi','pembayaran',
                          'surat_peringatan','pbb','log_notifikasi'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = tbl AND policyname = 'Allow anon full access'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Allow anon full access" ON %I FOR ALL TO anon USING (true) WITH CHECK (true)',
        tbl
      );
    END IF;
  END LOOP;
END $$;
