import React, { useState } from 'react'
import type { KatalogFactsheetData } from '@/types'
import FactsheetCanvaLandscape from './FactsheetCanvaLandscape'
import { Button } from '@/components/ui/button'
import { Printer, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface Props {
  data: KatalogFactsheetData
  onPrint?: () => void
}

export default function KatalogPreview({ data, onPrint }: Props) {
  const [scale, setScale] = useState(0.68)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm font-medium text-slate-700">Katalog Landscape</div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setScale(s => Math.max(0.2, s - 0.05))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="sm" onClick={() => setScale(s => Math.min(1, s + 0.05))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setScale(0.68)}>
            <RotateCw className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1" />
            Cetak / PDF
          </Button>
        </div>
      </div>

      {/* Preview area */}
      <div className="flex justify-center bg-slate-900 rounded-lg p-6 overflow-auto">
        <div style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          boxShadow: '0 30px 80px rgba(0,0,0,0.35)',
        }}>
          <FactsheetCanvaLandscape data={data} />
        </div>
      </div>
    </div>
  )
}
