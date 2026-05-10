-- Migration 015: Katalog Aset
-- Tables for asset catalog/factsheet data, linked to existing aset table

-- Main catalog data per asset (one catalog per aset)
CREATE TABLE IF NOT EXISTS katalog_aset (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aset_id UUID NOT NULL REFERENCES aset(id) ON DELETE CASCADE,
  tagline TEXT,
  coordinates_lat TEXT,
  coordinates_lng TEXT,
  sertifikat_detail TEXT,
  sertifikat_pemilik TEXT,
  zonasi TEXT,
  topografi TEXT,
  kondisi_bangunan TEXT,
  rekomendasi_pengembangan TEXT,
  rekomendasi_summary TEXT,
  pic_nama TEXT,
  pic_jabatan TEXT,
  pic_phone TEXT,
  pic_mobile TEXT,
  pic_email TEXT,
  pic_kantor TEXT,
  tgl_dokumen TEXT,
  ref_dokumen TEXT,
  layout_preferensi TEXT DEFAULT 'editorial',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(aset_id)
);

-- Accessibility items per catalog
CREATE TABLE IF NOT EXISTS katalog_aksesibilitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  katalog_id UUID NOT NULL REFERENCES katalog_aset(id) ON DELETE CASCADE,
  urutan INTEGER DEFAULT 0,
  label TEXT NOT NULL,
  nilai TEXT,
  keterangan TEXT
);

-- Surroundings per catalog
CREATE TABLE IF NOT EXISTS katalog_lingkungan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  katalog_id UUID NOT NULL REFERENCES katalog_aset(id) ON DELETE CASCADE,
  urutan INTEGER DEFAULT 0,
  nama TEXT NOT NULL,
  jarak TEXT,
  tipe TEXT
);

-- Partnership schemes per catalog
CREATE TABLE IF NOT EXISTS katalog_skema (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  katalog_id UUID NOT NULL REFERENCES katalog_aset(id) ON DELETE CASCADE,
  urutan INTEGER DEFAULT 0,
  kode TEXT NOT NULL,
  nama TEXT,
  catatan TEXT
);

-- Photos metadata per catalog (files stored in Supabase Storage bucket 'katalog-foto')
CREATE TABLE IF NOT EXISTS katalog_foto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  katalog_id UUID NOT NULL REFERENCES katalog_aset(id) ON DELETE CASCADE,
  slot_id TEXT NOT NULL,
  url TEXT NOT NULL,
  urutan INTEGER DEFAULT 0
);

-- RLS: allow anon full access (same pattern as other tables)
ALTER TABLE katalog_aset ENABLE ROW LEVEL SECURITY;
ALTER TABLE katalog_aksesibilitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE katalog_lingkungan ENABLE ROW LEVEL SECURITY;
ALTER TABLE katalog_skema ENABLE ROW LEVEL SECURITY;
ALTER TABLE katalog_foto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access" ON katalog_aset FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON katalog_aksesibilitas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON katalog_lingkungan FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON katalog_skema FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON katalog_foto FOR ALL TO anon USING (true) WITH CHECK (true);
