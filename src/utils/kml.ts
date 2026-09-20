import type { GeoJsonFeature, GeoJsonFeatureCollection, GeoJsonGeometry } from '@/types'

function coordinates(raw: string | null): number[][] {
  if (!raw) return []
  return raw.trim().split(/\s+/).map(part => {
    const [lng, lat] = part.split(',').map(Number)
    return [lng, lat]
  }).filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
}

function childText(el: Element, selector: string): string {
  return el.querySelector(`:scope > ${selector}`)?.textContent?.trim() ?? ''
}

function geometries(el: Element): GeoJsonGeometry[] {
  const output: GeoJsonGeometry[] = []
  for (const child of Array.from(el.children)) {
    const tag = child.localName
    if (tag === 'Point') {
      const point = coordinates(childText(child, 'coordinates'))[0]
      if (point) output.push({ type: 'Point', coordinates: point })
    }
    if (tag === 'LineString') {
      const line = coordinates(childText(child, 'coordinates'))
      if (line.length >= 2) output.push({ type: 'LineString', coordinates: line })
    }
    if (tag === 'Polygon') {
      const rings = Array.from(child.querySelectorAll(':scope > outerBoundaryIs > LinearRing, :scope > innerBoundaryIs > LinearRing'))
        .map(ring => coordinates(childText(ring, 'coordinates')))
        .filter(ring => ring.length >= 3)
      if (rings.length) output.push({ type: 'Polygon', coordinates: rings })
    }
    if (tag === 'MultiGeometry') output.push(...geometries(child))
  }
  return output
}

/** Parses standard KML Point, LineString, Polygon and MultiGeometry into GeoJSON. */
export function parseKml(kml: string): GeoJsonFeatureCollection {
  const xml = new DOMParser().parseFromString(kml, 'application/xml')
  const parseError = xml.querySelector('parsererror')
  if (parseError) throw new Error('File KML tidak valid atau rusak.')

  const features: GeoJsonFeature[] = []
  for (const placemark of Array.from(xml.getElementsByTagNameNS('*', 'Placemark'))) {
    const parts = geometries(placemark)
    const name = childText(placemark, 'name') || 'Tanpa nama'
    const description = childText(placemark, 'description')
    const geometry: GeoJsonGeometry | undefined = parts.length === 1
      ? parts[0]
      : parts.length > 1 ? { type: 'GeometryCollection', geometries: parts } : undefined
    if (geometry) features.push({ type: 'Feature', properties: { name, description }, geometry })
  }
  if (!features.length) throw new Error('KML tidak memiliki Point, garis, atau polygon yang dapat dibaca.')
  return { type: 'FeatureCollection', features }
}
