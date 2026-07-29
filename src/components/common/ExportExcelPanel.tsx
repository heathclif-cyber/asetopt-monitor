import { FileSpreadsheet, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ExportExcelPanelProps {
  title?: string
  description?: string
  meta?: string
  fileNameHint?: string
  onExport: () => void | Promise<void>
  disabled?: boolean
  loading?: boolean
  className?: string
  /** compact = baris kecil di header; card = panel penuh */
  variant?: 'card' | 'compact'
}

export function ExportExcelPanel({
  title = 'Ekspor Excel',
  description = 'Unduh data sesuai filter yang aktif saat ini.',
  meta,
  fileNameHint = '.xlsx',
  onExport,
  disabled,
  loading,
  className,
  variant = 'card',
}: ExportExcelPanelProps) {
  if (variant === 'compact') {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className={cn(
          'h-9 text-xs gap-1.5 border-emerald-200 bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900',
          className,
        )}
        onClick={() => void onExport()}
        disabled={disabled || loading}
        title={description}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
        {loading ? 'Menyiapkan…' : 'Export Excel'}
      </Button>
    )
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50 via-white to-teal-50/60 shadow-sm',
        className,
      )}
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-100/50 blur-2xl pointer-events-none" />
      <div className="relative flex flex-wrap items-center gap-4 px-4 py-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-md shadow-emerald-600/20">
          <FileSpreadsheet size={20} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
          {(meta || fileNameHint) && (
            <p className="text-[11px] text-emerald-700/80 mt-1 font-medium">
              {meta}
              {meta && fileNameHint ? ' · ' : ''}
              {fileNameHint && <span className="text-gray-400 font-normal">{fileNameHint}</span>}
            </p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          onClick={() => void onExport()}
          disabled={disabled || loading}
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {loading ? 'Menyiapkan…' : 'Unduh Excel'}
        </Button>
      </div>
    </div>
  )
}
