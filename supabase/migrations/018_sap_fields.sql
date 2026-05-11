-- Migration 018: SAP Reference Fields
-- No Kontrak di level kerja_sama, No Invoice & No Billing di level kompensasi

ALTER TABLE kerja_sama ADD COLUMN IF NOT EXISTS no_kontrak_sap VARCHAR(100);
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS no_invoice_sap VARCHAR(100);
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS no_billing_sap VARCHAR(100);
