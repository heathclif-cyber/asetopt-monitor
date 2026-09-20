-- Detail tables have different record shapes. Use JSON field access in this
-- shared trigger so PostgreSQL does not try to resolve a column absent from
-- the table currently firing the trigger.
CREATE OR REPLACE FUNCTION gis_prevent_published_feature_mutation()
RETURNS TRIGGER AS $$
DECLARE
  version_id UUID;
  row_data JSONB := to_jsonb(OLD);
BEGIN
  version_id := CASE
    WHEN TG_TABLE_NAME = 'gis_feature_versions' THEN (row_data->>'dataset_version_id')::UUID
    WHEN TG_TABLE_NAME = 'gis_konsesi_aset' THEN (
      SELECT fv.dataset_version_id FROM gis_feature_versions fv
      WHERE fv.id = (row_data->>'konsesi_feature_version_id')::UUID
    )
    WHEN TG_TABLE_NAME = 'gis_source_files' THEN (row_data->>'version_id')::UUID
    ELSE (
      SELECT fv.dataset_version_id FROM gis_feature_versions fv
      WHERE fv.id = (row_data->>'feature_version_id')::UUID
    )
  END;

  IF EXISTS (SELECT 1 FROM gis_dataset_versions WHERE id=version_id AND state='published') THEN
    RAISE EXCEPTION 'Konten versi GIS yang telah diterbitkan tidak dapat diubah';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
