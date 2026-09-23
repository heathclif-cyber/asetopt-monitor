-- gis_prevent_published_version_mutation fires BEFORE DELETE OR UPDATE, but
-- returned NEW unconditionally. On DELETE, NEW is NULL, and a BEFORE trigger
-- returning NULL silently cancels the row operation -- so deleting an
-- unpublished version quietly did nothing, and cascades from gis_datasets left
-- orphaned gis_dataset_versions / gis_source_files rows behind.
-- Migration 033 already applied this same COALESCE fix to the sibling function
-- gis_prevent_published_feature_mutation; this one was missed.
CREATE OR REPLACE FUNCTION gis_prevent_published_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state = 'published' THEN
    RAISE EXCEPTION 'Versi GIS yang telah diterbitkan tidak dapat diubah';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
