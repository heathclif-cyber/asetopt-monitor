-- Seed 23 aset target RKAP 2026 ke tabel aset
-- ON CONFLICT DO NOTHING agar aman dijalankan berkali-kali
INSERT INTO aset (kode_aset, nama_aset, status) VALUES
  ('R800027-0015', 'Aset Pabrik Gula (Non Spinoff SGN)',       'pipeline'),
  ('R800038-0029', 'Lahan Takalar - Gapoktan',                 'pipeline'),
  ('R800009-0031', 'Lahan Tinanggea (Stockpile)',               'pipeline'),
  ('R800031-0026', 'Lahan Tinanggea (Jalan Tambang)',           'pipeline'),
  ('R800001-0002', 'Bangunan Jalan Boulevard Makassar',         'pipeline'),
  ('R800021-0016', 'Lahan Sidrap',                             'pipeline'),
  ('R800011-0017', 'Lahan Jalan Alauddin Makassar',             'pipeline'),
  ('R800012-0018', 'Lahan Kebun Marinsow',                      'pipeline'),
  ('R800013-0019', 'Lahan Jl Masjid Raya & Kangkung',          'pipeline'),
  ('R800002-0032', 'Bangunan Jl Slamet Riyadi Makassar',        'pipeline'),
  ('R800014-0020', 'Lahan Jalan Biru Bone',                     'pipeline'),
  ('R800015-0012', 'Bangunan Mess Jl Masjid Raya',              'pipeline'),
  ('R800039-0033', 'Lahan Desa Galung',                         'pipeline'),
  ('R800019-0023', 'Lahan Jl Kemakmuran & Samudra Soppeng',     'pipeline'),
  ('R800003-0004', 'Bangunan Ruko Jl Pengayoman',               'pipeline'),
  ('R800017-0025', 'Bangunan Eks LO Ambon',                     'pipeline'),
  ('R800006-0007', 'Lahan Eks Pabrik Kapas (Mini Soccer)',       'pipeline'),
  ('R800033-0028', 'Lahan Eks Pabrik Kapas (Studio Foto)',       'pipeline'),
  ('R800010-0010', 'Lahan Eks Pabrik Kapas (Papan Iklan)',       'pipeline'),
  ('R800004-0005', 'Bangunan Kantor Direksi - Gedung Timur',    'pipeline'),
  ('R800032-0027', 'Bangunan Kantor Direksi - Pelayanan 13',    'pipeline'),
  ('R800005-0006', 'Bangunan Jalan Bambapuang Makassar',        'pipeline'),
  ('R800007-0008', 'Lahan Unit Kabaru',                         'pipeline')
ON CONFLICT (kode_aset) DO NOTHING;
