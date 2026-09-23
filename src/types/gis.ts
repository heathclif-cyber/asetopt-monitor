export type GISKind = 'konsesi' | 'tanaman' | 'hutan' | 'opset' | 'okupasi' | 'administrasi'

export interface GISDataset {
  id: string
  kind: GISKind
  name: string
  scope_key: string
  active_version_id: string | null
  revision: number
  archived_at?: string | null
  active_version_no?: number | null
  source_name?: string | null
  source_year?: number | null
  published_at?: string | null
}

export interface GISCapabilities {
  read: boolean
  domains: string[]
  formats: string[]
  max_upload_bytes: number
  drawing_enabled: boolean
}

export interface GISImport {
  id: string
  state: 'uploaded' | 'processing' | 'mapping_required' | 'ready' | 'failed' | 'cancelled' | 'expired' | 'published'
  candidate_version_id: string
  dataset_id: string
  validation_report: { feature_count?: number; warnings?: string[]; error?: string; missing_attributes?: Array<{ feature_id: string; name: string; fields: string }> }
  report_hash: string | null
  draft_revision: number
}

export interface GISDraftFeature {
  id: string
  name: string
  original_properties: Record<string, unknown>
  computed_area_m2: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  attributes: Record<string, string | number | null>
  linked_asset_ids: string[]
}

export interface GISAsetReference { id: string; kode_aset: string; nama_aset: string }

export interface GISAssetSummary {
  id: string
  record_state: 'draf' | 'terbit'
  kode_aset: string
  nama_aset: string
  lokasi: string
  nomor_alas_hak: string | null
  jenis_alas_hak: string | null
  pemegang_hak: string | null
  sumber_dokumen: string | null
  catatan: string | null
  tanggal_mulai: string | null
  tanggal_terbit: string | null
  tanggal_berakhir: string | null
  expiry_mode: 'fixed' | 'indefinite' | 'unknown'
  rights_status: 'berlaku' | 'berakhir' | 'belum_beralas_hak' | 'belum_lengkap' | 'belum_berlaku' | 'belum_diketahui'
  konsesi_count: number | null
  konsesi_names: string[]
  dataset_ids: string[]
  bbox: string | null
  /** Titik representatif yang berada di dalam poligon konsesi. */
  center_lat: number | null
  center_lng: number | null
  konsesi_area_ha: number | null
  tanaman_area_ha: number | null
  hutan_area_ha: number | null
  okupasi_area_ha: number | null
  kerja_sama_area_ha: number | null
  dapat_dimanfaatkan_area_ha: number | null
  missing_layers: string[]
  analysis_status: string
}

export interface GISAdministrasiReference {
  level: 'provinsi' | 'kabupaten_kota' | 'kecamatan' | 'desa_kelurahan'
  region_code: string
  region_name: string
  parent_code: string | null
  bbox: string
}

export interface GISKerjaSamaReference {
  id: string
  nama_mitra: string
  no_perjanjian: string | null
  skema_kerja_sama: string | null
  tgl_mulai: string
  tgl_selesai: string
  status: string
}

export interface GISOverlapWarning {
  warning_code: string
  relation_kind: GISKind
  intersection_area_m2: number
  subject_percent: number | null
  target_name: string
}

export interface GISFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    id: string
    properties: { feature_id: string; name: string; kind: GISKind; computed_area_m2: number; dataset_id?: string; attributes?: Record<string, string | number | null> }
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
  }>
  truncated?: boolean
}
