-- Layer Zero security baseline: browser anon key must not access business data.
-- Application traffic goes through FastAPI, which verifies the AsetOpt JWT and
-- applies application roles. The database service role remains unaffected.

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'anon' = ANY(roles)
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      item.policyname,
      item.schemaname,
      item.tablename
    );
  END LOOP;
END $$;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
