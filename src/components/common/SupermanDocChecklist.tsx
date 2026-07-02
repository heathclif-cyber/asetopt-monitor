import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/apiClient'
import { DocumentUpload } from './DocumentUpload'
import type { SupermanDocRequirement } from '@/types'

interface Props {
  kompensasiId: string
  refreshKey?: number
  onReadyChange?: (ready: boolean) => void
}

export function SupermanDocChecklist({ kompensasiId, refreshKey, onReadyChange }: Props) {
  const [reqs, setReqs] = useState<SupermanDocRequirement[]>([])
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const activeIdRef = useRef(kompensasiId)

  const fetchReqs = () => {
    if (!kompensasiId) return Promise.resolve()
    const requestId = kompensasiId
    setLoading(true)
    return api.get<{ requirements: SupermanDocRequirement[]; ready: boolean }>(
      `/api/superman/doc-requirements?kompensasi_id=${kompensasiId}`,
    ).then(res => {
      if (activeIdRef.current !== requestId) return
      setReqs(res.requirements)
      setReady(res.ready)
      onReadyChange?.(res.ready)
    }).catch(() => {
      if (activeIdRef.current !== requestId) return
      setReqs([])
      setReady(false)
      onReadyChange?.(false)
    }).finally(() => {
      if (activeIdRef.current === requestId) setLoading(false)
    })
  }

  useEffect(() => {
    activeIdRef.current = kompensasiId
    setReqs([])
    setReady(false)
    onReadyChange?.(false)
    if (!kompensasiId) return
    fetchReqs()
  }, [kompensasiId, refreshKey])

  const entityFor = (req: SupermanDocRequirement) => ({
    type: req.entity_type ?? 'kompensasi',
    id: req.entity_id && req.entity_id !== '-' ? req.entity_id : kompensasiId,
  })

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-gray-700">Dokumen Superman</p>
          <p className="text-[10px] text-gray-500">
            Wajib: Kontrak (per KS), Invoice &amp; Rekening Koran (per tahap ini) — dilampirkan ke SPPn
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          loading ? 'bg-gray-100 text-gray-600' : ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {loading ? 'Memeriksa...' : ready ? 'Lengkap' : 'Belum lengkap'}
        </span>
      </div>
      {reqs.map(r => {
        const ent = entityFor(r)
        return (
          <DocumentUpload
            key={`${r.doc_type}-${ent.type}-${ent.id}`}
            entityType={ent.type}
            entityId={ent.id}
            docType={r.doc_type as any}
            label={r.label}
            uploaded={r.uploaded}
            fileName={r.file_name}
            onUploaded={fetchReqs}
          />
        )
      })}
    </div>
  )
}