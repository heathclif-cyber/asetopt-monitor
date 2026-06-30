-- Migration 019: Tambah kolom basis ke rkap_target (cash_in / pendapatan)

ALTER TABLE rkap_target ADD COLUMN IF NOT EXISTS basis VARCHAR(20) DEFAULT 'cash_in';

COMMENT ON COLUMN rkap_target.basis IS 'cash_in | pendapatan — basis pengakuan RKAP';
