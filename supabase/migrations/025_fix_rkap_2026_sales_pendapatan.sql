-- Koreksi target Pendapatan hasil impor 024.
-- Pada sumber Sales, target Pendapatan identik dengan Cash In untuk seluruh
-- proker kecuali Lahan Tinanggea (Jalan Tambang).

UPDATE rkap_target
SET
  pendapatan_total = total,
  pendapatan_jan = jan, pendapatan_feb = feb, pendapatan_mar = mar,
  pendapatan_apr = apr, pendapatan_mei = mei, pendapatan_jun = jun,
  pendapatan_jul = jul, pendapatan_agu = agu, pendapatan_sep = sep,
  pendapatan_okt = okt, pendapatan_nov = nov, pendapatan_des = des,
  updated_at = NOW()
WHERE tahun = 2026 AND no BETWEEN 1 AND 23;

UPDATE rkap_target
SET
  pendapatan_total = 32000000,
  pendapatan_jan = 0, pendapatan_feb = 32000000,
  pendapatan_mar = 0, pendapatan_apr = 0, pendapatan_mei = 0, pendapatan_jun = 0,
  pendapatan_jul = 0, pendapatan_agu = 0, pendapatan_sep = 0,
  pendapatan_okt = 0, pendapatan_nov = 0, pendapatan_des = 0,
  updated_at = NOW()
WHERE tahun = 2026 AND kode = 'R800031-0026';
