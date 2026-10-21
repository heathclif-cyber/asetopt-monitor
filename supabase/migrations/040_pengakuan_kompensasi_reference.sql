ALTER TABLE pengakuan_pendapatan
  ADD COLUMN IF NOT EXISTS kompensasi_id UUID REFERENCES kompensasi(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pengakuan_kompensasi_unique
  ON pengakuan_pendapatan(kompensasi_id) WHERE kompensasi_id IS NOT NULL;
