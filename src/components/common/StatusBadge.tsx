import { Badge } from '@/components/ui/badge'
import { AsetStatus, KerjaSamaStatus, TimelineStatus, ProspekProgress } from '@/types'

const asetStatusMap: Record<AsetStatus, { label: string; variant: string }> = {
  pipeline: { label: 'Pipeline', variant: 'info' },
  prospek: { label: 'Prospek', variant: 'warning' },
  negosiasi: { label: 'Negosiasi', variant: 'sp1' },
  aktif_ks: { label: 'Aktif KS', variant: 'success' },
  selesai: { label: 'Selesai', variant: 'secondary' },
}

const ksStatusMap: Record<KerjaSamaStatus, { label: string; variant: string }> = {
  aktif: { label: 'Aktif', variant: 'success' },
  sp1: { label: 'SP1', variant: 'sp1' },
  sp2: { label: 'SP2', variant: 'sp2' },
  sp3: { label: 'SP3', variant: 'sp3' },
  putus: { label: 'Putus', variant: 'putus' },
  selesai: { label: 'Selesai', variant: 'secondary' },
}

const timelineStatusMap: Record<TimelineStatus, { label: string; variant: string }> = {
  belum: { label: 'Belum', variant: 'secondary' },
  proses: { label: 'Proses', variant: 'info' },
  selesai: { label: 'Selesai', variant: 'success' },
  terlambat: { label: 'Terlambat', variant: 'destructive' },
}

const prospekProgressMap: Record<ProspekProgress, { label: string; variant: string }> = {
  identifikasi: { label: 'Identifikasi', variant: 'secondary' },
  penjajakan: { label: 'Penjajakan', variant: 'info' },
  penawaran: { label: 'Penawaran', variant: 'warning' },
  negosiasi: { label: 'Negosiasi', variant: 'sp1' },
  gagal: { label: 'Gagal', variant: 'destructive' },
  berhasil: { label: 'Berhasil', variant: 'success' },
}

interface StatusBadgeProps {
  type: 'aset' | 'ks' | 'timeline' | 'prospek' | 'bayar'
  value: string
}

export function StatusBadge({ type, value }: StatusBadgeProps) {
  let label = value
  let variant = 'secondary'

  if (type === 'aset' && value in asetStatusMap) {
    const m = asetStatusMap[value as AsetStatus]
    label = m.label; variant = m.variant
  } else if (type === 'ks' && value in ksStatusMap) {
    const m = ksStatusMap[value as KerjaSamaStatus]
    label = m.label; variant = m.variant
  } else if (type === 'timeline' && value in timelineStatusMap) {
    const m = timelineStatusMap[value as TimelineStatus]
    label = m.label; variant = m.variant
  } else if (type === 'prospek' && value in prospekProgressMap) {
    const m = prospekProgressMap[value as ProspekProgress]
    label = m.label; variant = m.variant
  } else if (type === 'bayar') {
    const bayarMap: Record<string, { label: string; variant: string }> = {
      lunas: { label: 'Lunas', variant: 'success' },
      sebagian: { label: 'Sebagian', variant: 'warning' },
      belum_bayar: { label: 'Belum Bayar', variant: 'secondary' },
      terlambat: { label: 'Terlambat', variant: 'destructive' },
    }
    if (value in bayarMap) { label = bayarMap[value].label; variant = bayarMap[value].variant }
  }

  return <Badge variant={variant as any}>{label}</Badge>
}
