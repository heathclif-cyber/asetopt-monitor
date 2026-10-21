import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BULAN_LABELS_HO, type HOMasterRow } from '@/utils/laporanHOUtils'
import { exportEvaluasiKinerjaExcel } from '@/utils/evaluasiKinerjaExport'
import { PROGNOSA_BASIS_LABEL, buildPrognosaEvaluasi, type JadwalPerKode, type NonaktifBulanPerKind, type PrognosaBasis, type PrognosaKind } from '@/utils/prognosaUtils'

interface Props {
  /** Baris HO dari usePrognosaRKAP: sumber yang sama dengan angka di layar. */
  rows: HOMasterRow[]
  tahun: number
  endMonth: number
  basis: PrognosaBasis
  jadwal: Record<PrognosaKind, JadwalPerKode>
  manualCash: Record<string, Array<number | null>>
  manualPendapatan: Record<string, Array<number | null>>
  nonaktifBulan: NonaktifBulanPerKind
}

export function ExportEvaluasiKinerjaButton({ rows, tahun, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifBulan }: Props) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const prognosa = buildPrognosaEvaluasi({ rows, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifBulan })
      await exportEvaluasiKinerjaExcel(rows, { tahun, endMonth, prognosa })
    } catch (error) {
      console.error('[export evaluasi kinerja]', error)
      window.alert(`Excel Evaluasi Kinerja belum dapat dibuat: ${error instanceof Error ? error.message : 'terjadi kesalahan tidak dikenal'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        onClick={handleExport}
        disabled={exporting || rows.length === 0 || endMonth < 0}
        title={`Unduh Excel template Evaluasi Kinerja s.d. ${BULAN_LABELS_HO[Math.max(endMonth, 0)]} ${tahun} · prognosa: ${PROGNOSA_BASIS_LABEL[basis]} · Rp Juta`}
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        Evaluasi Kinerja
      </Button>
    </div>
  )
}
