import { clearSession, getStoredToken } from '@/lib/auth'
import type { GISAsetReference, GISAdministrasiReference, GISAssetSummary, GISCapabilities, GISDataset, GISDraftFeature, GISFeatureCollection, GISImport, GISKerjaSamaReference, GISKind, GISKonsesiReference, GISOpsetLuasKonsesi, GISOverlapWarning } from '@/types/gis'

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
  datasets: (kind?: GISKind, includeArchived?: boolean) => {
    const params = new URLSearchParams()
    if (kind) params.set('kind', kind)
    if (includeArchived) params.set('include_archived', 'true')
    const query = params.toString()
    return request<{ data: GISDataset[] }>(`/datasets${query ? `?${query}` : ''}`)
  },
  createDataset: (input: { kind: GISKind; name: string; scope_key?: string }) => request<{ dataset: GISDataset }>('/datasets', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }),
  updateDataset: (datasetId: string, body: { name: string; expected_revision: number }) => request<{ dataset: GISDataset }>(`/datasets/${datasetId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  archiveDataset: (datasetId: string, body: { expected_revision: number }) => request<{ dataset: GISDataset }>(`/datasets/${datasetId}/archive`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  unarchiveDataset: (datasetId: string, body: { expected_revision: number }) => request<{ dataset: GISDataset }>(`/datasets/${datasetId}/unarchive`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  deleteDataset: (datasetId: string, expectedRevision: number) => request<{ deleted: true }>(`/datasets/${datasetId}?${new URLSearchParams({ expected_revision: String(expectedRevision) })}`, {
    method: 'DELETE',
  }),
  datasetBounds: (datasetId: string) => request<{ bbox: string | null }>(`/datasets/${datasetId}/bounds`),
  assetBounds: (asetId: string) => request<{ bbox: string | null; dataset_ids: string[] }>(`/assets/${encodeURIComponent(asetId)}/bounds`),
  beginEdit: (datasetId: string) => request<{ import_id: string; reused: boolean }>(`/datasets/${datasetId}/edit-draft`, { method: 'POST' }),
  downloadDataset: async (datasetId: string, name: string, format: 'kml' | 'geojson' | 'shp', version: 'published' | 'draft') => {
    const token = getStoredToken()
    const params = new URLSearchParams({ format, version })
    const response = await fetch(`${API_BASE}/api/gis/datasets/${datasetId}/export?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { detail?: string }
      throw new Error(body.detail || 'Gagal mengunduh layer GIS')
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `${name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'layer-gis'}.${format === 'shp' ? 'zip' : format}`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
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
  updateDraftFeature: (importId: string, featureId: string, body: { attributes: Record<string, string | number | null>; name?: string; original_properties?: Record<string, string | number | boolean | null>; expected_draft_revision: number; linked_asset_ids?: string[] }) => request<{ ok: true; report_hash: string; state: GISImport['state']; draft_revision: number }>(`/imports/${importId}/features/${featureId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
  kerjaSamaReference: () => request<{ data: GISKerjaSamaReference[] }>('/reference/kerja-sama'),
  asetReference: () => request<{ data: GISAsetReference[] }>('/reference/aset'),
  assetSummaries: () => request<{ data: GISAssetSummary[]; availability_note: string }>('/assets/summary'),
  opsetLuasKonsesi: () => request<{ data: GISOpsetLuasKonsesi[] }>('/opset/luas-konsesi'),
  konsesiReference: () => request<{ data: GISKonsesiReference[] }>('/konsesi/reference'),
  konsesiSummaries: (region?: { level: GISAdministrasiReference['level']; code: string }) => request<{ data: GISAssetSummary[]; availability_note: string }>(`/konsesi/summary/grouped${region ? `?${new URLSearchParams({ admin_level: region.level, admin_region_code: region.code })}` : ''}`),
  administrasiReference: (level?: GISAdministrasiReference['level']) => request<{ data: GISAdministrasiReference[] }>(`/reference/administrasi${level ? `?level=${level}` : ''}`),
  hutanFunctions: () => request<{ data: string[] }>('/reference/hutan-functions'),
  overlapWarnings: (datasetId: string) => request<{ state: 'none' | 'pending' | 'running' | 'complete' | 'failed'; totals: { overlap_count?: number; overlap_area_m2?: number }; data: GISOverlapWarning[] }>(`/datasets/${datasetId}/overlap-warnings`),
  publish: (importId: string, body: { expected_active_version_id: string | null; expected_revision: number; report_hash: string }) => request<{ version_id: string }>(`/imports/${importId}/publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }),
}
