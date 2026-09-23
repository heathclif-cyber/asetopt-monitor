import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GISFeatureCollection, GISKind } from '@/types/gis'

const INDONESIA_CENTER: L.LatLngExpression = [-2.5, 118]

const COLOR_BY_KIND: Record<GISKind, string> = {
  konsesi: '#1B4F72', tanaman: '#328A4A', hutan: '#607D3B', opset: '#F4B400', okupasi: '#C0392B', administrasi: '#6B7280',
}

const PANE_BY_KIND: Record<GISKind, string> = {
  hutan: 'gis-forest', konsesi: 'gis-konsesi', tanaman: 'gis-tanaman',
  opset: 'gis-opset', okupasi: 'gis-okupasi', administrasi: 'gis-administrasi',
}

const KIND_LABEL: Record<GISKind, string> = {
  konsesi: 'Konsesi tanah', tanaman: 'Blok tanaman', hutan: 'Kawasan hutan',
  opset: 'Area OPSET kerja sama', okupasi: 'Okupasi', administrasi: 'Batas administrasi',
}

const ATTRIBUTE_LABEL: Record<string, string> = {
  nomor_alas_hak: 'Nomor alas hak', jenis_alas_hak: 'Jenis alas hak', declared_area_m2: 'Luas dokumen',
  tanggal_terbit: 'Tanggal terbit', tanggal_berakhir: 'Tanggal berakhir', unit_kebun: 'Unit/kebun',
  kode_blok: 'Kode blok', komoditas: 'Komoditas', tahun_tanam: 'Tahun tanam', fungsi_normalized: 'Status kawasan hutan',
  fungsi_asli: 'Status asli sumber', sumber: 'Sumber', tahun: 'Tahun', nomor_sk: 'Nomor SK', tanggal_sk: 'Tanggal SK',
  pihak_pengokupasi: 'Pihak pengokupasi', catatan: 'Catatan', level: 'Tingkat batas', region_name: 'Wilayah', region_code: 'Kode wilayah',
  tanggal_mulai: 'Tanggal mulai', pemegang_hak: 'Pemegang hak', lokasi: 'Lokasi dokumen', sumber_dokumen: 'Sumber dokumen',
  luas_dokumen_m2: 'Luas dokumen (m²)', nama_mitra: 'Mitra', no_perjanjian: 'Nomor perjanjian', skema_kerja_sama: 'Skema kerja sama',
}

function popupContent(title: string, entries: Array<[string, string]>) {
  const container = document.createElement('div')
  container.className = 'min-w-[210px] space-y-1 text-sm'
  const heading = document.createElement('strong')
  heading.textContent = title
  container.append(heading)
  for (const [label, value] of entries) {
    const row = document.createElement('div')
    const key = document.createElement('span')
    key.className = 'text-slate-500'
    key.textContent = `${label}: `
    const content = document.createElement('span')
    content.textContent = value
    row.append(key, content)
    container.append(row)
  }
  return container
}

function currentBounds(map: L.Map) {
  const bounds = map.getBounds()
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
}

