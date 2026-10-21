# Perbandingan reliabilitas Superman — 12 Oktober 2026

Referensi: checkout lokal Monitoringpemasaran `f608f2c`; baseline AsetOpt
`f228562`. Standar `docs/platform` Pemasaran dan `LAYER_ZERO.md` dibaca sebelum
perubahan. Perbandingan ini berupa tinjauan implementasi dan uji regresi
terisolasi, bukan pengukuran kecepatan atau tingkat keberhasilan portal produksi.

| Area | Referensi Pemasaran | Temuan dan perbaikan AsetOpt |
| --- | --- | --- |
| Pengambilan nomor | `services/superman/runner.py::_coalesce_spp_numbers` mengutamakan respons store | To Do sebelumnya dapat menimpa nomor hasil simpan; sekarang respons store diutamakan, To Do hanya melengkapi |
| Hasil gagal | `services/superman/progress.py::complete_job` mencatat `ok=false` secara khusus | Hasil gagal sebelumnya tetap dianggap selesai/sukses; sekarang berstatus gagal dan tidak menyimpan nomor dari hasil gagal |
| Jalur agent | Pemasaran berbasis invoice; AsetOpt memiliki SPPn/SPPb bertahap | Bundle AsetOpt sebelumnya selalu memakai builder gabungan dan menolak seluruh kompensasi setelah SPPn ada; sekarang memakai pemilihan payload yang sama dengan server dan memilih form SPPb ketika diperlukan |
| Persistensi | Pemasaran menyimpan referensi pada invoice | AsetOpt harus menyimpan referensi per jenis: agent/recovery kini mengisi `sppn_no`, `sppb_pph_no`, waktu pembuatan, serta label pembayaran dalam satu transaksi dan mempertahankan nomor jenis lain |
| Tujuan agent | URL milik masing-masing aplikasi | Default launcher AsetOpt masih menunjuk Pemasaran; sekarang URL AsetOpt wajib dikonfigurasi melalui `--api`/environment atau prompt launcher |
| Pelacakan job | Pemasaran mempunyai persistensi job dan pencatatan error | AsetOpt masih menggunakan memori proses. Perbaikan UI menghentikan reset polling akibat callback parent berubah dan mengabaikan respons polling yang sudah dibatalkan |

Pengambilan nomor dari seluruh HTML halaman dihapus dari alur pembuatan AsetOpt:
halaman daftar dapat memuat nomor transaksi lain. Nomor yang belum ditemukan
tetap diarahkan ke pemulihan melalui To Do List.

## Verifikasi

Empat regresi dijalankan pada kode baseline AsetOpt dan semuanya gagal:
penyimpanan bertahap, bundle SPPb setelah SPPn, hasil agent gagal, dan prioritas
nomor store terhadap To Do. Setelah perubahan, seluruh tujuh uji offline lulus,
termasuk pemilihan tiga jenis payload, pemilihan form SPPb agent, dan prioritas
nomor dalam body respons store.

```bash
PYTHONPATH=api python -m unittest discover -s api/tests -v
npm run build
```

Build TypeScript/Vite lulus. `npm run lint` terhalang konfigurasi proyek:
ESLint 9 tidak menemukan `eslint.config.js/mjs/cjs`. Tidak ada perubahan pada
aturan bisnis nominal, master GL/customer, atau API Layer Zero.

## Batas hasil

Belum diuji pengiriman langsung ke portal Superman, captcha, jaringan produksi,
atau unggahan nyata. Tidak ada transaksi produksi yang dibuat dan belum ada
deploy. Tidak ada klaim peningkatan latency atau persentase sukses produksi.
Job masih tersimpan di memori proses: restart/multi-replica tetap merupakan
batasan. Data nomor lama yang hanya terisi pada label `superman` tidak dibackfill
oleh perubahan ini. Agent di PC perlu diperbarui bersama backend agar pemilihan
form SPPb berlaku; set URL API instalasi AsetOpt sebelum menjalankannya.
