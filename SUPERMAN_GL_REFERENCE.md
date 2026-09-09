# Referensi Kode SAP/GL Superman — Jaminan vs Pendapatan

Catatan ini merangkum kode SAP/GL yang **benar-benar dipakai di Superman**, diambil dari
4 dokumen SPPb/SPPn asli (bukan hasil tebakan) di folder `contoh sppn-sppb/`:

1. `SPP contoh Jaminan Pelaksanaan 1.pdf` — setor + pengembalian jaminan pelaksanaan
2. `SPP contoh Jaminan Pelaksanaan 2.pdf` — setor jaminan pelaksanaan kerja sama sewa
3. `SPP Contoh Pembayaran Kompensasi dan PBB.pdf` — pendapatan sewa rutin + PPN + PBB + PPh Final
4. `SPP contoh Pembayaran Kompensasi, denda keterlambatan, pbb.pdf` — pendapatan sewa + denda + PBB + PPh Final

Acuan ini dipakai untuk memperbaiki/melengkapi `api/services/superman/komoditi_map.py` dan
`api/services/superman/payload.py` — **jangan pakai nilai default yang ada di kode sekarang
tanpa dicek**, karena beberapa terbukti tidak cocok dengan dokumen nyata (lihat tabel di bawah).

## Kode per jenis transaksi (dari dokumen nyata)

| Jenis Transaksi | Kategori | GL (SAP) | CC/PC | CF | RF Key | Sumber |
|---|---|---|---|---|---|---|
| Setor Jaminan Pelaksanaan (SPPn, uang masuk) | Jaminan | `11015204` | `8S00000001` | `A0102` | `A0102000` | Dok 1 (SPPn), Dok 2 |
| Pengembalian Jaminan Pelaksanaan (SPPb, uang keluar) | Jaminan | `11015204` | `8S00000001` | `A0201` | `A0201000` | Dok 1 (SPPb) |
| Penerimaan Sewa / Pendapatan Aset | Pendapatan | `11015204` | `8S00000001` | `A0102` | `A0102000` | Dok 3, Dok 4 |
| Penerimaan Denda Keterlambatan | Pendapatan | `11015204` | `8S00000001` | `A0102` | `A0102000` | Dok 4 |
| Penerimaan Kekurangan Sewa Proporsional | Pendapatan | `11015204` | `8S00000001` | `A0102` | `A0102000` | Dok 4 |
| PPN atas Penerimaan Sewa | Pajak | `21060008` | `8S00000001` | `A0102` | `A0102000` | Dok 3, Dok 4 |
| PPh Final atas Penerimaan Sewa (SPPb, ke KPP) | Pajak | `51100881` | `8S00KEU001` | `A0205` | `A0205000` | Dok 3, Dok 4 |
| Penerimaan Pembayaran PBB | PBB | `51100633` | `8S00000001` | `A0102` | `A0102000` | Dok 3, Dok 4 |

Profit Center di kolom "CC/PC"/"CF" pada cetakan SPP (`A0102`, `A0201`, `A0205`) adalah **hasil
pencarian** Superman berdasarkan nama unit ("Regional 8"), bukan kode yang diketik manual —
di kode, ini dikontrol lewat `PROFIT_CENTER_SEARCH` / `PROFIT_CENTER_PPN_SEARCH`
(`komoditi_map.py`), bukan `SUPERMAN_PROFIT_CENTER`/`SUPERMAN_PROFIT_CENTER_PPN` di `config.py`
yang tampaknya sudah tidak dipakai jalur aktifnya.

## Jaminan vs Pendapatan: bedanya BUKAN di GL

Dari 4 dokumen yang ada, **GL `11015204` dipakai untuk Jaminan Pelaksanaan maupun Pendapatan
sewa** — tidak ada GL terpisah untuk jaminan. Yang membedakan:

- **Arah transaksi**: SPPn (uang masuk) vs SPPb (uang keluar/pengembalian)
- **CF / RF Key**: `A0102000` untuk semua penerimaan (jaminan masuk *dan* pendapatan sewa),
  `A0201000` khusus untuk pengembalian jaminan lewat SPPb
- **Uraian teks bebas** ("Jaminan Pelaksanaan..." vs "Penerimaan Sewa...") murni deskriptif,
  tidak mempengaruhi routing SAP

**Implikasi untuk kode**: kalau nanti dibuat alur otomasi Superman untuk jaminan pelaksanaan
(setor maupun pengembalian), GL code yang dipakai tetap `11015204` — sama dengan
`GL_PENDAPATAN_ASET`, jangan dibuat konstanta terpisah. Yang perlu dibedakan adalah CF/RF key
sesuai arah dana, dan modul `komoditi_map.py`/`payload.py` saat ini **hanya menangani arah
"masuk" untuk kompensasi sewa** (`build_payload_from_kompensasi`) — belum ada jalur SPPb
pengembalian jaminan pelaksanaan.

## Selisih dengan default yang ada di kode sekarang

| Env var | Default di `komoditi_map.py` | Nilai nyata di dokumen Superman | Status |
|---|---|---|---|
| `SUPERMAN_GL_PENDAPATAN_ASET` | `41100030` | `11015204` | ⚠️ Beda — cek nilai aktual di Railway |
| `SUPERMAN_GL_PPN` | `21060008` | `21060008` | ✅ Cocok |
| `SUPERMAN_GL_PPH` | `11600000` | `51100881` | ⚠️ Beda — cek nilai aktual di Railway |
| PBB (`51100633`) | tidak ada env var, tidak diimplementasi | `51100633` (diisi manual di Superman) | ℹ️ Belum diotomasi di modul ini |

## Belum diverifikasi

- Nilai `SUPERMAN_GL_PENDAPATAN_ASET` / `SUPERMAN_GL_PPH` **aktual** di Railway (env var service
  `api`) — apakah sudah dioverride ke nilai yang benar (`11015204` / `51100881`) atau masih
  diam-diam pakai default kode yang salah (`41100030` / `11600000`) selama ini di production.
- Apakah SPP Jaminan Pelaksanaan pernah dibuat lewat aplikasi ini atau selalu manual langsung di
  Superman — `services/superman/` saat ini tidak punya fungsi setara `build_payload_from_kompensasi()`
  untuk jaminan pelaksanaan.
