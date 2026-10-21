-- Format laporan Excel buatan pengguna. Hanya menyimpan susunan (kolom, filter),
-- bukan data; data tetap diambil lewat API dengan hak akses peran pengguna.
CREATE TABLE IF NOT EXISTS report_format (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL,
  owner_username  TEXT NOT NULL,
  nama            TEXT NOT NULL,
  dataset         TEXT NOT NULL,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared       BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_report_format_owner_nama
  ON report_format (owner_id, lower(nama));

ALTER TABLE report_format ENABLE ROW LEVEL SECURITY;
