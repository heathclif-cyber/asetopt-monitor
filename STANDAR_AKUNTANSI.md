# Standar Istilah & Angka Keuangan — AsetOpt Monitor

Dokumen ini **wajib** diikuti untuk semua UI, Excel, dan perhitungan di aplikasi.  
Tujuan: satu bahasa, selaras praktik akuntansi sewa/optimalisasi aset (akrual vs kas).

---

## 1. Istilah resmi (wajib)

| Istilah | Arti | Formula di sistem | Bukan |
|---------|------|-------------------|--------|
| **Nominal (DPP)** | Dasar sewa / kompensasi sebelum pajak | `kompensasi.nominal` | Bukan total invoice |
| **Pendapatan** | Pengakuan pendapatan (basis **akrual**) | `nominal` per tagihan di periode JT; jika ada jadwal PSAK 73 diakui, boleh pakai nilai pengakuan (sama DPP) | Bukan uang masuk; bukan total tagihan ber-PPN |
| **Tagihan** | Jumlah yang ditagihkan ke mitra | `total_tagihan − pengurang` (= DPP + PPN − PPH* − pengurang) | Bukan pendapatan; bukan cash in |
| **Cash In** | Uang masuk kas/bank | Σ `pembayaran.nominal_bayar` (+ `cash_in` denda/lainnya bila relevan) | Bukan DPP + pajak di kertas tagihan |
| **Sisa / Piutang** | Outstanding collection | `Tagihan − Cash In` (kumulatif s.d. tanggal acuan) | Bukan pendapatan |
| **Target RKAP** | Target anggaran | `rkap_target` per proker / bulan | — |
| **Capaian** | Realisasi vs target | Default: **Cash In ÷ Target RKAP** (basis kas). Mode PSAK: **Pendapatan ÷ Target RKAP** | Jangan campur basis tanpa label |

\*) PPH mengurangi tagihan hanya jika `pph_mode = bukti_potong`.

### Label UI yang diizinkan

- **Pendapatan** (jangan: “Pokok”, “Pendapatan Akrual”, “DPP” di label user-facing kecuali footnote singkat)
- **Tagihan** (jangan: “Total Tagihan” berlebihan — cukup **Tagihan**)
- **Cash In** (jangan: “Realisasi Cash In”, “Jumlah + pajak”)
- **Sisa** / **Piutang** sesuai konteks halaman
- **Target RKAP**, **Capaian**

### Label yang dilarang

- Pokok, Total s.d. pajak, Jumlah + PPN + PPH + PBB sebagai pengganti Cash In
- Mencampur “pendapatan” dengan angka yang sudah termasuk PPN tanpa menjelaskan
- Menampilkan dua metrik sama dengan nama berbeda

---

## 2. Dua basis (jangan dicampur diam-diam)

| Basis | Dipakai untuk | Acuan waktu |
|-------|----------------|-------------|
| **Akrual (Pendapatan)** | Pengakuan pendapatan, laporan pendapatan | Tanggal **jatuh tempo** tagihan / periode pengakuan PSAK 73 |
| **Kas (Cash In)** | Uang masuk, capaian kas vs RKAP cash | Tanggal **bayar** (`tgl_bayar` / `tgl_terima`) |

Filter UI harus menyebut basis secara jelas:
- “Filter by jatuh tempo” → memengaruhi set tagihan & pendapatan
- “Filter by tanggal bayar” → memengaruhi set cash in (Detail Tagihan mode diterima)

---

## 3. Aturan per tampilan

### 3.1 Laporan Pendapatan — Detail Tagihan

Satu baris = satu tahap kompensasi.

| Kolom | Isi |
|-------|-----|
| Tagihan | `total_tagihan − pengurang` |
| Cash In | Σ pembayaran (sesuai basis filter JT vs diterima) |
| Pendapatan | `nominal` (atau nilai akrual PSAK jika ada, tetap setara DPP) |
| Sisa | `Tagihan − total bayar kumulatif` |