export function AsetMap({ data, className = '', onViewportChange, focusBbox, zoomTarget }: {
  data?: GISFeatureCollection | null
  className?: string
  onViewportChange?: (bbox: string) => void
  focusBbox?: string | null
  zoomTarget?: { bbox: string; request: number } | null
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const hasAutoFittedRef = useRef(false)
  const hasFittedKonsesiRef = useRef(false)

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, {
      // Use Leaflet's native control.  Firefox handles its pointer and
      // keyboard events more reliably than a custom overlay after fitBounds.
      zoomControl: true,
      minZoom: 4,
      maxZoom: 19,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      keyboard: true,
    }).setView(INDONESIA_CENTER, 5)
    for (const [name, zIndex] of Object.entries({ 'gis-forest': 300, 'gis-konsesi': 410, 'gis-tanaman': 420, 'gis-opset': 430, 'gis-okupasi': 440, 'gis-administrasi': 450 })) {
      map.createPane(name).style.zIndex = String(zIndex)
    }
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxZoom: 19,
    })
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors', maxZoom: 19,
    })
    // Satellite is the default inspection view; the control keeps the street
    // map available when labels or road context are needed.
    satellite.addTo(map)
    L.control.layers({ 'Citra satelit': satellite, 'Peta jalan': streets }, undefined, { position: 'topright' }).addTo(map)
    map.on('moveend', () => onViewportChange?.(currentBounds(map)))
    mapRef.current = map
    onViewportChange?.(currentBounds(map))
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => map.invalidateSize({ pan: false, debounceMoveend: true }))
    })
    resizeObserver.observe(hostRef.current)
    map.invalidateSize({ pan: false, debounceMoveend: true })
    return () => { resizeObserver.disconnect(); map.remove(); mapRef.current = null }
  }, [onViewportChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    layerRef.current?.remove()
    layerRef.current = null
    // A viewport request produces a new GeoJSON object after every pan/zoom.
    // Do not reset the user's map position merely because the response is
    // empty or refreshed for the same layer.
    if (!data?.features.length) return
    const layer = L.featureGroup().addTo(map)
    let konsesiBounds: L.LatLngBounds | null = null
    for (const layerKind of Object.keys(COLOR_BY_KIND) as GISKind[]) {
      const kindFeatures = data.features.filter(feature => feature.properties.kind === layerKind)
      if (!kindFeatures.length) continue
      const kindLayer = L.geoJSON({ type: 'FeatureCollection', features: kindFeatures } as GeoJSON.FeatureCollection, {
      pane: PANE_BY_KIND[layerKind],
      style: feature => {
        const kind = feature?.properties?.kind as GISKind | undefined
        const color = kind ? COLOR_BY_KIND[kind] : '#1B4F72'
        const preview = Boolean(feature?.properties?.preview)
        return { color, weight: kind === 'administrasi' ? 1 : 3, dashArray: preview ? '7 5' : undefined, fillColor: color, fillOpacity: preview ? 0.08 : kind === 'administrasi' ? 0.03 : 0.2 }
      },
      pointToLayer: (feature, latlng) => {
        const kind = feature.properties?.kind as GISKind | undefined
        const color = kind ? COLOR_BY_KIND[kind] : '#1B4F72'
        return L.circleMarker(latlng, { pane: PANE_BY_KIND[kind ?? layerKind], radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
      },
      onEachFeature: (feature, item) => {
        const name = `${feature.properties?.preview ? 'Draf — ' : ''}${String(feature.properties?.name ?? 'Lokasi aset')}`
        const properties = feature.properties ?? {}
        const kind = properties.kind as GISKind | undefined
        // Bind the bounds from the complete GeoJSON feature, not the clicked
        // Leaflet child. Firefox may emit the parent GeoJSON group as target
        // for multipart polygons, which otherwise makes getBounds unreliable.
        const concessionBounds = kind === 'konsesi'
          ? L.geoJSON(feature as GeoJSON.Feature).getBounds()
          : null
        const attributes = (properties.attributes ?? {}) as Record<string, string | number | null>
        const entries: Array<[string, string]> = []
        if (kind) entries.push(['Jenis layer', KIND_LABEL[kind]])
        entries.push(['Luas geometris', `${Number(properties.computed_area_m2 ?? 0).toLocaleString('id-ID')} m²`])
        for (const [key, value] of Object.entries(attributes)) {
          if (value === null || value === '') continue
          entries.push([ATTRIBUTE_LABEL[key] ?? key.replace(/_/g, ' '), String(value)])
        }
        const bindDetailPopup = (target: L.Layer) => {
          target.bindPopup(popupContent(name, entries), { maxWidth: 330 })
          target.on('click', event => {
            if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent)
            // A concession is the primary navigation object: clicking it
            // always frames its complete boundary before showing details.
            if (concessionBounds?.isValid()) {
              map.invalidateSize({ pan: false, debounceMoveend: true })
              map.fitBounds(concessionBounds, { padding: [28, 28], maxZoom: 19, animate: false })
            }
            target.openPopup(event.latlng)
          })
        }
        bindDetailPopup(item)
        if (item instanceof L.LayerGroup) item.eachLayer(bindDetailPopup)
      },
      }).addTo(layer)
      if (layerKind === 'konsesi') konsesiBounds = kindLayer.getBounds()
    }
    layerRef.current = layer
    const bounds = layer.getBounds()
    // A table-row "Peta" request supplies a specific concession bbox.  Do
    // not let the asynchronous KML refresh auto-fit every Regional 8 feature
    // afterwards and overwrite that requested location.
    if (focusBbox) { hasAutoFittedRef.current = true; hasFittedKonsesiRef.current = true; return }
    // Draft concession layers load after published OPSET layers; frame the
    // whole concession once it arrives instead of the first small OPSET area.
    if (!hasFittedKonsesiRef.current && konsesiBounds?.isValid()) {
      hasAutoFittedRef.current = true
      hasFittedKonsesiRef.current = true
      map.fitBounds(konsesiBounds, { padding: [28, 28], maxZoom: 17 })
    } else if (!hasAutoFittedRef.current && bounds.isValid()) {
      hasAutoFittedRef.current = true
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 })
    }
  }, [data, focusBbox])

  useEffect(() => {
    if (!focusBbox || !mapRef.current) return
    const values = focusBbox.split(',').map(Number)
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return
    mapRef.current.fitBounds([[values[1], values[0]], [values[3], values[2]]], { padding: [28, 28], maxZoom: 19, animate: false })
  }, [focusBbox])

  useEffect(() => {
    if (!zoomTarget || !mapRef.current) return
    const values = zoomTarget.bbox.split(',').map(Number)
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return
    hasAutoFittedRef.current = true
    hasFittedKonsesiRef.current = true
    mapRef.current.fitBounds([[values[1], values[0]], [values[3], values[2]]], { padding: [28, 28], maxZoom: 19, animate: false })
  }, [zoomTarget])

  return <div className={`relative h-[640px] w-full overflow-hidden rounded-lg ${className}`}>
    <div ref={hostRef} className="h-full w-full" aria-label="Peta lokasi aset" />
  </div>
}
