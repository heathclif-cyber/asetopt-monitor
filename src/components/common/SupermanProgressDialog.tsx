import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/apiClient'
import type { SupermanDeklarasiProgress } from '@/types'

interface Props {
  open: boolean
  jobId: string | null
  onDone: (superman: string) => void
  onError: (msg: string) => void
  onClose: () => void
}

function extractSupermanRef(res: SupermanDeklarasiProgress): string | null {
  const r = res.result
  if (!r) return null
  if (r.superman_saved?.trim()) return r.superman_saved.trim()
  if (r.superman?.trim()) return r.superman.trim()
  const parts = [r.sppb_no, r.sppn_no].filter(Boolean)
  return parts.length ? parts.join(' + ') : null
}

export function SupermanProgressDialog({ open, jobId, onDone, onError, onClose }: Props) {
  const [percent, setPercent] = useState(0)
  const [stage, setStage] = useState('Memulai otomasi Playwright...')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !jobId) return
    setPercent(0)
    setStage('Memulai otomasi Playwright...')
    setErrorDetail(null)
    let cancelled = false

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await api.get<SupermanDeklarasiProgress>(
            `/api/superman/deklarasi/progress?job_id=${jobId}`,
          )
          setPercent(res.percent ?? 0)
          setStage(res.stage ?? 'Memproses...')

          if (res.status === 'completed') {
            const ref = extractSupermanRef(res)
            if (ref) {
              onDone(ref)
            } else {
              onDone(res.result?.message ?? 'Draft SPPn/SPPb berhasil dikirim ke Superman')
            }
            return
          }
          if (res.status === 'failed') {
            const msg = res.error ?? 'Superman gagal'
            setErrorDetail(msg)
            onError(msg)
            return
          }
        } catch (e: any) {
          onError(e.message ?? 'Gagal memantau progres Superman')
          return
        }
        await new Promise(r => setTimeout(r, 1200))
      }
    }

    poll()
    return () => { cancelled = true }
  }, [open, jobId, onDone, onError])

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Otomasi Superman (Playwright)</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600">
          Browser headless sedang login, mengisi form SPPn/SPPb, dan mengunggah dokumen pendukung.
        </p>
        <p className="text-xs text-gray-500 mt-1">{stage}</p>
        <div className="h-2 bg-gray-100 rounded overflow-hidden mt-3">
          <div
            className="h-full bg-[#1B4F72] transition-all duration-500"
            style={{ width: `${Math.max(percent, 5)}%` }}
          />
        </div>
        <p className="text-[11px] text-gray-400 text-right">{percent}%</p>
        {errorDetail && (
          <div className="mt-3 max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-800 whitespace-pre-wrap break-words">
            {errorDetail}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}