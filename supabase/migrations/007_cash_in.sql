-- Migration 007: Tabel cash_in untuk pemasukan selain kompensasi
-- (denda keterlambatan, pendapatan lainnya yang terkait kerja sama)

CREATE TABLE IF NOT EXISTS cash_in (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id          UUID NOT NULL REFERENCES kerja_sama(id) ON DELETE CASCADE,
  kompensasi_id  UUID REFERENCES kompensasi(id) ON DELETE SET NULL,  -- optional: terkait tagihan mana
  jenis          VARCHAR(50) NOT NULL DEFAULT 'denda',               -- 'denda' | 'lainnya'
  tgl_terima     DATE NOT NULL,
  nominal        DECIMAL(15,2) NOT NULL CHECK (nominal > 0),
  keterangan     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index untuk query per KS
CREATE INDEX IF NOT EXISTS idx_cash_in_ks_id ON cash_in(ks_id);
CREATE INDEX IF NOT EXISTS idx_cash_in_tgl   ON cash_in(tgl_terima);

-- RLS
ALTER TABLE cash_in ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access" ON cash_in FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow anon full access"          ON cash_in FOR ALL TO anon USING (true) WITH CHECK (true);
