-- Tambah kolom pph_mode: 'none' (PPh tidak dipotong dari invoice)
-- atau 'bukti_potong' (mitra setor bukti potong, PPh mengurangi tagihan)
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS pph_mode VARCHAR(20) NOT NULL DEFAULT 'none';

-- Drop dan recreate total_tagihan agar formula mengakomodasi pph_mode
ALTER TABLE kompensasi DROP COLUMN total_tagihan;
ALTER TABLE kompensasi ADD COLUMN total_tagihan DECIMAL(15,2)
  GENERATED ALWAYS AS (
    nominal + (nominal * ppn_persen / 100)
    - CASE WHEN pph_mode = 'bukti_potong' THEN nominal * pph_persen / 100 ELSE 0 END
  ) STORED;
