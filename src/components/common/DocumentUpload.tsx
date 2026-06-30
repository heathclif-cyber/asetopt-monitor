import { useRef, useState } from 'react'
import { Upload, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/apiClient'
import type { SupermanDocType } from '@/types'

interface Props {
  entityType: string
  entityId: string
  docType: SupermanDocType
  label: string
  uploaded?: boolean
  fileName?: string | null
  onUploaded?: () => void
}

export function DocumentUpload({ entityType, entityId, docType, label, uploaded, fileName, onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File) => {
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('entity_type', entityType)
      fd.append('entity_id', entityId)
      fd.append('doc_type', docType)
      fd.append('file', file)
      await api.post('/api/documents/upload', fd)
      onUploaded?.()
    } catch (e: any) {
      alert(e.message ?? 'Gagal upload dokumen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm min-w-0">
        {uploaded
          ? <Check size={14} className="text-green-600 shrink-0" />
          : <X size={14} className="text-red-400 shrink-0" />}
        <span className="truncate">{label}</span>
        {fileName && <span className="text-xs text-gray-400 truncate">({fileName})</span>}
      </div>
      <Button type="button" variant="outline" size="sm" disabled={loading}
        onClick={() => inputRef.current?.click()}>
        <Upload size={12} /> {loading ? '...' : 'Upload'}
      </Button>
      <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
    </div>
  )
}