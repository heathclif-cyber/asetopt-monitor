import { useEffect, useMemo } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { Kompensasi, SuratPeringatan } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { formatTanggal, hitungSisaHari, formatRupiah } from '@/lib/utils'
import { buatPesanWA, getSPEligibility } from '@/utils/notifikasiUtils'
import { MessageSquare, FileWarning, CheckCircle, Trash2, Bot } from 'lucide-react'

export function NotifikasiSP() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const {
    jatuhTempoH14, spAktif, allSP, logNotifikasi,
    checkJatuhTempo, fetchSPAktif, fetchLog, fetchAllSP,
    terbitkanSP, kirimNotifWA, deleteSP,
  } = useNotifikasiStore()

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchAllKompensasi(), fetchKS(), fetchSPAktif(), fetchLog(), fetchAllSP()])
    }
    load()
  }, [])

  useEffect(() => { checkJatuhTempo(allKompensasi) }, [allKompensasi])

  const autoSPList = useMemo(() => daftarKS.map(ks => ({
    ks_id: ks.id, namaMitra: ks.nama_mitra, namaAset: ks.aset?.nama_aset ?? '-',
    ...getSPEligibility(allKompensasi.filter(k => k.ks_id === ks.id), allSP.filter(sp => sp.ks_id === ks.id)),
  })).filter(item => item.eligible && item.jenis), [allKompensasi, daftarKS, allSP])

  const issueSP = async (ksId: string) => {
    const eligibility = getSPEligibility(allKompensasi.filter(k => k.ks_id === ksId), allSP.filter(sp => sp.ks_id === ksId))
    if (!eligibility.eligible || !eligibility.jenis) { alert(eligibility.alasan); return }
    if (!confirm(`Terbitkan ${eligibility.jenis} untuk kerja sama ini?`)) return
    try {
      await terbitkanSP(ksId, eligibility.kompensasiId, eligibility.jenis)
      await fetchKS()
    } catch (error) { alert(error instanceof Error ? error.message : 'Gagal menerbitkan SP.') }
  }

  const handleKirimWA = async (k: Kompensasi, jenis: string) => {
    const ks = daftarKS.find(x => x.id === k.ks_id)
    if (!ks?.no_wa_mitra) { alert('No. WA mitra belum diisi'); return }
    const pesan = buatPesanWA({
      namaAset: (ks.aset as any)?.nama_aset ?? '',
      namaMitra: ks.nama_mitra,
      nominal: k.total_tagihan,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      jenisPesan: jenis,
    })
    const ok = await kirimNotifWA({ noWA: ks.no_wa_mitra, pesan, ksId: ks.id, jenis })
    alert(ok ? 'WA terkirim!' : 'Gagal kirim WA')
  }

  const handleKirimSemua = async () => {
    for (const k of jatuhTempoH14) {
      const ks = daftarKS.find(x => x.id === k.ks_id)
      if (ks?.no_wa_mitra) await handleKirimWA(k, 'jatuh_tempo_h14')
    }
    alert('Selesai mengirim semua notifikasi')
  }

  const handleDeleteSP = async (sp: SuratPeringatan) => {
    const mitra = (sp.kerja_sama as any)?.nama_mitra ?? 'ini'
    if (confirm(`Hapus ${sp.jenis} untuk ${mitra}? Data tidak dapat dikembalikan.`)) {
      try { await deleteSP(sp.id); await fetchKS() }
      catch (error) { alert(error instanceof Error ? error.message : 'Gagal menghapus SP.') }
    }
  }

  const getSPBadgeVariant = (jenis: string) =>
    ({ SP1: 'sp1', SP2: 'sp2', SP3: 'sp3', PUTUS: 'putus' }[jenis] ?? 'secondary')

  const levelColor = (level: string) => ({
    SP1: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    SP2: 'bg-orange-100 text-orange-800 border-orange-300',
    SP3: 'bg-red-100 text-red-800 border-red-300',
    PUTUS: 'bg-gray-900 text-white border-gray-700',
  }[level] ?? '')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifikasi & Surat Peringatan</h1>
        <p className="text-sm text-gray-500">Monitoring jatuh tempo, SP aktif, status otomatis, dan histori notifikasi WA</p>
      </div>

      <Tabs defaultValue="jatuh_tempo">
        <TabsList>
          <TabsTrigger value="jatuh_tempo" className="relative">
            Akan Jatuh Tempo
            {jatuhTempoH14.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{jatuhTempoH14.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sp_auto" className="relative">
            <Bot size={13} className="mr-1" />
            Status SP Otomatis
            {autoSPList.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{autoSPList.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sp_aktif">
            SP Aktif
            {spAktif.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{spAktif.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="histori_sp">Histori SP</TabsTrigger>
          <TabsTrigger value="histori">Histori Notifikasi</TabsTrigger>
        </TabsList>

        {/* Tab Jatuh Tempo */}
        <TabsContent value="jatuh_tempo" className="mt-4">
          {jatuhTempoH14.length > 0 && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={handleKirimSemua} className="bg-green-700">
                <MessageSquare size={14} /> Kirim Semua WA
              </Button>
            </div>
          )}
          {jatuhTempoH14.length === 0 ? (
            <EmptyState title="Tidak ada jatuh tempo dalam 14 hari" description="Semua kompensasi masih dalam batas aman." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-left px-4 py-3">Periode</th>
                    <th className="text-right px-4 py-3">Total Tagihan</th>
                    <th className="text-left px-4 py-3">Jatuh Tempo</th>
                    <th className="text-right px-4 py-3">Sisa Hari</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jatuhTempoH14.map(k => {
                    const ks = daftarKS.find(x => x.id === k.ks_id)
                    const sisa = hitungSisaHari(k.tgl_jatuh_tempo)
                    return (
                      <tr key={k.id} className={`hover:bg-gray-50 ${sisa <= 3 ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{ks?.nama_mitra ?? '-'}</div>
                          <div className="text-xs text-gray-500">{(ks?.aset as any)?.nama_aset ?? '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{k.periode_label ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold"><CurrencyDisplay value={k.total_tagihan} size="sm" /></td>
                        <td className="px-4 py-3">{formatTanggal(k.tgl_jatuh_tempo)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${sisa <= 3 ? 'text-red-600' : sisa <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {sisa} hari
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => handleKirimWA(k, 'jatuh_tempo_h14')}>
                            <MessageSquare size={13} /> Kirim WA
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Status SP Otomatis */}
        <TabsContent value="sp_auto" className="mt-4">
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <strong>Keterangan:</strong> SP1 dapat diterbitkan saat akumulasi denda mencapai 5% sesuai tarif tagihan, dihitung sejak H+1 jatuh tempo.
            Tahap berikutnya mengikuti deadline dan minimal 14 hari sejak SP sebelumnya benar-benar diterbitkan.
          </div>
          {autoSPList.length === 0 ? (
            <EmptyState title="Tidak ada KS yang memerlukan SP" description="Semua kompensasi masih dalam batas toleransi." />
          ) : (
            <div className="space-y-3">
              {autoSPList.map(item => (
                <div key={item.ks_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-orange-50 p-4">
                  <div><p className="font-semibold text-gray-900">{item.namaMitra} <span className={`ml-2 rounded-full border px-2 py-0.5 text-xs ${levelColor(item.jenis!)}`}>{item.jenis}</span></p><p className="mt-1 text-xs text-gray-500">{item.namaAset}</p><p className="mt-2 text-sm">Layak diterbitkan sejak {formatTanggal(item.tglLayak!.toLocaleDateString('en-CA'))} · Sisa {formatRupiah(item.totalSisa)}</p></div>
                  <Button size="sm" variant="outline" onClick={() => issueSP(item.ks_id)}><FileWarning size={13} /> Terbitkan {item.jenis}</Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab SP Aktif */}
        <TabsContent value="sp_aktif" className="mt-4">
          {spAktif.length === 0 ? (
            <EmptyState title="Tidak ada SP aktif" description="Tidak ada surat peringatan aktif saat ini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-center px-4 py-3">Jenis SP</th>
                    <th className="text-left px-4 py-3">Terbit</th>
                    <th className="text-left px-4 py-3">Deadline</th>
                    <th className="text-right px-4 py-3">Sisa Hari</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {spAktif.map(sp => {
                    const sisa = hitungSisaHari(sp.tgl_deadline)
                    return (
                      <tr key={sp.id} className={`hover:bg-gray-50 ${sisa <= 3 ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{(sp.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                          <div className="text-xs text-gray-500">{(sp.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={getSPBadgeVariant(sp.jenis) as any}>{sp.jenis}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_terbit)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_deadline)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${sisa <= 3 ? 'text-red-600' : sisa <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {sisa > 0 ? `${sisa} hari` : 'Terlewat'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {sp.jenis !== 'SP3' && sp.jenis !== 'PUTUS' && (
                              <Button size="sm" variant="outline" className="text-orange-700 border-orange-300" disabled={!getSPEligibility(allKompensasi.filter(k => k.ks_id === sp.ks_id), allSP.filter(item => item.ks_id === sp.ks_id)).eligible} onClick={() => issueSP(sp.ks_id)}>
                                <FileWarning size={13} /> SP Berikutnya
                              </Button>
                            )}
                            {sp.jenis === 'SP3' && (
                              <Button size="sm" variant="outline" className="text-red-700 border-red-300" disabled={!getSPEligibility(allKompensasi.filter(k => k.ks_id === sp.ks_id), allSP.filter(item => item.ks_id === sp.ks_id)).eligible} onClick={() => issueSP(sp.ks_id)}>
                                Lakukan Pemutusan
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-300" onClick={() => handleDeleteSP(sp)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Histori SP */}
        <TabsContent value="histori_sp" className="mt-4">
          {allSP.length === 0 ? (
            <EmptyState title="Belum ada histori SP" description="Semua surat peringatan yang pernah diterbitkan akan muncul di sini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-center px-4 py-3">Jenis</th>
                    <th className="text-left px-4 py-3">Terbit</th>
                    <th className="text-left px-4 py-3">Deadline</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allSP.map(sp => (
                    <tr key={sp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{(sp.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                        <div className="text-xs text-gray-500">{(sp.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getSPBadgeVariant(sp.jenis) as any}>{sp.jenis}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_terbit)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_deadline)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sp.status === 'aktif' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {sp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm" variant="outline"
                          className="text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-300"
                          onClick={() => handleDeleteSP(sp)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Histori Notifikasi WA */}
        <TabsContent value="histori" className="mt-4">
          {logNotifikasi.length === 0 ? (
            <EmptyState title="Belum ada histori notifikasi" description="Log notifikasi WA yang dikirim akan muncul di sini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Tanggal Kirim</th>
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-left px-4 py-3">Jenis</th>
                    <th className="text-left px-4 py-3">No. WA</th>
                    <th className="text-center px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logNotifikasi.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(log.tgl_kirim)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{(log.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                        <div className="text-xs text-gray-500">{(log.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.jenis ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{log.no_wa ?? '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {log.status_kirim === 'terkirim'
                          ? <Badge variant="success"><CheckCircle size={11} className="mr-1" /> Terkirim</Badge>
                          : <Badge variant="destructive">Gagal</Badge>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
