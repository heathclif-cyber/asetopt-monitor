-- Sumber prognosis evaluasi: Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx
-- Sheet: Opset Cash per Proker dan Opset Pendapatan per Proker.
-- Ini sengaja dipisahkan dari rkap_target: target resmi tetap berasal dari
-- Regional 8-Format Distribusi RKAP 2026 - Sales.xlsx.

CREATE TABLE IF NOT EXISTS rkap_prognosa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tahun INTEGER NOT NULL,
  kode VARCHAR(50) NOT NULL,
  nama VARCHAR(255) NOT NULL,
  cash_jul BIGINT NOT NULL DEFAULT 0, cash_agu BIGINT NOT NULL DEFAULT 0,
  cash_sep BIGINT NOT NULL DEFAULT 0, cash_okt BIGINT NOT NULL DEFAULT 0,
  cash_nov BIGINT NOT NULL DEFAULT 0, cash_des BIGINT NOT NULL DEFAULT 0,
  pendapatan_jul BIGINT NOT NULL DEFAULT 0, pendapatan_agu BIGINT NOT NULL DEFAULT 0,
  pendapatan_sep BIGINT NOT NULL DEFAULT 0, pendapatan_okt BIGINT NOT NULL DEFAULT 0,
  pendapatan_nov BIGINT NOT NULL DEFAULT 0, pendapatan_des BIGINT NOT NULL DEFAULT 0,
  sumber TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tahun, kode)
);

-- Aplikasi self-hosted memakai API internal (bukan peran Supabase `anon`).

INSERT INTO rkap_prognosa (tahun, kode, nama, cash_jul, cash_agu, cash_sep, cash_okt, cash_nov, cash_des, pendapatan_jul, pendapatan_agu, pendapatan_sep, pendapatan_okt, pendapatan_nov, pendapatan_des, sumber)
VALUES
  (2026,'R800027-0015','Aset Pabrik Gula (Non Spinoff pembentukan SGN)',0,0,0,0,0,3874000000,0,0,0,0,0,2215934926,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800038-0029','Lahan Takalar - Gapoktan',0,0,0,0,0,1500000000,0,0,0,0,0,1500000000,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800013-0019','Lahan Jalan Masjid Raya dan Jalan Kangkung Makassar',0,147000000,0,0,0,0,0,147000000,0,0,0,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800002-0032','Bangunan Jalan Slamet Riyadi Makassar',0,152000000,0,176000000,0,0,0,0,0,0,395800000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800015-0012','Bangunan Mess Jalan Masjid Raya Makassar',0,0,0,0,0,370000000,0,0,0,0,370000000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800039-0033','Lahan Desa Galung',32000000,0,0,0,0,0,0,0,0,0,16000000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800003-0004','Bangunan Ruko Jalan Pengayoman Makassar',8750000,8750000,8750000,8750000,8750000,8750000,7500000,7500000,7500000,7500000,7500000,7500000,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800006-0007','Lahan Eks Pabrik Kapas Jeneponto - Mini Soccer',0,0,0,0,0,25500000,0,0,0,0,25500000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800033-0028','Lahan Eks Pabrik Kapas Jeneponto - Studio Foto',0,0,0,0,0,7250000,0,7250000,0,0,0,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800042-0036','Bangunan Kantor Direksi - Gedung Timur',0,0,0,0,0,100000000,0,0,0,0,100000000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800032-0027','Bangunan Kantor Direksi - Kantor Pelayanan 13 Dapenbun',24000000,0,0,0,0,0,26460000,0,0,0,0,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'),
  (2026,'R800026-0014','Cafe','0','0','0','0',17760000,0,0,0,0,0,17760000,0,'Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx')
ON CONFLICT (tahun, kode) DO UPDATE SET
  nama = EXCLUDED.nama,
  cash_jul = EXCLUDED.cash_jul, cash_agu = EXCLUDED.cash_agu, cash_sep = EXCLUDED.cash_sep, cash_okt = EXCLUDED.cash_okt, cash_nov = EXCLUDED.cash_nov, cash_des = EXCLUDED.cash_des,
  pendapatan_jul = EXCLUDED.pendapatan_jul, pendapatan_agu = EXCLUDED.pendapatan_agu, pendapatan_sep = EXCLUDED.pendapatan_sep, pendapatan_okt = EXCLUDED.pendapatan_okt, pendapatan_nov = EXCLUDED.pendapatan_nov, pendapatan_des = EXCLUDED.pendapatan_des,
  sumber = EXCLUDED.sumber, updated_at = NOW();