Ringkasan kartu: **Tagihan · Cash In · Sisa · Pendapatan** (bukan angka aneh lain).

### 3.2 Laporan Pendapatan — Per Proker

Satu baris = satu **ID Monika**.

| Kolom | Isi |
|-------|-----|
| Target RKAP | `rkap_target.total` tahun aktif |
| Pendapatan | Σ `nominal` tagihan JT di tahun (atau YTD) |
| Cash In | Σ bayar pada tagihan JT di window yang sama |
| Capaian | Cash In ÷ Target RKAP |

- Tanpa ID Monika → **tidak** masuk Per Proker (tetap bisa di Detail).
- Pendapatan **bukan** sama dengan Tagihan (Tagihan termasuk PPN).

### 3.3 Laporan Format HO

| Kolom | Isi |
|-------|-----|
| Pendapatan | Σ `nominal` di periode (bulan / Jan s.d. bulan) by JT |
| Cash In | Σ pembayaran by **tgl bayar** di periode (alokasi komponen internal; total ≈ uang masuk) |
| No Billing | Hanya `no_billing_sap`; kosong jika kosong |
| Capaian | Cash In ÷ Target RKAP |
| Piutang | Snapshot sisa outstanding akhir bulan acuan |

Periode selalu disebut jelas, contoh: **Pendapatan Januari s.d. Juli 2026**.

### 3.4 RKAP Monitor

- Mode **Cash In**: realisasi = cash in per bulan; capaian vs target cash.
- Mode **Pendapatan (PSAK 73)**: realisasi = pengakuan akrual; capaian vs target pendapatan.
- Jangan menukar basis tanpa ganti label mode.

### 3.5 Piutang / Collection

- Hanya sisa > 0 dan (invoice terbit atau sudah JT).
- Kolom nilai: **Tagihan**, **Dibayar**, **Sisa**, aging — bukan “pendapatan”.

### 3.6 Monitoring Kompensasi

- **Tagihan**, **Cash In**, **Sisa**, denda — konsisten definisi di atas.

---

## 4. Hierarki angka (cek sanity)

```
Nominal (DPP)
    ↓ (+PPN −PPH* −pengurang)
Tagihan
    ↓ (− Cash In kumulatif)
Sisa / Piutang

Pendapatan  ≈  Nominal (akrual)     ≠  Tagihan
Cash In     =  uang masuk           ≠  Pendapatan
```

Jika user membandingkan **Σ Tagihan (Detail)** dengan **Σ Pendapatan (Per Proker)** → hasil **boleh beda** (pajak + filter Monika + bulan).  
Jika membandingkan **Σ Pendapatan (Detail)** dengan **Σ Pendapatan (Per Proker)** pada filter setara → harus **mendekati sama** (selisih hanya baris tanpa Monika / YTD).

---

## 5. Implementasi kode

| File | Peran |
|------|--------|
| `src/utils/accountingTerms.ts` | Label resmi + helper hitung Tagihan / Pendapatan / Cash In |
| `src/utils/laporanProgramUtils.ts` | Per Proker (Pendapatan = nominal, Cash In = bayar) |
| `src/utils/laporanHOUtils.ts` | HO: Pendapatan akrual; Cash In dari pembayaran |
| `STANDAR_AKUNTANSI.md` | Dokumen ini |

Saat menambah kolom keuangan baru: **baca dokumen ini dulu**, pakai label dari `accountingTerms.ts`, jangan ciptakan sinonim.

---

## 6. Checklist PR / fitur baru

- [ ] Label user-facing hanya dari daftar §1  
- [ ] Basis akrual vs kas disebut di UI jika filter memengaruhi keduanya  
- [ ] Periode disebut lengkap (“s.d. Juli 2026”, bukan “YTD” saja di tempat krusial)  
- [ ] Excel memakai satuan yang dijelaskan (Rp penuh atau Rp 000)  
- [ ] Tidak menamai “Cash In” untuk angka yang bukan uang masuk  

---

*Revisi: selaras standarisasi AsetOpt Monitor — Manajemen Aset PTPN I Regional 8.*
