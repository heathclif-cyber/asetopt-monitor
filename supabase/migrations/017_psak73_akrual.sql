-- Migration 017: PSAK 73 Accrual Accounting
-- Menambahkan tabel pendapatan_diterima_dimuka dan pengakuan_pendapatan
-- PSAK 73 mensyaratkan lessor mencatat pembayaran di muka sebagai liabilitas
-- dan mengakui pendapatan sewa secara garis lurus (straight-line) selama masa sewa.

-- Tabel induk: satu baris = satu kontrak sewa yang dicatat secara akrual
CREATE TABLE IF NOT EXISTS pendapatan_diterima_dimuka (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ks_id           UUID REFERENCES kerja_sama(id) ON DELETE SET NULL,
  nama_kontrak    VARCHAR(255) NOT NULL,
  total_nkm       DECIMAL(15,2) NOT NULL CHECK (total_nkm > 0),
  total_bulan     INTEGER NOT NULL CHECK (total_bulan > 0),
  nilai_per_bulan DECIMAL(15,2) GENERATED ALWAYS AS (total_nkm / total_bulan) STORED,
  tgl_mulai       DATE NOT NULL,
  tgl_selesai     DATE NOT NULL,
  sudah_diakui    DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (sudah_diakui >= 0),
  sisa_dimuka     DECIMAL(15,2) GENERATED ALWAYS AS (total_nkm - sudah_diakui) STORED,
  status          VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'selesai')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel detail: satu baris = satu periode amortisasi bulanan
CREATE TABLE IF NOT EXISTS pengakuan_pendapatan (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pddm_id     UUID NOT NULL REFERENCES pendapatan_diterima_dimuka(id) ON DELETE CASCADE,
  periode_ke  INTEGER NOT NULL CHECK (periode_ke > 0),
  tgl_awal    DATE NOT NULL,
  tgl_akhir   DATE NOT NULL,
  nominal     DECIMAL(15,2) NOT NULL CHECK (nominal > 0),
  status      VARCHAR(20) NOT NULL DEFAULT 'proyeksi' CHECK (status IN ('proyeksi', 'diakui')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pddm_id, periode_ke)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_pddm_ks_id  ON pendapatan_diterima_dimuka(ks_id);
CREATE INDEX IF NOT EXISTS idx_pddm_status ON pendapatan_diterima_dimuka(status);
CREATE INDEX IF NOT EXISTS idx_pp_pddm_id  ON pengakuan_pendapatan(pddm_id);
CREATE INDEX IF NOT EXISTS idx_pp_status   ON pengakuan_pendapatan(status);

-- Trigger updated_at
CREATE TRIGGER update_pddm_updated_at
  BEFORE UPDATE ON pendapatan_diterima_dimuka
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE pendapatan_diterima_dimuka ENABLE ROW LEVEL SECURITY;
ALTER TABLE pengakuan_pendapatan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access" ON pendapatan_diterima_dimuka
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON pengakuan_pendapatan
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated full access" ON pendapatan_diterima_dimuka
  FOR ALL TO authenticated USING (true);
CREATE POLICY "Allow authenticated full access" ON pengakuan_pendapatan
  FOR ALL TO authenticated USING (true);
