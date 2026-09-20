-- Legacy agreements remain valid; new OPSET GIS areas require this when published.
ALTER TABLE kerja_sama
  ADD COLUMN IF NOT EXISTS skema_kerja_sama TEXT;
