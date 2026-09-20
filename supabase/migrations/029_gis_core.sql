-- GIS core: immutable dataset versions and PostGIS geometries.
-- This migration requires PostgreSQL with the PostGIS extension available.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS gis_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('konsesi', 'tanaman', 'hutan', 'opset', 'okupasi', 'administrasi')),
  name TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT '',
  active_version_id UUID,
  revision INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, scope_key)
);

CREATE TABLE IF NOT EXISTS gis_dataset_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES gis_datasets(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'validating', 'ready', 'published', 'failed', 'cancelled')),
  based_on_version_id UUID REFERENCES gis_dataset_versions(id),
  source_name TEXT,
  source_url TEXT,
  source_year INTEGER CHECK (source_year IS NULL OR source_year BETWEEN 1800 AND 3000),
  effective_date DATE,
  coverage_note TEXT,
  validation_note TEXT,
  change_note TEXT,
  created_by UUID REFERENCES app_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (dataset_id, version_no)
);

ALTER TABLE gis_datasets
  ADD CONSTRAINT gis_datasets_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES gis_dataset_versions(id);

CREATE TABLE IF NOT EXISTS gis_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES gis_datasets(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, external_key)
);

CREATE TABLE IF NOT EXISTS gis_feature_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id UUID NOT NULL REFERENCES gis_dataset_versions(id) ON DELETE CASCADE,
  feature_id UUID NOT NULL REFERENCES gis_features(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  computed_area_m2 NUMERIC(18, 2) NOT NULL DEFAULT 0,
  original_properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dataset_version_id, feature_id),
  CHECK (ST_SRID(geom) = 4326),
  CHECK (ST_IsValid(geom)),
  CHECK (NOT ST_IsEmpty(geom))
);

CREATE OR REPLACE FUNCTION gis_set_computed_area_m2()
RETURNS TRIGGER AS $$
BEGIN
  NEW.computed_area_m2 := round(ST_Area(NEW.geom::geography)::numeric, 2);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gis_feature_versions_set_area ON gis_feature_versions;
CREATE TRIGGER gis_feature_versions_set_area
  BEFORE INSERT OR UPDATE OF geom ON gis_feature_versions
  FOR EACH ROW EXECUTE FUNCTION gis_set_computed_area_m2();

CREATE TABLE IF NOT EXISTS gis_konsesi_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  nomor_alas_hak TEXT,
  jenis_alas_hak TEXT,
  declared_area_m2 NUMERIC(18, 2) CHECK (declared_area_m2 IS NULL OR declared_area_m2 >= 0),
  tanggal_terbit DATE,
  expiry_mode TEXT NOT NULL DEFAULT 'unknown' CHECK (expiry_mode IN ('fixed', 'indefinite', 'unknown')),
  tanggal_berakhir DATE,
  incomplete_reason TEXT,
  CHECK ((expiry_mode = 'fixed' AND tanggal_berakhir IS NOT NULL) OR (expiry_mode <> 'fixed' AND tanggal_berakhir IS NULL)),
  CHECK (tanggal_berakhir IS NULL OR tanggal_terbit IS NULL OR tanggal_berakhir >= tanggal_terbit)
);

CREATE TABLE IF NOT EXISTS gis_tanaman_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  kode_blok TEXT,
  unit_kebun TEXT,
  komoditas TEXT,
  tahun_tanam INTEGER CHECK (tahun_tanam IS NULL OR tahun_tanam BETWEEN 1800 AND 3000),
  declared_area_m2 NUMERIC(18, 2) CHECK (declared_area_m2 IS NULL OR declared_area_m2 >= 0),
  incomplete_reason TEXT
);

CREATE TABLE IF NOT EXISTS gis_hutan_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  fungsi_asli TEXT,
  fungsi_normalized TEXT,
  sumber TEXT NOT NULL,
  tahun INTEGER CHECK (tahun IS NULL OR tahun BETWEEN 1800 AND 3000),
  nomor_sk TEXT,
  tanggal_sk DATE,
  scale_denominator INTEGER CHECK (scale_denominator IS NULL OR scale_denominator > 0),
  status_validasi TEXT NOT NULL DEFAULT 'indikatif' CHECK (status_validasi IN ('definitif', 'indikatif', 'belum_divalidasi'))
);

CREATE TABLE IF NOT EXISTS gis_opset_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  kerja_sama_id UUID NOT NULL REFERENCES kerja_sama(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gis_okupasi_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  pihak_pengokupasi TEXT,
  declared_area_m2 NUMERIC(18, 2) CHECK (declared_area_m2 IS NULL OR declared_area_m2 >= 0),
  catatan TEXT,
  incomplete_reason TEXT
);

CREATE TABLE IF NOT EXISTS gis_administrasi_details (
  feature_version_id UUID PRIMARY KEY REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  level TEXT NOT NULL CHECK (level IN ('provinsi', 'kabupaten_kota', 'kecamatan', 'desa_kelurahan')),
  region_code TEXT NOT NULL,
  region_name TEXT NOT NULL,
  parent_code TEXT,
  code_system TEXT,
  sumber TEXT NOT NULL,
  tahun INTEGER CHECK (tahun IS NULL OR tahun BETWEEN 1800 AND 3000),
  status_batas TEXT NOT NULL DEFAULT 'indikatif' CHECK (status_batas IN ('definitif', 'indikatif', 'belum_divalidasi'))
);

CREATE INDEX IF NOT EXISTS idx_gis_versions_dataset ON gis_dataset_versions(dataset_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_gis_features_dataset ON gis_features(dataset_id);
CREATE INDEX IF NOT EXISTS idx_gis_feature_versions_version ON gis_feature_versions(dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_gis_feature_versions_geom ON gis_feature_versions USING GIST (geom);

CREATE OR REPLACE FUNCTION gis_prevent_published_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.state = 'published' THEN
    RAISE EXCEPTION 'Versi GIS yang telah diterbitkan tidak dapat diubah';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gis_versions_immutable_when_published ON gis_dataset_versions;
CREATE TRIGGER gis_versions_immutable_when_published
  BEFORE UPDATE OR DELETE ON gis_dataset_versions
  FOR EACH ROW EXECUTE FUNCTION gis_prevent_published_version_mutation();
