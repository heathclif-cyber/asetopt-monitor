import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { StatusBadge } from '@/components/common/StatusBadge'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatAngka, formatTanggal, formatRupiah, hitungSisaHari } from '@/lib/utils'
import type { Aset, NJOP, PenilaianKJPP, TimelineProgram, ProspekMitra, KerjaSama, PBB } from '@/types'
import { PotensiResult } from '@/utils/potensiUtils'

interface SectionProps {
  aset: Aset
  njopTerbaru: NJOP | null
  kjppTerbaru: PenilaianKJPP | null
  potensi: PotensiResult | null
  timeline: TimelineProgram[]
  timelineProgress: number
  prospek: ProspekMitra[]
  kerjaSama: KerjaSama | null
  pbbTerbaru: PBB | null
}

export function KatalogCardSections(props: SectionProps) {
  const { aset, njopTerbaru, kjppTerbaru, potensi, timeline, timelineProgress, prospek, kerjaSama, pbbTerbaru } = props

  return (
    <div className="space-y-4 pt-1">
      {/* Informasi Umum */}
      <Section title="Informasi Umum">
        <InfoRow label="Kode Aset" value={aset.kode_aset} mono />
        <InfoRow label="Alamat" value={aset.alamat ?? '-'} />
        <InfoRow label="Luas Tanah" value={aset.luas_tanah_m2 != null ? `${formatAngka(aset.luas_tanah_m2)} m²` : '-'} />
        <InfoRow label="Luas Bangunan" value={aset.luas_bangunan_m2 != null ? `${formatAngka(aset.luas_bangunan_m2)} m²` : '-'} />
        <InfoRow label="Status" value={<StatusBadge type="aset" value={aset.status} />} />
      </Section>

      <Separator />

      {/* NJOP Terbaru */}
      <Section title="NJOP Terbaru">
        {njopTerbaru ? (
          <>
            <InfoRow label="Tahun" value={String(njopTerbaru.tahun)} />
            <InfoRow label="NJOP Tanah/m²" value={formatRupiah(njopTerbaru.nilai_tanah_per_m2)} />
            <InfoRow label="NJOP Bangunan/m²" value={formatRupiah(njopTerbaru.nilai_bangunan_per_m2)} />
            <InfoRow label="Sumber" value={njopTerbaru.sumber ?? '-'} />
          </>
        ) : (
          <EmptyMessage>Belum ada data NJOP</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* Potensi Pendapatan */}
      <Section title="Potensi Pendapatan">
        {potensi ? (
          <>
            <InfoRow label="Potensi Tanah" value={formatRupiah(potensi.potensiTanah)} highlight />
            <InfoRow label="Potensi Bangunan" value={formatRupiah(potensi.potensiBangunan)} highlight />
            <InfoRow label="Total Potensi" value={formatRupiah(potensi.totalPotensi)} highlight bold />
          </>
        ) : (
          <EmptyMessage>Lengkapi NJOP dan luas aset untuk menghitung potensi</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* Penilaian KJPP */}
      <Section title="Penilaian KJPP">
        {kjppTerbaru ? (
          <>
            <InfoRow label="KJPP" value={kjppTerbaru.nama_kjpp ?? '-'} />
            <InfoRow label="No. Laporan" value={kjppTerbaru.no_laporan ?? '-'} />
            <InfoRow label="Tgl Penilaian" value={formatTanggal(kjppTerbaru.tgl_penilaian)} />
            <InfoRow label="Nilai Tanah" value={formatRupiah(kjppTerbaru.nilai_tanah)} />
            <InfoRow label="Nilai Bangunan" value={formatRupiah(kjppTerbaru.nilai_bangunan)} />
            <InfoRow label="Total Nilai" value={formatRupiah(kjppTerbaru.total_nilai)} bold />
            <InfoRow
              label="Berlaku Hingga"
              value={kjppTerbaru.berlaku_hingga ? formatTanggal(kjppTerbaru.berlaku_hingga) : '-'}
            />
            {kjppTerbaru.berlaku_hingga && (
              <InfoRow
                label="Status"
                value={
                  new Date(kjppTerbaru.berlaku_hingga) < new Date()
                    ? <span className="text-amber-600 font-medium text-xs">Kadaluarsa</span>
                    : <span className="text-green-600 font-medium text-xs">Tersedia</span>
                }
              />
            )}
          </>
        ) : (
          <EmptyMessage>Belum ada penilaian KJPP</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* Timeline Program */}
      <Section title="Timeline Program">
        {timeline.length > 0 ? (
          <>
            <div className="mb-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-500">Progress</span>
                <span className="font-medium text-gray-700">{timelineProgress}%</span>
              </div>
              <Progress value={timelineProgress} className="h-2" />
            </div>
            <div className="space-y-1.5">
              {timeline.map(t => (
                <div key={t.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-600">{t.nama_tahapan}</span>
                  <span className="flex items-center gap-2">
                    {t.tgl_target && <span className="text-gray-400">{formatTanggal(t.tgl_target)}</span>}
                    <StatusBadge type="timeline" value={t.status} />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyMessage>Belum ada tahapan program</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* Prospek Mitra */}
      <Section title="Prospek Mitra">
        {prospek.length > 0 ? (
          <div className="space-y-2">
            {prospek.map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-medium text-gray-700">{p.nama_calon_mitra}</span>
                  {p.kontak_pic && <span className="text-gray-400 ml-1">· {p.kontak_pic}</span>}
                </div>
                <StatusBadge type="prospek" value={p.progress} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyMessage>Belum ada calon mitra</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* Kerja Sama */}
      <Section title="Kerja Sama">
        {kerjaSama ? (
          <>
            <InfoRow label="Mitra" value={kerjaSama.nama_mitra} bold />
            <InfoRow label="No. Perjanjian" value={kerjaSama.no_perjanjian ?? '-'} />
            <InfoRow label="Periode" value={`${formatTanggal(kerjaSama.tgl_mulai)} — ${formatTanggal(kerjaSama.tgl_selesai)}`} />
            <InfoRow label="Status" value={<StatusBadge type="ks" value={kerjaSama.status} />} />
            <InfoRow
              label="Sisa Hari"
              value={
                (() => {
                  const sisa = hitungSisaHari(kerjaSama.tgl_selesai)
                  return <span className={sisa < 90 ? 'text-amber-600 font-medium' : 'text-gray-600'}>{sisa} hari</span>
                })()
              }
            />
          </>
        ) : (
          <EmptyMessage>Aset belum dalam Kerja Sama</EmptyMessage>
        )}
      </Section>

      <Separator />

      {/* PBB */}
      <Section title="PBB">
        {pbbTerbaru ? (
          <>
            <InfoRow label="Tahun" value={String(pbbTerbaru.tahun)} />
            <InfoRow label="Nilai PBB" value={formatRupiah(pbbTerbaru.nilai_pbb)} />
            <InfoRow label="Status Bayar" value={<StatusBadge type="bayar" value={pbbTerbaru.status_bayar} />} />
            {pbbTerbaru.tgl_jatuh_tempo && (
              <InfoRow label="Jatuh Tempo" value={formatTanggal(pbbTerbaru.tgl_jatuh_tempo)} />
            )}
            {pbbTerbaru.pbb_objek && pbbTerbaru.pbb_objek.length > 0 && (
              <InfoRow label="Jumlah Objek" value={`${pbbTerbaru.pbb_objek.length} objek`} />
            )}
          </>
        ) : (
          <EmptyMessage>Belum ada data PBB</EmptyMessage>
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">{children}</div>
    </div>
  )
}

function InfoRow({ label, value, mono, highlight, bold }: {
  label: string
  value: React.ReactNode
  mono?: boolean
  highlight?: boolean
  bold?: boolean
}) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={`text-right ${mono ? 'font-mono' : ''} ${highlight ? 'text-[#117A65]' : 'text-gray-700'} ${bold ? 'font-semibold' : ''}`}>
        {value}
      </span>
    </>
  )
}

function EmptyMessage({ children }: { children: React.ReactNode }) {
  return <span className="text-gray-400 italic text-xs col-span-2">{children}</span>
}
