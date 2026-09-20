import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { GISFeatureCollection, GISKind, GISOfficialForestHit } from '@/types/gis'

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

const OFFICIAL_FOREST_CODES: Record<string, number[]> = {
  'Kawasan Konservasi': [100000, 100200, 100210, 100220, 100230, 100240, 100250, 100260],
  'Kawasan Konservasi Laut': [100201, 100211, 100221, 100241, 100251],
  'Hutan Lindung': [100100],
  'Hutan Produksi Tetap': [100300],
  'Hutan Produksi Terbatas': [100400],
  'Hutan Produksi yang dapat di Konversi': [100500],
  'Area Penggunaan Lain': [100700],
  'Tubuh Air': [500100, 500300],
  'Tidak Terdefinisi': [0],
}

const OFFICIAL_FOREST_SERVICE = 'https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer/export'

function currentBounds(map: L.Map) {
  const bounds = map.getBounds()
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(',')
}

export function AsetMap({ data, className = '', onViewportChange, focusBbox, zoomTarget, officialForestVisible = false, officialForestFunction = 'all', officialForestZoomRequest = 0, onOfficialForestClick }: {
  data?: GISFeatureCollection | null
  className?: string
  onViewportChange?: (bbox: string) => void
  focusBbox?: string | null
  zoomTarget?: { datasetId: string; request: number } | null
  officialForestVisible?: boolean
  officialForestFunction?: string
  officialForestZoomRequest?: number
  onOfficialForestClick?: (lng: number, lat: number) => Promise<GISOfficialForestHit>
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.FeatureGroup | null>(null)
  const officialForestRef = useRef<L.ImageOverlay | null>(null)
  const hasAutoFittedRef = useRef(false)

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return
    const map = L.map(hostRef.current, {
      zoomControl: false,
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
    return () => { map.remove(); mapRef.current = null }
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
    for (const layerKind of Object.keys(COLOR_BY_KIND) as GISKind[]) {
      const kindFeatures = data.features.filter(feature => feature.properties.kind === layerKind)
      if (!kindFeatures.length) continue
      L.geoJSON({ type: 'FeatureCollection', features: kindFeatures } as GeoJSON.FeatureCollection, {
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
            target.openPopup(event.latlng)
          })
        }
        bindDetailPopup(item)
        if (item instanceof L.LayerGroup) item.eachLayer(bindDetailPopup)
      },
      }).addTo(layer)
    }
    layerRef.current = layer
    const bounds = layer.getBounds()
    if (!hasAutoFittedRef.current && bounds.isValid()) {
      hasAutoFittedRef.current = true
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 17 })
    }
  }, [data])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const remove = () => {
      officialForestRef.current?.remove()
      officialForestRef.current = null
    }
    if (!officialForestVisible) {
      remove()
      return
    }

    const updateOfficialForest = () => {
      const bounds = map.getBounds()
      const size = map.getSize()
      const params = new URLSearchParams({
        bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(','),
        bboxSR: '4326',
        imageSR: '4326',
        size: `${Math.max(1, Math.round(size.x))},${Math.max(1, Math.round(size.y))}`,
        format: 'png32',
        transparent: 'true',
        layers: 'show:0',
        f: 'image',
      })
      const codes = OFFICIAL_FOREST_CODES[officialForestFunction]
      // "Semua kawasan hutan" intentionally excludes APL, water, and
      // undefined polygons. Those are available as explicit filters but
      // would otherwise wash out the satellite imagery with white fills.
      const where = codes?.length ? `FUNGSIKWS IN (${codes.join(',')})` : 'FUNGSIKWS NOT IN (0,100700,500100,500300)'
      params.set('layerDefs', JSON.stringify({ 0: where }))
      const url = `${OFFICIAL_FOREST_SERVICE}?${params.toString()}`
      if (officialForestRef.current) {
        officialForestRef.current.setUrl(url)
        officialForestRef.current.setBounds(bounds)
      } else {
        officialForestRef.current = L.imageOverlay(url, bounds, { pane: PANE_BY_KIND.hutan, opacity: 0.55, interactive: false, zIndex: 250 }).addTo(map)
      }
    }

    updateOfficialForest()
    map.on('moveend', updateOfficialForest)
    return () => {
      map.off('moveend', updateOfficialForest)
      remove()
    }
  }, [officialForestVisible, officialForestFunction])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !officialForestVisible || !onOfficialForestClick) return
    const identify = async (event: L.LeafletMouseEvent) => {
      if (event.sourceTarget !== map) return
      const popup = L.popup({ maxWidth: 330 }).setLatLng(event.latlng).setContent('Memeriksa kawasan hutan…').openOn(map)
      try {
        const hit = await onOfficialForestClick(event.latlng.lng, event.latlng.lat)
        const nonForestClasses = ['Area Penggunaan Lain', 'Tubuh Air', 'Tidak Terdefinisi']
        const isNonForest = nonForestClasses.includes(hit.function ?? '')
        if (isNonForest && officialForestFunction !== hit.function) {
          popup.remove()
          return
        }
        const referenceTitle = isNonForest ? 'Referensi tata guna lahan nasional' : 'Referensi kawasan hutan nasional'
        const entries: Array<[string, string]> = [
          ['Jenis referensi', isNonForest ? 'Tata guna lahan pemerintah' : 'Kawasan hutan pemerintah'],
          [isNonForest ? 'Klasifikasi' : 'Status kawasan', hit.function ?? 'Tidak ditemukan pada referensi ini'],
          ['Sumber', hit.source],
          ['Tahun', String(hit.year)],
          ['Catatan', hit.note],
        ]
        popup.setContent(popupContent(referenceTitle, entries))
      } catch {
        popup.setContent(popupContent('Referensi pemerintah', [['Status', 'Informasi resmi belum dapat dimuat. Coba lagi.']]))
      }
    }
    map.on('click', identify)
    return () => { map.off('click', identify) }
  }, [officialForestVisible, officialForestFunction, onOfficialForestClick])

  useEffect(() => {
    if (!focusBbox || !mapRef.current) return
    const values = focusBbox.split(',').map(Number)
    if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return
    mapRef.current.fitBounds([[values[1], values[0]], [values[3], values[2]]], { padding: [28, 28], maxZoom: 13, animate: false })
  }, [focusBbox])

  useEffect(() => {
    if (!zoomTarget || !mapRef.current || !data?.features.length) return
    const targetFeatures = data.features.filter(feature => feature.properties.dataset_id === zoomTarget.datasetId)
    if (!targetFeatures.length) return
    const bounds = L.geoJSON({ type: 'FeatureCollection', features: targetFeatures } as GeoJSON.FeatureCollection).getBounds()
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [28, 28], maxZoom: 17, animate: false })
  }, [zoomTarget, data])

  useEffect(() => {
    if (!officialForestZoomRequest || !mapRef.current) return
    mapRef.current.fitBounds([[-11.01, 94.97], [6.08, 141.02]], { padding: [28, 28], maxZoom: 6, animate: false })
  }, [officialForestZoomRequest])

  const zoom = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    map.setView(map.getCenter(), Math.max(4, Math.min(19, map.getZoom() + delta)), { animate: false })
  }

  return <div className={`relative h-[640px] w-full overflow-hidden rounded-lg ${className}`}>
    <div ref={hostRef} className="h-full w-full" aria-label="Peta lokasi aset" />
    <div className="absolute left-3 top-3 z-[1000] overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      <button type="button" aria-label="Perbesar peta" className="block h-9 w-9 border-b border-slate-200 text-xl leading-none hover:bg-slate-100" onClick={() => zoom(1)}>+</button>
      <button type="button" aria-label="Perkecil peta" className="block h-9 w-9 text-xl leading-none hover:bg-slate-100" onClick={() => zoom(-1)}>−</button>
    </div>
  </div>
}
