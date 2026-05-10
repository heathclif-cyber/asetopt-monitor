import { useEffect, useState } from 'react'
import { useKatalogStore } from '@/store/katalogStore'
import { useNJOPStore } from '@/store/njopStore'
import { useKJPPStore } from '@/store/kjppStore'
import type { KatalogAset as KatalogAsetType, KatalogLayout, NJOP, PenilaianKJPP } from '@/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { Plus, Pencil, Trash2, Eye } from 'lucide-react'
import KatalogForm from '@/components/katalog/KatalogForm'
import KatalogPreview from '@/components/katalog/KatalogPreview'

const LAYOUT_LABELS: Record<KatalogLayout, string> = {
  editorial: 'Editorial',
  modular: 'Modular',
  compact: 'Compact',
}

export default function KatalogAsetPage() {
  const { daftarKatalog, isLoading, fetchAll, deleteKatalog, toFactsheetData } = useKatalogStore()
  const { fetchNJOP, getNJOPTerbaru } = useNJOPStore()
  const { fetchKJPP, getKJPPTerbaru } = useKJPPStore()
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<KatalogAsetType | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [previewTarget, setPreviewTarget] = useState<KatalogAsetType | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewNJOP, setPreviewNJOP] = useState<NJOP | null>(null)
  const [previewKJPP, setPreviewKJPP] = useState<PenilaianKJPP | null>(null)

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => {
    setEditTarget(null)
    setShowForm(true)
  }

  const openEdit = (k: KatalogAsetType) => {
    setEditTarget(k)
    setShowForm(true)
  }

  const openPreview = async (k: KatalogAsetType) => {
    const full = daftarKatalog.find(x => x.id === k.id) ?? k
    setPreviewTarget(full)
    // Fetch NJOP & KJPP for this aset
    if (full.aset_id) {
      await fetchNJOP(full.aset_id)
      await fetchKJPP(full.aset_id)
      setPreviewNJOP(getNJOPTerbaru(full.aset_id))
      setPreviewKJPP(getKJPPTerbaru(full.aset_id))
    }
    setPreviewOpen(true)
  }

  const handleFormSuccess = () => {
    setShowForm(false)
    setEditTarget(null)
    fetchAll()
  }

  const lightText = (text: string | null | undefined) => text || '-'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-semibold text-foreground">Katalog Aset</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Buat dan kelola katalog factsheet aset untuk pemasaran kerjasama. Tersedia 3 variasi layout: Editorial, Modular, dan Compact.
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Buat Katalog Baru
        </Button>
      </div>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => {
        if (!open) { setShowForm(false); setEditTarget(null) }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Katalog' : 'Buat Katalog Baru'}</DialogTitle>
          </DialogHeader>
          <KatalogForm
            existingKatalog={editTarget}
            onSuccess={handleFormSuccess}
            onCancel={() => { setShowForm(false); setEditTarget(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Katalog</DialogTitle>
          </DialogHeader>
          {previewTarget && (
            <KatalogPreview data={toFactsheetData(previewTarget, previewNJOP, previewKJPP)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Hapus Katalog"
        description="Katalog yang dihapus tidak dapat dikembalikan."
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteKatalog(deleteTarget)
            setDeleteTarget(null)
          }
        }}
      />

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : daftarKatalog.length === 0 ? (
        <EmptyState
          title="Belum ada katalog"
          description="Buat katalog pertama Anda untuk mulai memasarkan aset."
          action={<Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" /> Buat Katalog</Button>}
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Aset</th>
                <th className="px-4 py-3 text-left font-medium">Tagline</th>
                <th className="px-4 py-3 text-left font-medium">PIC</th>
                <th className="px-4 py-3 text-left font-medium">Layout</th>
                <th className="px-4 py-3 text-left font-medium">Tgl Dokumen</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {daftarKatalog.map(k => (
                <tr key={k.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{k.aset?.nama_aset ?? '-'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{k.aset?.kode_aset}</div>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[240px] truncate">
                    {lightText(k.tagline)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {k.pic_nama ? (
                      <div>
                        <div>{k.pic_nama}</div>
                        <div className="text-muted-foreground">{k.pic_mobile}</div>
                      </div>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {LAYOUT_LABELS[k.layout_preferensi] ?? 'Editorial'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lightText(k.tgl_dokumen)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Preview" onClick={() => openPreview(k)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(k)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Hapus" onClick={() => setDeleteTarget(k.id)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
