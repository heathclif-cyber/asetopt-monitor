import { useState } from 'react'
import JSZip from 'jszip'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import { KerjaSama, PBBProporsionalResult } from '@/types'

interface InvoicePBBDialogProps {
  open: boolean
  onClose: () => void
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
}

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function makeTableRow(tahun: number, nilai: string): string {
  return (
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="6033" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">Pajak Bumi dan Bangunan (PBB) Tahun ${tahun}</w:t></w:r>` +
    `</w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="3436" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>` +
    `<w:r><w:t>${escXml(nilai)}</w:t></w:r>` +
    `</w:p></w:tc></w:tr>`
  )
}

async function generateDocx(params: {
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
  nomorSurat: string
  tanggalSurat: string
  jabatanMitra: string
  alamatMitra: string
}): Promise<void> {
  const { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra } = params

  const namaAset   = escXml((ks.aset as any)?.nama_aset ?? '-')
  const alamatAset = escXml((ks.aset as any)?.alamat ?? '-')
  const total      = hasil.totalPBBDitanggung

  // 1. Fetch template docx
  const res = await fetch('/invoice/template_tagihan_pbb.docx')
  const arrayBuffer = await res.arrayBuffer()

  // 2. Unzip
  const zip = await JSZip.loadAsync(arrayBuffer)
  let xml = await zip.file('word/document.xml')!.async('string')

  // 3. Ganti tanggal surat ("Makassar, ..........")
  xml = xml.replace(
    '<w:t>..........</w:t>',
    `<w:t xml:space="preserve">${escXml(formatTanggal(tanggalSurat))}</w:t>`
  )

  // 4. Ganti nomor surat (setelah "Nomor : ", sebelum paragraf Lampiran paraId=79B8C05A)
  xml = xml.replace(
    '<w:tab/><w:t xml:space="preserve">: </w:t></w:r></w:p><w:p w14:paraId="79B8C05A"',
    `<w:tab/><w:t xml:space="preserve">: ${escXml(nomorSurat)}</w:t></w:r></w:p><w:p w14:paraId="79B8C05A"`
  )

  // 5. Ganti nama objek di perihal
  xml = xml.replace(
    '<w:t xml:space="preserve"> [Nama Objek Kerja Sama]</w:t>',
    `<w:t xml:space="preserve"> ${namaAset}</w:t>`
  )

  // 6. Ganti jabatan mitra (multi-run) — seluruh blok run "(Jabatan Pimpinan/kalau perorangan kosongi)"
  const jabatanRunsOld =
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>(</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD"><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Jabatan </w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Pimpinan</w:t></w:r>' +
    '<w:r w:rsidR="004B63D3"><w:rPr><w:b/><w:bCs/></w:rPr><w:t>/kalau perorangan kosongi</w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>)</w:t></w:r>'
  const jabatanRunsNew = jabatanMitra
    ? `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${escXml(jabatanMitra)}</w:t></w:r>`
    : ''
  xml = xml.replace(jabatanRunsOld, jabatanRunsNew)

  // 7. Ganti nama mitra
  xml = xml.replace(
    '<w:t>(Nama Mitra)</w:t>',
    `<w:t>${escXml(ks.nama_mitra)}</w:t>`
  )

  // 8. Ganti alamat mitra (multi-run)
  const alamatMitraRunsOld =
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>(Alamat</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD" w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> Mitra</w:t></w:r>' +
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(
    alamatMitraRunsOld,
    `<w:r><w:t>${escXml(alamatMitra)}</w:t></w:r>`
  )

  // 9. Ganti nomor perjanjian
  xml = xml.replace(
    '<w:t>(Nomor Perjanjian)</w:t>',
    `<w:t>${escXml(ks.no_perjanjian ?? '—')}</w:t>`
  )

  // 10. Ganti tanggal perjanjian
  xml = xml.replace(
    '<w:t>(Tanggal Perjanjian)</w:t>',
    `<w:t>${escXml(formatTanggal(ks.tgl_mulai))}</w:t>`
  )

  // 11. Ganti alamat aset
  xml = xml.replace(
    '<w:t>(Alamat aset yang dikerjasamakan)</w:t>',
    `<w:t>${alamatAset}</w:t>`
  )

  // 12. Ganti baris tabel PBB — hapus 2 baris template, masukkan baris dinamis
  // Baris data dimulai dari paraId="284F18C5", total row dimulai dari rsidR="4CC0BE62"
  const firstDataRowMarker = '<w:tr w:rsidR="00E00460" w:rsidRPr="004C052A" w14:paraId="284F18C5"'
  const totalRowMarker     = '<w:tr w:rsidR="4CC0BE62"'
  const idx1 = xml.indexOf(firstDataRowMarker)
  const idx2 = xml.indexOf(totalRowMarker)
  if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
    const before = xml.substring(0, idx1)
    const after  = xml.substring(idx2)
    const generatedRows = hasil.detail
      .map((r) => makeTableRow(r.tahun, formatRupiah(r.pbbProporsional)))
      .join('')
    xml = before + generatedRows + after
  }

  // 13. Ganti nilai total di baris Total
  xml = xml.replace(
    '<w:r><w:rPr><w:highlight w:val="yellow"/><w:lang w:val="id-ID"/></w:rPr><w:t>Rp</w:t></w:r>',
    `<w:r><w:t>${escXml(formatRupiah(total))}</w:t></w:r>`
  )

  // 14. Ganti "(Total PBB) (Terbilang)" — multi-run
  const totalTerbilangOld =
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">(Total PBB) </w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> (</w:t></w:r>' +
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Terbilang</w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(
    totalTerbilangOld,
    `<w:r><w:t xml:space="preserve">${escXml(formatRupiah(total))} (${escXml(terbilang(total))})</w:t></w:r>`
  )

  // 15. Simpan kembali dan download
  zip.file('word/document.xml', xml)
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = `Tagihan_PBB_${ks.nama_mitra.replace(/[^a-zA-Z0-9]/g, '_')}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function InvoicePBBDialog({ open, onClose, ks, hasil }: InvoicePBBDialogProps) {
  const today = new Date().toISOString().split('T')[0]
  const [nomorSurat, setNomorSurat]   = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(today)
  const [jabatanMitra, setJabatanMitra] = useState('')
  const [alamatMitra, setAlamatMitra]   = useState('')
  const [isLoading, setIsLoading]       = useState(false)

  const handleDownload = async () => {
    setIsLoading(true)
    try {
      await generateDocx({ ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra })
      onClose()
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Invoice Tagihan PBB</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Mitra</span>
              <span className="font-medium">{ks.nama_mitra}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Objek Aset</span>
              <span className="font-medium">{(ks.aset as any)?.nama_aset ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">No. PKS</span>
              <span className="font-medium font-mono">{ks.no_perjanjian ?? '—'}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-500">Total PBB Ditanggung</span>
              <span className="font-bold text-[#1B4F72]">{formatRupiah(hasil.totalPBBDitanggung)}</span>
            </div>
            {hasil.detail.map((r) => (
              <div key={r.tahun} className="flex justify-between pl-3 text-gray-500">
                <span>↳ Tahun {r.tahun}</span>
                <span>{formatRupiah(r.pbbProporsional)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nomor Surat</Label>
              <Input
                value={nomorSurat}
                onChange={(e) => setNomorSurat(e.target.value)}
                placeholder="Nomor/..."
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Tanggal Surat</Label>
              <Input
                type="date"
                value={tanggalSurat}
                onChange={(e) => setTanggalSurat(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">
              Jabatan Pimpinan Mitra{' '}
              <span className="text-gray-400 font-normal">(kosongkan jika perorangan)</span>
            </Label>
            <Input
              value={jabatanMitra}
              onChange={(e) => setJabatanMitra(e.target.value)}
              placeholder="Direktur Utama / Pimpinan..."
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">Alamat Mitra</Label>
            <Input
              value={alamatMitra}
              onChange={(e) => setAlamatMitra(e.target.value)}
              placeholder="Jl. ..."
              className="mt-1 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>Batal</Button>
          <Button className="bg-[#1B4F72] gap-1.5" onClick={handleDownload} disabled={isLoading}>
            <FileDown size={15} />
            {isLoading ? 'Memproses...' : 'Download .docx'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
