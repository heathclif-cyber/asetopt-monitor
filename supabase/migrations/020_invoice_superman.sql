-- Migration 020: Invoice internal, Superman, document uploads

ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS no_invoice VARCHAR(100);
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS invoice_tgl DATE;
ALTER TABLE kompensasi ADD COLUMN IF NOT EXISTS superman TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kompensasi_no_invoice
  ON kompensasi (no_invoice) WHERE no_invoice IS NOT NULL;

ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS no_pembayaran VARCHAR(100);
ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS is_pph_disetor BOOLEAN DEFAULT false;
ALTER TABLE pembayaran ADD COLUMN IF NOT EXISTS superman TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pembayaran_no_pembayaran
  ON pembayaran (no_pembayaran) WHERE no_pembayaran IS NOT NULL;

ALTER TABLE pbb ADD COLUMN IF NOT EXISTS no_invoice VARCHAR(100);

CREATE TABLE IF NOT EXISTS document_upload (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  doc_type VARCHAR(50) NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_upload_entity
  ON document_upload (entity_type, entity_id, doc_type);

ALTER TABLE document_upload ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon full access document_upload" ON document_upload
  FOR ALL TO anon USING (true) WITH CHECK (true);