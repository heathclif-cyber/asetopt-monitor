-- Buat tabel relasi pivot M:N antara Kerja Sama dan Aset
CREATE TABLE IF NOT EXISTS kerja_sama_aset (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ks_id UUID NOT NULL REFERENCES kerja_sama(id) ON DELETE CASCADE,
    aset_id UUID NOT NULL REFERENCES aset(id) ON DELETE CASCADE,
    luas_tanah_ks DECIMAL(12,2) DEFAULT 0,
    luas_bangunan_ks DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ks_id, aset_id)
);

-- Aktifkan RLS
ALTER TABLE kerja_sama_aset ENABLE ROW LEVEL SECURITY;

-- Mengizinkan anon access karena sistem internal
CREATE POLICY "Allow anon full access" ON kerja_sama_aset FOR ALL TO anon USING (true) WITH CHECK (true);

-- Migrasikan data yang sudah ada (KerjaSama.aset_id) ke dalam tabel pivot ini
INSERT INTO kerja_sama_aset (ks_id, aset_id)
SELECT id, aset_id 
FROM kerja_sama 
WHERE aset_id IS NOT NULL
ON CONFLICT (ks_id, aset_id) DO NOTHING;
