-- Master aset is the GIS concession layer; the `aset` table holds the
-- optimised objects (aset dioptimalkan) that sit on those concessions.
-- konsesi_key is the grouped concession id returned by
-- GET /api/gis/konsesi/summary/grouped (md5 of Kebun + FID_Areal), which
-- stays the same across GIS versions, unlike gis_konsesi_aset whose links
-- are bound to one frozen feature version.
CREATE TABLE IF NOT EXISTS aset_konsesi (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id       UUID NOT NULL REFERENCES aset(id) ON DELETE CASCADE,
  konsesi_key   TEXT NOT NULL,
  -- Snapshot so a link stays readable if the concession is later re-keyed.
  konsesi_nama  TEXT NOT NULL,
  catatan       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (aset_id, konsesi_key)
);

CREATE INDEX IF NOT EXISTS idx_aset_konsesi_konsesi_key ON aset_konsesi (konsesi_key);

ALTER TABLE aset_konsesi ENABLE ROW LEVEL SECURITY;
