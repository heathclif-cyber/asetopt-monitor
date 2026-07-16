import { useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw, FileText, Loader2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DocxPreview } from '@/components/common/DocxPreview'
import { cn } from '@/lib/utils'

/** A4 @ 96dpi */
const PAGE_W = 794
const PAGE_H = 1123

interface Props {
  /** Preview HTML (surat tagihan) — prioritas, cepat & akurat */
  html?: string | null
  /** Fallback: blob .docx */
  docxBlob?: Blob | null
  loading?: boolean
  ready: boolean
  mitra?: string
  periode?: string
}

export function InvoicePreviewPanel({
  html,
  docxBlob = null,
  loading,
  ready,
  mitra,
  periode,
}: Props) {
  const [scale, setScale] = useState(0.72)
  const useHtml = !!(html && html.trim())

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-gradient-to-b from-slate-100 to-slate-200/80">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b bg-white/90 backdrop-blur-sm shrink-0">
        <div className="min-w-0 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B4F72]/10 text-[#1B4F72] shrink-0">
            <FileText size={15} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">Preview Surat Tagihan</p>
            {ready && mitra ? (
              <p className="text-[11px] text-gray-500 truncate">
                {mitra}{periode ? ` · ${periode}` : ''}
                {useHtml ? ' · format invoice formal' : ''}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 truncate">
                Format surat penagihan (bukan kuitansi)
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 rounded-lg border bg-slate-50 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-600 hover:text-gray-900"
            onClick={() => setScale(s => Math.max(0.4, +(s - 0.08).toFixed(2)))}
            title="Perkecil"
          >
            <ZoomOut size={14} />
          </Button>
          <span className="text-[11px] text-gray-600 w-11 text-center tabular-nums font-medium">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-600 hover:text-gray-900"
            onClick={() => setScale(s => Math.min(1.2, +(s + 0.08).toFixed(2)))}
            title="Perbesar"
          >
            <ZoomIn size={14} />
          </Button>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-600 hover:text-gray-900"
            onClick={() => setScale(0.72)}
            title="Reset zoom"
          >
            <RotateCcw size={13} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-gray-600 hover:text-gray-900"
            onClick={() => setScale(1)}
            title="100%"
          >
            <Maximize2 size={13} />
          </Button>
        </div>
      </div>

      <div className={cn(
        'flex-1 overflow-auto p-4 sm:p-6 lg:p-8',
        'flex justify-center items-start',
      )}>
        {!ready ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6 max-w-sm my-auto">
            <div className="w-14 h-14 rounded-2xl bg-white border shadow-sm flex items-center justify-center mb-4">
              <FileText size={26} className="text-slate-400" />
            </div>
            <p className="text-gray-700 text-sm font-semibold">Belum ada draf</p>
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              Pilih no. kontrak dan tahap pembayaran untuk melihat surat tagihan invoice
            </p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-white border shadow-sm flex items-center justify-center">
              <Loader2 size={22} className="animate-spin text-[#1B4F72]" />
            </div>
            <p className="text-gray-500 text-xs">Menyusun preview...</p>
          </div>
        ) : useHtml ? (
          <div
            className="bg-white shadow-xl shadow-slate-300/50 origin-top"
            style={{
              width: PAGE_W * scale,
              height: PAGE_H * scale,
            }}
          >
            <iframe
              title="Preview invoice"
              srcDoc={html!}
              className="border-0 bg-white"
              style={{
                width: PAGE_W,
                height: PAGE_H,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
              sandbox=""
            />
          </div>
        ) : docxBlob ? (
          <div
            className="docx-preview-scale origin-top shadow-xl shadow-slate-300/50 rounded-sm"
            style={{ transform: `scale(${scale})` }}
          >
            <DocxPreview blob={docxBlob} fast />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center my-auto">
            <p className="text-sm text-gray-600 font-medium">Preview tidak tersedia</p>
            <p className="text-xs text-gray-400 mt-1">Periksa data tagihan atau unduh .docx</p>
          </div>
        )}
      </div>
    </div>
  )
}
