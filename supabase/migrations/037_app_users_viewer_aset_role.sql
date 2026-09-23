-- Pembaca Master Data dan Peta Aset tanpa izin mengubah data.
ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'viewer', 'integrasi', 'staf', 'admin_aset', 'viewer_aset'));
