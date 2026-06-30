import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCw, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocxPreview } from '@/components/common/DocxPreview'

interface Props {
  docxBlob: Blob | null
  loading?: boolean
  ready: boolean
  mitra?: string
  periode?: string
}

export function InvoicePreviewPanel({ docxBlob, loading, ready, mitra, periode }: Props) {
  const [scale, setScale] = useState(0.85)

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#1e293b] min-h-[420px] lg:min-h-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-[#0f172a]/80 shrink-0">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">Preview Invoice (.docx)</p>
          {ready && mitra && (
            <p className="text-[11px] text-slate-400 truncate">
              {mitra}{periode ? ` · ${periode}` : ''} — sama dengan file unduhan
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setScale(s => Math.max(0.45, s - 0.1))}
          >
            <ZoomOut size={15} />
          </Button>
          <span className="text-xs text-slate-400 w-10 text-center tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setScale(s => Math.min(1.2, s + 0.1))}
          >
            <ZoomIn size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-white/10"
            onClick={() => setScale(0.85)}
          >
            <RotateCw size={15} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 lg:p-8 flex justify-center items-start">
        {!ready ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-8 max-w-sm">
            <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
              <FileText size={28} className="text-slate-500" />
            </div>
            <p className="text-slate-300 text-sm font-medium">Belum ada draf</p>
            <p className="text-slate-500 text-xs mt-2 leading-relaxed">
              Pilih no. kontrak dan tahap pembayaran di panel kiri untuk melihat preview
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 size={28} className="animate-spin text-slate-400" />
            <p className="text-slate-400 text-xs">Membuat preview dokumen...</p>
          </div>
        ) : docxBlob ? (
          <div
            className="docx-preview-scale origin-top"
            style={{ transform: `scale(${scale})` }}
          >
            <DocxPreview blob={docxBlob} />
          </div>
        ) : null}
      </div>
    </div>
  )
}