import type { CSSProperties } from 'react'
import type { KatalogFactsheetData } from '@/types'

// Coordinates are taken from Canva DAHVb4x7RFk page 18 (3118 × 1500).
// Keep one coordinate system for screen, print and visual regression fixtures.
export const CANVA_WIDTH = 3118 / 3
export const CANVA_HEIGHT = 500
export const canvaBox = (left: number, top: number, width: number, height: number): CSSProperties => ({
  position: 'absolute', left: left / 3, top: top / 3, width: width / 3, height: height / 3,
})

export const CANVA_PHOTO_SLOTS = [
  { id: 'cl-hero', label: 'Foto utama — tengah', aliases: ['ed-hero', 'md-hero', 'cp-hero'] },
  { id: 'cl-portrait', label: 'Foto vertikal — panel kiri', aliases: ['ed-aerial', 'cp-aerial', 'md-media-3', 'cl-hero', 'ed-hero', 'md-hero', 'cp-hero'] },
  { id: 'cl-near-1', label: 'Foto kecil — kanan atas 1', aliases: ['ed-thumb-1', 'md-media-1', 'cp-thumb-1'] },
  { id: 'cl-near-2', label: 'Foto kecil — kanan atas 2', aliases: ['ed-thumb-2', 'md-media-2', 'cp-thumb-2'] },
  { id: 'cl-near-3', label: 'Foto kecil — bawah 1', aliases: ['ed-thumb-3', 'cp-thumb-3'] },
  { id: 'cl-near-4', label: 'Foto kecil — bawah 2', aliases: ['md-media-3', 'ed-aerial', 'cp-aerial'] },
  { id: 'cl-map', label: 'Peta lokasi / rute — kanan bawah', aliases: [] },
]

export function canvaPhoto(photos: Record<string, string>, id: string) {
  const slot = CANVA_PHOTO_SLOTS.find(item => item.id === id)
  return [id, ...(slot?.aliases ?? [])].map(key => photos[key]).find(Boolean)
}

export function locationLink(data: KatalogFactsheetData) {
  const { lat, lng } = data.coordinates
  const latitude = Number(lat.trim()), longitude = Number(lng.trim())
  if (lat.trim() && lng.trim() && Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`
  }
  return data.address.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}` : undefined
}

// The template always has the four compass cards. Older records without a
// direction are placed in their saved order, but the visual marker never
// becomes a sequence number.
export function accessRows(data: KatalogFactsheetData) {
  const directions = ['N', 'W', 'E', 'S'] as const
  const aliases: Record<string, typeof directions[number]> = { n: 'N', north: 'N', utara: 'N', w: 'W', west: 'W', barat: 'W', e: 'E', east: 'E', timur: 'E', s: 'S', south: 'S', selatan: 'S' }
  const cards = new Map<typeof directions[number], string>()
  const unassigned: string[] = []
  for (const item of data.accessibility) {
    const raw = item.label.trim()
    if (/^radius$/i.test(raw) || /tol|toll|jalan|road/i.test(raw)) continue
    const match = raw.match(/^(north|south|east|west|utara|selatan|timur|barat|[NWES])(?:\s*[:–-]\s*|$)/i)
    const label = match ? raw.slice(match[0].length).trim() : raw
    const details = [item.value, item.sub].filter(Boolean).join(' ')
    const text = [label, details].filter(Boolean).join('\n')
    const direction = match ? aliases[match[1].toLowerCase()] : undefined
    if (direction && !cards.has(direction)) cards.set(direction, text)
    else if (text) unassigned.push(text)
  }
  return directions.map(marker => ({ marker, text: cards.get(marker) ?? unassigned.shift() ?? '' }))
}
