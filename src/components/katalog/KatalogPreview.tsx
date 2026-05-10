import React, { useState } from 'react'
import type { KatalogFactsheetData, KatalogLayout, KatalogDensity } from '@/types'
import FactsheetEditorial from './FactsheetEditorial'
import FactsheetModular from './FactsheetModular'
import FactsheetCompact from './FactsheetCompact'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Printer, ZoomIn, ZoomOut, RotateCw } from 'lucide-react'

interface Props {
  data: KatalogFactsheetData
  onPrint?: () => void
}

const VARIATIONS: { id: KatalogLayout; label: string; Comp: React.ComponentType<{ data: KatalogFactsheetData; density?: KatalogDensity }> }[] = [
  { id: 'editorial', label: 'Editorial', Comp: FactsheetEditorial },
  { id: 'modular', label: 'Modular', Comp: FactsheetModular },
  { id: 'compact', label: 'Compact', Comp: FactsheetCompact },
]

export default function KatalogPreview({ data, onPrint }: Props) {
  const [variation, setVariation] = useState<KatalogLayout>('editorial')
  const [density, setDensity] = useState<KatalogDensity>('normal')
  const [scale, setScale] = useState(0.68)

  const active = VARIATIONS.find(v => v.id === variation) ?? VARIATIONS[0]
  const Comp = active.Comp

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Select value={variation} onValueChange={(v) => setVariation(v as KatalogLayout)}>
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIATIONS.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs value={density} onValueChange={(v) => setDensity(v as KatalogDensity)}>
            <TabsList className="h-9">
              <TabsTrigger value="compact" className="text-xs px-3">Padat</TabsTrigger>
              <TabsTrigger value="normal" className="text-xs px-3">Normal</TabsTrigger>
              <TabsTrigger value="spacious" className="text-xs px-3">Longgar</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

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
          <Comp data={data} density={density} />
        </div>
      </div>
    </div>
  )
}
