-- Migration 015: Multi-objek PBB
-- Setiap kerja sama bisa punya lebih dari 1 objek PBB (NOP/SPPT)

CREATE TABLE IF NOT EXISTS pbb_objek (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pbb_id               UUID NOT NULL REFERENCES pbb(id) ON DELETE CASCADE,
  nama_objek           VARCHAR(200) NOT NULL DEFAULT 'Objek 1',
  no_sppt              VARCHAR(60),
  nilai_pbb_objek      DECIMAL(15,2) NOT NULL DEFAULT 0,
  luas_tanah_sppt      DECIMAL(12,2) DEFAULT 0,
  luas_tanah_ks        DECIMAL(12,2) DEFAULT 0,
  njop_tanah_per_m2    DECIMAL(15,2) DEFAULT 0,
  luas_bangunan_sppt   DECIMAL(12,2) DEFAULT 0,
  luas_bangunan_ks     DECIMAL(12,2) DEFAULT 0,
  njop_bangunan_per_m2 DECIMAL(15,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pbb_objek ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pbb_objek_anon"  ON pbb_objek FOR ALL TO anon         USING (true) WITH CHECK (true);
CREATE POLICY "pbb_objek_auth"  ON pbb_objek FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Migrasi data lama: setiap PBB record lama jadi 1 pbb_objek
INSERT INTO pbb_objek (
  pbb_id, nama_objek, nilai_pbb_objek,
  luas_tanah_sppt, luas_tanah_ks, njop_tanah_per_m2,
  luas_bangunan_sppt, luas_bangunan_ks, njop_bangunan_per_m2
)
SELECT
  id,
  'Objek 1',
  COALESCE(nilai_pbb, 0),
  COALESCE(luas_tanah_sppt, 0),
  COALESCE(luas_tanah_ks, 0),
  COALESCE(njop_tanah_per_m2, 0),
  COALESCE(luas_bangunan_sppt, 0),
  COALESCE(luas_bangunan_ks, 0),
  COALESCE(njop_bangunan_per_m2, 0)
FROM pbb
WHERE NOT EXISTS (
  SELECT 1 FROM pbb_objek po WHERE po.pbb_id = pbb.id
);
