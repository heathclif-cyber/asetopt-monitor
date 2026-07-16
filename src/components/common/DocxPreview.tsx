import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
import { Loader2 } from 'lucide-react'

/** Opsi penuh — unduhan fidelity */
const RENDER_OPTIONS_FULL = {
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

/** Opsi cepat untuk panel preview live — skip footnote/endnote, font eksternal */
const RENDER_OPTIONS_FAST = {
  ...RENDER_OPTIONS_FULL,
  ignoreFonts: true,
  renderFootnotes: false,
  renderEndnotes: false,
  experimental: true,
} as const

interface Props {
  blob?: Blob | null
  url?: string | null
  className?: string
  /** Mode cepat untuk preview interaktif (default true) */
  fast?: boolean
}

export function DocxPreview({ blob, url, className, fast = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const renderGen = useRef(0)

  useEffect(() => {
    let cancelled = false
    const gen = ++renderGen.current
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
          if (!cancelled && gen === renderGen.current) setLoading(false)
          return
        }

        if (cancelled || gen !== renderGen.current) return
        const container = containerRef.current
        if (!container) return
        container.innerHTML = ''

        const opts = fast ? RENDER_OPTIONS_FAST : RENDER_OPTIONS_FULL
        await renderAsync(data, container, undefined, opts)
        if (!cancelled && gen === renderGen.current) setLoading(false)
      } catch (err) {
        if (!cancelled && gen === renderGen.current) {
          setError(err instanceof Error ? err.message : 'Gagal memuat preview')
          setLoading(false)
        }
      }
    }

    // Yield ke browser agar spinner tampil dulu, lalu render di frame berikutnya
    const raf = requestAnimationFrame(() => { void render() })
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [blob, url, fast])

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