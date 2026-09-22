-- Cached raster-overlay results from the public Kemenhut map service.
-- The service publishes a rendered MapServer only (no polygon query), so this
-- stores an explicitly labelled estimate rather than modifying legal geometry.
CREATE TABLE IF NOT EXISTS gis_official_forest_cache (
  asset_key TEXT PRIMARY KEY,
  geom_hash TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'running', 'complete', 'failed')),
  forest_area_ha NUMERIC(18, 4),
  class_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  raster_size INTEGER NOT NULL DEFAULT 768,
  error_summary TEXT,
  measured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gis_official_forest_cache_state
  ON gis_official_forest_cache (state, updated_at);
