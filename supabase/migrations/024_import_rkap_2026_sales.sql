-- Sumber otoritatif: Regional 8-Format Distribusi RKAP 2026 - Sales.xlsx
-- Sheet: Optimalisasi Aset. Nilai dalam Rupiah penuh.
-- Kolom RKAP eksisting = Cash In; target Pendapatan disimpan terpisah.

ALTER TABLE rkap_target
  ADD COLUMN IF NOT EXISTS pendapatan_total BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_jan BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_feb BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_mar BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_apr BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_mei BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_jun BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_jul BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_agu BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_sep BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_okt BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_nov BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pendapatan_des BIGINT DEFAULT 0;

WITH sumber(no, kode, nama, total, jan, feb, mar, apr, mei, jun, jul, agu, sep, okt, nov, des, pendapatan_total, pendapatan_jan, pendapatan_feb, pendapatan_mar, pendapatan_apr, pendapatan_mei, pendapatan_jun, pendapatan_jul, pendapatan_agu, pendapatan_sep, pendapatan_okt, pendapatan_nov, pendapatan_des) AS (
  VALUES
    (1, 'R800027-0015', 'Aset Pabrik Gula (Non Spinoff pembentukan SGN)', 4523144404::BIGINT, 0, 0, 0, 0, 0, 0, 4523144404::BIGINT, 0, 0, 0, 0, 0, 4523144404::BIGINT, 0, 0, 0, 0, 0, 0, 4523144404::BIGINT, 0, 0, 0, 0, 0),
    (2, 'R800038-0029', 'Lahan Takalar - Gapoktan', 600000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 600000000, 0, 600000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 600000000, 0),
    (3, 'R800009-0031', 'Lahan Tinanggea (Stockpile)', 406000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 406000000, 0, 406000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 406000000, 0),
    (4, 'R800031-0026', 'Lahan Tinanggea (Jalan Tambang)', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 32000000, 0, 32000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    (5, 'R800001-0002', 'Bangunan Jalan Boulevard Makassar', 585000000, 0, 0, 0, 0, 0, 0, 585000000, 0, 0, 0, 0, 0, 585000000, 0, 0, 0, 0, 0, 0, 585000000, 0, 0, 0, 0, 0),
    (6, 'R800021-0016', 'Lahan Sidrap', 300000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300000000, 300000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 300000000),
    (7, 'R800011-0017', 'Lahan Jalan Alauddin Makassar', 275000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 275000000, 275000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 275000000),
    (8, 'R800012-0018', 'Lahan Kebun Marinsow', 275000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 275000000, 275000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 275000000),
    (9, 'R800013-0019', 'Lahan Jalan Masjid Raya dan Jalan Kangkung Makassar', 294000000, 0, 0, 0, 0, 0, 147000000, 0, 0, 0, 0, 0, 147000000, 294000000, 0, 0, 0, 0, 0, 147000000, 0, 0, 0, 0, 0, 147000000),
    (10, 'R800002-0032', 'Bangunan Jalan Slamet Riyadi Makassar', 395800000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 395800000, 395800000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 395800000),
    (11, 'R800014-0020', 'Lahan Jalan Biru Bone', 108000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108000000, 108000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 108000000),
    (12, 'R800015-0012', 'Bangunan Mess Jalan Masjid Raya Makassar', 370000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 370000000, 370000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 370000000),
    (13, 'R800039-0033', 'Lahan Desa Galung', 100000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100000000, 100000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100000000),
    (14, 'R800019-0023', 'Lahan Jalan Kemakmuran dan Samudra Soppeng', 50000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50000000, 50000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 50000000),
    (15, 'R800003-0004', 'Bangunan Ruko Jalan Pengayoman Makassar', 90000000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 90000000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000, 7500000),
    (16, 'R800017-0025', 'Bangunan Eks LO Ambon', 75000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75000000, 75000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 75000000),
    (17, 'R800006-0007', 'Lahan Eks Pabrik Kapas Jeneponto - Mini Soccer', 25500000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25500000, 25500000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25500000),
    (18, 'R800033-0028', 'Lahan Eks Pabrik Kapas Jeneponto - Studio Foto', 14500000, 0, 0, 0, 0, 0, 7250000, 0, 0, 0, 0, 0, 7250000, 14500000, 0, 0, 0, 0, 0, 7250000, 0, 0, 0, 0, 0, 7250000),
    (19, 'R800010-0010', 'Lahan Eks Pabrik Kapas Jeneponto - Papan Iklan', 2100000, 0, 2100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2100000, 0, 2100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    (20, 'R800042-0036', 'Bangunan Kantor Direksi - Gedung Timur', 47000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 47000000, 47000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 47000000),
    (21, 'R800032-0027', 'Bangunan Kantor Direksi - Kantor Pelayanan 13 Dapenbun', 24000000, 0, 0, 0, 0, 0, 0, 24000000, 0, 0, 0, 0, 0, 24000000, 0, 0, 0, 0, 0, 0, 24000000, 0, 0, 0, 0, 0),
    (22, 'R800005-0006', 'Bangunan Jalan Bambapuang Makassar', 27000000, 0, 27000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 27000000, 0, 27000000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
    (23, 'R800007-0008', 'Lahan Unit Kabaru', 259090650, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 259090650, 259090650, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 259090650)
)
UPDATE rkap_target t
SET
  no = s.no, nama = s.nama, total = s.total,
  jan = s.jan, feb = s.feb, mar = s.mar, apr = s.apr, mei = s.mei, jun = s.jun,
  jul = s.jul, agu = s.agu, sep = s.sep, okt = s.okt, nov = s.nov, des = s.des,
  pendapatan_total = s.pendapatan_total,
  pendapatan_jan = s.pendapatan_jan, pendapatan_feb = s.pendapatan_feb,
  pendapatan_mar = s.pendapatan_mar, pendapatan_apr = s.pendapatan_apr,
  pendapatan_mei = s.pendapatan_mei, pendapatan_jun = s.pendapatan_jun,
  pendapatan_jul = s.pendapatan_jul, pendapatan_agu = s.pendapatan_agu,
  pendapatan_sep = s.pendapatan_sep, pendapatan_okt = s.pendapatan_okt,
  pendapatan_nov = s.pendapatan_nov, pendapatan_des = s.pendapatan_des,
  updated_at = NOW()
FROM sumber s
WHERE t.tahun = 2026 AND t.kode = s.kode;
