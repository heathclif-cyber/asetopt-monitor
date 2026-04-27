CREATE TABLE IF NOT EXISTS rkap_target (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun       INTEGER NOT NULL,
  no          INTEGER NOT NULL,
  nama        VARCHAR(255) NOT NULL,
  total       BIGINT DEFAULT 0,
  jan         BIGINT DEFAULT 0,
  feb         BIGINT DEFAULT 0,
  mar         BIGINT DEFAULT 0,
  apr         BIGINT DEFAULT 0,
  mei         BIGINT DEFAULT 0,
  jun         BIGINT DEFAULT 0,
  jul         BIGINT DEFAULT 0,
  agu         BIGINT DEFAULT 0,
  sep         BIGINT DEFAULT 0,
  okt         BIGINT DEFAULT 0,
  nov         BIGINT DEFAULT 0,
  des         BIGINT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tahun, no)
);

ALTER TABLE rkap_target ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon full access" ON rkap_target FOR ALL TO anon USING (true) WITH CHECK (true);
