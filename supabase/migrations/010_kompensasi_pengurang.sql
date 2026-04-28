-- Migration 010: Tambah kolom pengurang pada tabel kompensasi

ALTER TABLE kompensasi
  ADD COLUMN IF NOT EXISTS pengurang DECIMAL(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS keterangan_pengurang TEXT;
