-- Published GIS content is historical evidence: geometry, typed attributes,
-- source files, and manually confirmed asset links must never be overwritten.
CREATE OR REPLACE FUNCTION gis_prevent_published_feature_mutation()
RETURNS TRIGGER AS $$
DECLARE
  version_id UUID;
BEGIN
  version_id := CASE
    WHEN TG_TABLE_NAME = 'gis_feature_versions' THEN COALESCE(OLD.dataset_version_id, NEW.dataset_version_id)
    WHEN TG_TABLE_NAME = 'gis_konsesi_aset' THEN (
      SELECT fv.dataset_version_id FROM gis_feature_versions fv
      WHERE fv.id = COALESCE(OLD.konsesi_feature_version_id, NEW.konsesi_feature_version_id)
    )
    WHEN TG_TABLE_NAME = 'gis_source_files' THEN COALESCE(OLD.version_id, NEW.version_id)
    ELSE (
      SELECT fv.dataset_version_id FROM gis_feature_versions fv
      WHERE fv.id = COALESCE(OLD.feature_version_id, NEW.feature_version_id)
    )
  END;
  IF EXISTS (SELECT 1 FROM gis_dataset_versions WHERE id=version_id AND state='published') THEN
    RAISE EXCEPTION 'Konten versi GIS yang telah diterbitkan tidak dapat diubah';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gis_feature_versions_immutable_when_published ON gis_feature_versions;
CREATE TRIGGER gis_feature_versions_immutable_when_published
  BEFORE UPDATE OR DELETE ON gis_feature_versions
  FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();

DROP TRIGGER IF EXISTS gis_konsesi_details_immutable_when_published ON gis_konsesi_details;
CREATE TRIGGER gis_konsesi_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_konsesi_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_tanaman_details_immutable_when_published ON gis_tanaman_details;
CREATE TRIGGER gis_tanaman_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_tanaman_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_hutan_details_immutable_when_published ON gis_hutan_details;
CREATE TRIGGER gis_hutan_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_hutan_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_opset_details_immutable_when_published ON gis_opset_details;
CREATE TRIGGER gis_opset_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_opset_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_okupasi_details_immutable_when_published ON gis_okupasi_details;
CREATE TRIGGER gis_okupasi_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_okupasi_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_administrasi_details_immutable_when_published ON gis_administrasi_details;
CREATE TRIGGER gis_administrasi_details_immutable_when_published BEFORE UPDATE OR DELETE ON gis_administrasi_details FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_konsesi_aset_immutable_when_published ON gis_konsesi_aset;
CREATE TRIGGER gis_konsesi_aset_immutable_when_published BEFORE UPDATE OR DELETE ON gis_konsesi_aset FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
DROP TRIGGER IF EXISTS gis_source_files_immutable_when_published ON gis_source_files;
CREATE TRIGGER gis_source_files_immutable_when_published BEFORE UPDATE OR DELETE ON gis_source_files FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_feature_mutation();
