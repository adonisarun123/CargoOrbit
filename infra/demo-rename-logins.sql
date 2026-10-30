-- One-off for an existing demo database: move the demo logins from @cargoorbit.test to @freytara.com.
-- Run as the database owner, from the repository root:
--   docker compose -f compose.demo.yaml exec -T postgres psql -U postgres -d cargoorbit -v ON_ERROR_STOP=1 < infra/demo-rename-logins.sql
-- Passwords are unchanged. Sealed receipts and the audit log keep the old addresses: they are immutable history.
\echo 'Demo logins before:'
SELECT email FROM users WHERE email LIKE '%@cargoorbit.test' ORDER BY email;

BEGIN;
UPDATE users
   SET email = replace(email, '@cargoorbit.test', '@freytara.com'),
       verified_contact = replace(verified_contact, '@cargoorbit.test', '@freytara.com')
 WHERE email LIKE '%@cargoorbit.test';
-- Receiver verification codes go to the authority's contact, which must match the receiver's login.
UPDATE entities
   SET data = jsonb_set(data, '{contact}', to_jsonb(replace(data->>'contact', '@cargoorbit.test', '@freytara.com'))),
       revision = revision + 1,
       updated_at = now()
 WHERE kind = 'grants' AND data->>'contact' LIKE '%@cargoorbit.test';
UPDATE tenants SET name = 'FreyTara demonstration' WHERE id = 'demo-tenant' AND name = 'CargoOrbit demonstration';
COMMIT;

\echo 'Demo logins after:'
SELECT email FROM users ORDER BY email;
SELECT data->>'contact' AS receiver_code_contact FROM entities WHERE kind = 'grants';
