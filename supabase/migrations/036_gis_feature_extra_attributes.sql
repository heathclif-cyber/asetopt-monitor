-- Versioned, editable information that is specific to a GIS polygon.
-- The uploaded source remains in gis_source_files; corrections live only in
-- the draft/published feature version that contains them.
ALTER TABLE gis_feature_versions
  ADD COLUMN IF NOT EXISTS extra_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;
