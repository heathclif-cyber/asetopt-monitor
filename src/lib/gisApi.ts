import { clearSession, getStoredToken } from '@/lib/auth'
import type { GISAsetReference, GISAdministrasiReference, GISAssetSummary, GISCapabilities, GISDataset, GISDraftFeature, GISFeatureCollection, GISImport, GISKerjaSamaReference, GISKind, GISOfficialForestHit, GISOverlapWarning } from '@/types/gis'

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = getStoredToken() ?? (import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH === 'true' ? 'local-dev-bypass' : null)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE}/api/gis${path}`, { ...init, headers })
  if (response.status === 401) {
    clearSession()
    if (!location.pathname.startsWith('/login')) location.assign('/login')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail || 'Permintaan GIS gagal')
  }
  return response.json() as Promise<T>
}

export const gisApi = {
  capabilities: () => request<GISCapabilities>('/capabilities'),
  datasets: (kind?: GISKind) => request<{ data: GISDataset[] }>(`/datasets${kind ? `?kind=${kind}` : ''}`),
  createDataset: (input: { kind: GISKind; name: string; scope_key?: string }) => request<{ dataset: GISDataset }>('/datasets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  features: (bbox: string, versionIds: string[], filters?: { adminLevel?: string; adminRegionCode?: string; hutanFunction?: string }) => {
    const params = new URLSearchParams({ bbox, version_ids: versionIds.join(',') })
    if (filters?.adminLevel && filters.adminRegionCode) { params.set('admin_level', filters.adminLevel); params.set('admin_region_code', filters.adminRegionCode) }
    if (filters?.hutanFunction) params.set('hutan_function', filters.hutanFunction)
    return request<GISFeatureCollection>(`/features?${params.toString()}`)
  },
  importFile: (datasetId: string, file: File) => {
    const data = new FormData()
    data.set('file', file)
    return request<{ import_id: string; job_id: string; state: string }>(`/datasets/${datasetId}/imports`, { method: 'POST', body: data })
  },
  latestImport: (datasetId: string) => request<{ import: GISImport | null }>(`/datasets/${datasetId}/imports/latest`),
  getImport: (importId: string) => request<{ import: GISImport }>(`/imports/${importId}`),
  applyMapping: (importId: string, body: { property_mapping?: Record<string, string>; default_attributes?: Record<string, string | number>; source_crs?: string }) => request<{ report_hash: string; feature_count: number; state: GISImport['state']; draft_revision: number }>(`/imports/${importId}/mapping`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  importFeatures: (importId: string) => request<{ data: GISDraftFeature[] }>(`/imports/${importId}/features`),
  updateDraftFeature: (importId: string, featureId: string, body: { attributes: Record<string, string | number | null>; expected_draft_revision: number; linked_asset_ids?: string[] }) => request<{ ok: true; report_hash: string; state: GISImport['state']; draft_revision: number }>(`/imports/${importId}/features/${featureId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  kerjaSamaReference: () => request<{ data: GISKerjaSamaReference[] }>('/reference/kerja-sama'),
  asetReference: () => request<{ data: GISAsetReference[] }>('/reference/aset'),
  assetSummaries: () => request<{ data: GISAssetSummary[]; availability_note: string }>('/assets/summary'),
  konsesiSummaries: () => request<{ data: GISAssetSummary[]; availability_note: string }>('/konsesi/summary/grouped'),
  administrasiReference: (level?: GISAdministrasiReference['level']) => request<{ data: GISAdministrasiReference[] }>(`/reference/administrasi${level ? `?level=${level}` : ''}`),
  hutanFunctions: () => request<{ data: string[] }>('/reference/hutan-functions'),
  identifyOfficialForest: (lng: number, lat: number) => request<GISOfficialForestHit>(`/official-forest/identify?${new URLSearchParams({ lng: String(lng), lat: String(lat) })}`),
  overlapWarnings: (datasetId: string) => request<{ state: 'none' | 'pending' | 'running' | 'complete' | 'failed'; totals: { overlap_count?: number; overlap_area_m2?: number }; data: GISOverlapWarning[] }>(`/datasets/${datasetId}/overlap-warnings`),
  publish: (importId: string, body: { expected_active_version_id: string | null; expected_revision: number; report_hash: string }) => request<{ version_id: string }>(`/imports/${importId}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
}
