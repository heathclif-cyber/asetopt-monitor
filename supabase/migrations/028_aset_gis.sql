-- Geometri peta per aset, berasal dari impor KML.
-- GeoJSON dipilih agar dapat dipakai tanpa ekstensi PostGIS dan tetap mudah
-- dikonsumsi oleh web client maupun API REST kompatibel PostgREST.
CREATE TABLE IF NOT EXISTS aset_gis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID NOT NULL UNIQUE REFERENCES aset(id) ON DELETE CASCADE,
  nama_file TEXT NOT NULL,
  geojson JSONB NOT NULL,
  feature_count INTEGER NOT NULL DEFAULT 0,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aset_gis_aset_id ON aset_gis(aset_id);
