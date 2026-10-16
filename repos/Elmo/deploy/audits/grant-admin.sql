-- Explicit operator-only bootstrap. Review both variables and the database first.
-- Usage: psql ... -v admin_id='verified-id' -v admin_email='verified-email' -f grant-admin.sql
\set ON_ERROR_STOP on
BEGIN;
SELECT id,email,role FROM "user" WHERE id=:'admin_id' AND email=:'admin_email';
UPDATE "user" SET role='admin' WHERE id=:'admin_id' AND email=:'admin_email';
COMMIT;
