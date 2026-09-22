import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { KatalogFactsheetData } from '@/types'
import FactsheetCanvaLandscape, { CANVA_HEIGHT, CANVA_WIDTH } from './FactsheetCanvaLandscape'
import { Button } from '@/components/ui/button'
import { Printer, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import './KatalogPreview.css'
import { accessRows, canvaPhoto, CANVA_PHOTO_SLOTS } from './canva-layout'

interface Props {
  data: KatalogFactsheetData
  onPrint?: () => void
}

export default function KatalogPreview({ data, onPrint }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [availableWidth, setAvailableWidth] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)

  const fitScale = availableWidth > 0 ? Math.min(1, availableWidth / CANVA_WIDTH) : 0.68
  const scale = zoom ?? fitScale
  const missingPhotos = CANVA_PHOTO_SLOTS.filter(slot => !canvaPhoto(data.photos, slot.id)).map(slot => slot.label)
  const emptyAccess = accessRows(data).filter(row => !row.text).length

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      // The stage has 24px padding on both sides; fit the actual drawable area.
      setAvailableWidth(Math.max(0, viewport.clientWidth - 48))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const changeZoom = (delta: number) => {
    setZoom(current => Math.min(1.25, Math.max(0.2, (current ?? fitScale) + delta)))
  }

  const resetZoom = () => setZoom(null)

  const print = () => {
    if (onPrint) onPrint()
    else window.print()
  }

  const scaledWidth = CANVA_WIDTH * scale
  const scaledHeight = CANVA_HEIGHT * scale

  return (
    <>
      <div className="katalog-preview space-y-4">
        {(missingPhotos.length > 0 || emptyAccess > 0) && (
          <p className="text-xs text-amber-800 bg-amber-50 rounded-md px-3 py-2" role="status">
            Belum lengkap: {[...missingPhotos, ...(emptyAccess ? [`${emptyAccess} kartu akses`] : [])].join('; ')}.
            {' '}Lengkapi di Isi Data / Upload Foto. Foto lama tetap digunakan.
          </p>
        )}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="text-sm font-medium text-slate-700">Katalog Landscape</div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changeZoom(-0.05)} aria-label="Perkecil preview">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={() => changeZoom(0.05)} aria-label="Perbesar preview">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom} aria-label="Sesuaikan dengan lebar layar">
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button size="sm" onClick={print}>
              <Printer className="w-4 h-4 mr-1" />
              Cetak / PDF
            </Button>
          </div>
        </div>

        <div ref={viewportRef} className="katalog-preview-viewport">
          <div className="katalog-preview-canvas" style={{ width: scaledWidth, height: scaledHeight }}>
            <div
              className="katalog-preview-transform"
              style={{ width: CANVA_WIDTH, height: CANVA_HEIGHT, transform: `scale(${scale})` }}
            >
              <FactsheetCanvaLandscape data={data} />
            </div>
          </div>
        </div>
      </div>

      {typeof document !== 'undefined' && createPortal(
        <div className="factsheet-print-portal" aria-hidden="true">
          <div className="factsheet-print-source">
            <FactsheetCanvaLandscape data={data} />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
