-- Tambah policy untuk anon role (internal tool tanpa auth)
-- Jalankan di Supabase SQL Editor setelah 001_initial_schema.sql

CREATE POLICY "Allow anon full access" ON aset FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON njop FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON penilaian_kjpp FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON timeline_program FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON prospek_mitra FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON kerja_sama FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON kompensasi FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON pembayaran FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON surat_peringatan FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON pbb FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon full access" ON log_notifikasi FOR ALL TO anon USING (true) WITH CHECK (true);
