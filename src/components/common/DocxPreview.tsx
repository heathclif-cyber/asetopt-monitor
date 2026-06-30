import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Loader2 } from 'lucide-react'

const RENDER_OPTIONS = {
  className: 'docx-preview',
  inWrapper: true,
  ignoreWidth: true,
  ignoreHeight: false,
  ignoreFonts: false,
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  experimental: false,
  trimXmlDeclaration: true,
  useBase64URL: false,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
} as const

interface Props {
  blob?: Blob | null
  url?: string | null
  className?: string
}

export function DocxPreview({ blob, url, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setError(null)
    setLoading(true)

    const render = async () => {
      try {
        let data: Blob
        if (blob) {
          data = blob
        } else if (url) {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          data = await res.blob()
        } else {
          setLoading(false)
          return
        }

        if (cancelled) return
        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''

        await renderAsync(data, container, undefined, RENDER_OPTIONS)
        if (!cancelled) setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Gagal memuat preview')
          setLoading(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [blob, url])

  if (error) {
    return (
      <div className="text-sm text-red-400 p-8 text-center">
        Gagal memuat preview: {error}
      </div>
    )
  }

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-slate-400" />
        </div>
      )}
      <div
        ref={containerRef}
        className={`docx-preview-wrapper${loading ? ' hidden' : ''}`}
      />
    </div>
  )
}