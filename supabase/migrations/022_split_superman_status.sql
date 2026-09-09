-- Migration 022: Status SPPn dan SPPb PPh independen (bukan 1 flag gabungan)
-- Kolom `superman` (teks) dipertahankan sebagai ringkasan gabungan untuk tampilan lama.

ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS sppn_no VARCHAR(100);
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS sppn_dibuat_at TIMESTAMPTZ;
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS sppb_pph_no VARCHAR(100);
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS sppb_pph_dibuat_at TIMESTAMPTZ;
