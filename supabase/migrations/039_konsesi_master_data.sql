-- Master data per concession land asset (GIS konsesi, keyed like aset_konsesi).
-- Legal rights data stays in the versioned GIS metadata; these tables hold
-- the operational facts entered once in the concession panel.

CREATE TABLE IF NOT EXISTS konsesi_profil (
  konsesi_key   TEXT PRIMARY KEY,
  -- Company asset code for the land asset; OPSET objects use their Monika ID.
  kode_sap      TEXT,
  -- GIS provides desa to provinsi; invoices and letters still need the street.
  alamat_jalan  TEXT,
  catatan       TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_konsesi_profil_updated_at ON konsesi_profil;
CREATE TRIGGER update_konsesi_profil_updated_at BEFORE UPDATE ON konsesi_profil
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- One SPPT per concession and year carries both NJOP and PBB, so the value is
-- entered once and reused by potensi and by the proportional PBB of KS.
CREATE TABLE IF NOT EXISTS konsesi_sppt (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  konsesi_key           TEXT NOT NULL,
  tahun                 INTEGER NOT NULL CHECK (tahun BETWEEN 2000 AND 2100),
  no_sppt               TEXT,
  luas_tanah_sppt_m2    NUMERIC(14,2) NOT NULL DEFAULT 0,
  luas_bangunan_sppt_m2 NUMERIC(14,2) NOT NULL DEFAULT 0,
  njop_tanah_per_m2     NUMERIC(15,2) NOT NULL DEFAULT 0,
  njop_bangunan_per_m2  NUMERIC(15,2) NOT NULL DEFAULT 0,
  nilai_pbb             NUMERIC(15,2),
  tgl_jatuh_tempo       DATE,
  status_bayar          TEXT NOT NULL DEFAULT 'belum' CHECK (status_bayar IN ('belum', 'lunas')),
  tgl_bayar             DATE,
  catatan               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_konsesi_sppt_key_tahun ON konsesi_sppt (konsesi_key, tahun);

CREATE TABLE IF NOT EXISTS konsesi_bangunan (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  konsesi_key     TEXT NOT NULL,
  nama            TEXT NOT NULL,
  luas_m2         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (luas_m2 >= 0),
  jumlah_lantai   INTEGER CHECK (jumlah_lantai IS NULL OR jumlah_lantai > 0),
  tahun_bangun    INTEGER CHECK (tahun_bangun IS NULL OR tahun_bangun BETWEEN 1800 AND 2100),
  kondisi         TEXT CHECK (kondisi IS NULL OR kondisi IN ('baik', 'sedang', 'rusak_ringan', 'rusak_berat')),
  keterangan      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_konsesi_bangunan_key ON konsesi_bangunan (konsesi_key);

ALTER TABLE konsesi_profil ENABLE ROW LEVEL SECURITY;
ALTER TABLE konsesi_sppt ENABLE ROW LEVEL SECURITY;
ALTER TABLE konsesi_bangunan ENABLE ROW LEVEL SECURITY;
