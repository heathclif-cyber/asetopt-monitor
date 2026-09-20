-- GIS operations: private source files, import jobs, domain grants, and versioned analyses.
CREATE TABLE IF NOT EXISTS gis_domain_grants (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (domain IN ('legal', 'tanaman', 'opset', 'referensi')),
  granted_by UUID REFERENCES app_users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, domain)
);

CREATE TABLE IF NOT EXISTS gis_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES gis_datasets(id) ON DELETE CASCADE,
  candidate_version_id UUID NOT NULL REFERENCES gis_dataset_versions(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES app_users(id),
  state TEXT NOT NULL DEFAULT 'uploaded' CHECK (state IN ('uploaded', 'processing', 'mapping_required', 'ready', 'failed', 'cancelled', 'expired', 'published')),
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
  crs_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  warning_ack JSONB NOT NULL DEFAULT '[]'::jsonb,
  draft_revision INTEGER NOT NULL DEFAULT 0,
  report_hash TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gis_source_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES gis_dataset_versions(id) ON DELETE RESTRICT,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes BIGINT NOT NULL CHECK (bytes >= 0),
  detected_format TEXT NOT NULL CHECK (detected_format IN ('kml', 'kmz', 'geojson', 'shapefile_zip', 'gpkg')),
  uploaded_by UUID NOT NULL REFERENCES app_users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (version_id, sha256)
);

CREATE TABLE IF NOT EXISTS gis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL CHECK (job_type IN ('import', 'analysis', 'gc')),
  subject_id UUID NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  lease_token BIGINT NOT NULL DEFAULT 0,
  lease_until TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_code TEXT,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  UNIQUE (job_type, subject_id)
);

CREATE TABLE IF NOT EXISTS gis_request_keys (
  actor_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_id UUID,
  response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, operation, idempotency_key)
);

CREATE TABLE IF NOT EXISTS gis_konsesi_aset (
  konsesi_feature_version_id UUID NOT NULL REFERENCES gis_feature_versions(id) ON DELETE CASCADE,
  aset_id UUID NOT NULL REFERENCES aset(id) ON DELETE RESTRICT,
  link_note TEXT,
  linked_by UUID REFERENCES app_users(id),
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (konsesi_feature_version_id, aset_id)
);

CREATE TABLE IF NOT EXISTS gis_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_version_id UUID NOT NULL REFERENCES gis_dataset_versions(id) ON DELETE RESTRICT,
  selection_snapshot JSONB NOT NULL,
  business_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  algorithm_version TEXT NOT NULL,
  tolerance_m2 NUMERIC(18, 2) NOT NULL DEFAULT 1,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'running', 'complete', 'failed', 'stale')),
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gis_analysis_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES gis_analysis_runs(id) ON DELETE CASCADE,
  subject_feature_version_id UUID NOT NULL REFERENCES gis_feature_versions(id) ON DELETE RESTRICT,
  target_feature_version_id UUID REFERENCES gis_feature_versions(id) ON DELETE RESTRICT,
  relation_kind TEXT NOT NULL,
  intersection_area_m2 NUMERIC(18, 2) NOT NULL DEFAULT 0,
  subject_percent NUMERIC(9, 4),
  warning_code TEXT,
  UNIQUE (run_id, subject_feature_version_id, target_feature_version_id, relation_kind, warning_code)
);

CREATE TABLE IF NOT EXISTS gis_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES app_users(id),
  event_type TEXT NOT NULL,
  dataset_id UUID REFERENCES gis_datasets(id) ON DELETE SET NULL,
  version_id UUID REFERENCES gis_dataset_versions(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gis_imports_dataset ON gis_imports(dataset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gis_imports_requested_state ON gis_imports(requested_by, state);
CREATE INDEX IF NOT EXISTS idx_gis_jobs_claim ON gis_jobs(state, lease_until, created_at);
CREATE INDEX IF NOT EXISTS idx_gis_analysis_items_run ON gis_analysis_items(run_id, subject_feature_version_id);
CREATE INDEX IF NOT EXISTS idx_gis_audit_dataset ON gis_audit_events(dataset_id, created_at DESC);
