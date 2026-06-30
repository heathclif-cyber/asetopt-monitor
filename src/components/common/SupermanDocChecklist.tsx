import { useEffect, useState } from 'react'
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

  const fetchReqs = () => {
    if (!kompensasiId) return
    api.get<{ requirements: SupermanDocRequirement[]; ready: boolean }>(
      `/api/superman/doc-requirements?kompensasi_id=${kompensasiId}`,
    ).then(res => {
      setReqs(res.requirements)
      setReady(res.ready)
      onReadyChange?.(res.ready)
    }).catch(() => {})
  }

  useEffect(() => { fetchReqs() }, [kompensasiId, refreshKey])

  const entityFor = (req: SupermanDocRequirement) => ({
    type: req.entity_type ?? 'kompensasi',
    id: req.entity_id && req.entity_id !== '-' ? req.entity_id : kompensasiId,
  })

  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs font-semibold text-gray-700">Dokumen Superman</p>
          <p className="text-[10px] text-gray-500">Wajib: Kontrak, Invoice, Rekening Koran — dilampirkan ke SPPn</p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${ready ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
          {ready ? 'Lengkap' : 'Belum lengkap'}
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