-- Run only with the migration owner. Never use this owner in API/worker DATABASE_URL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cargoorbit_app') THEN
    CREATE ROLE cargoorbit_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closing','closed')),
  features jsonb NOT NULL DEFAULT '{"M":true,"P2":false,"P3":false,"P4":false}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0),
  mfa_secret text,
  mfa_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_case_insensitive ON users (lower(email));

CREATE TABLE IF NOT EXISTS memberships (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  tenant_id text NOT NULL REFERENCES tenants(id),
  role text NOT NULL CHECK (role IN ('owner','operations','driver','customer_admin','receiver','finance','customer_finance','auditor','control_room','warehouse','sustainability','platform_admin')),
  organization_id text,
  facility_ids text[] NOT NULL DEFAULT '{}',
  assigned_driver_id text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,tenant_id,role)
);
CREATE INDEX IF NOT EXISTS memberships_login ON memberships(user_id,status);

CREATE TABLE IF NOT EXISTS login_attempts (
  key text PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts>=0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(expires_at);

CREATE TABLE IF NOT EXISTS entities (
  tenant_id text NOT NULL REFERENCES tenants(id),
  kind text NOT NULL CHECK (kind ~ '^[a-zA-Z][a-zA-Z0-9_-]{0,79}$' AND kind NOT IN ('audit','outbox')),
  id text NOT NULL,
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object' AND data ? 'id' AND jsonb_typeof(data->'id')='string' AND data->>'id'=id),
  revision bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,kind,id),
  CHECK (NOT (data ? 'tenantId') OR (jsonb_typeof(data->'tenantId')='string' AND data->>'tenantId'=tenant_id))
);
CREATE INDEX IF NOT EXISTS entities_by_customer ON entities (tenant_id,kind,(data->>'organizationId'));
CREATE INDEX IF NOT EXISTS entities_by_consignment ON entities (tenant_id,kind,(data->>'consignmentId'));
CREATE INDEX IF NOT EXISTS entities_data_search ON entities USING gin (data jsonb_path_ops);

CREATE TABLE IF NOT EXISTS audit_events (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  actor_id text NOT NULL,
  role text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS audit_events_target ON audit_events (tenant_id,target,created_at);

CREATE TABLE IF NOT EXISTS outbox_events (
  tenant_id text NOT NULL REFERENCES tenants(id),
  id text NOT NULL,
  type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
  available_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS outbox_pending ON outbox_events (tenant_id,status,available_at);

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entities_tenant ON entities;
CREATE POLICY entities_tenant ON entities TO cargoorbit_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),''));
DROP POLICY IF EXISTS audit_tenant ON audit_events;
CREATE POLICY audit_tenant ON audit_events TO cargoorbit_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),''));
DROP POLICY IF EXISTS outbox_tenant ON outbox_events;
CREATE POLICY outbox_tenant ON outbox_events TO cargoorbit_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),''))
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),''));

CREATE OR REPLACE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit events are append only'; END $$;
DROP TRIGGER IF EXISTS audit_immutable ON audit_events;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

CREATE OR REPLACE FUNCTION protect_finalized_pod() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind='pods' AND OLD.data ? 'acceptedPayload' AND OLD.data->'acceptedPayload'<>'null'::jsonb THEN
    RAISE EXCEPTION 'Finalized POD versions are immutable; create a linked correction';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entities_finalized_pod ON entities;
CREATE TRIGGER entities_finalized_pod BEFORE UPDATE OR DELETE ON entities FOR EACH ROW EXECUTE FUNCTION protect_finalized_pod();

CREATE OR REPLACE FUNCTION protect_outbox_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.tenant_id,NEW.id,NEW.type,NEW.aggregate_id,NEW.payload,NEW.created_at)
     IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.type,OLD.aggregate_id,OLD.payload,OLD.created_at) THEN
    RAISE EXCEPTION 'Outbox event identity and payload are immutable';
  END IF;
  IF NEW.attempts<OLD.attempts THEN RAISE EXCEPTION 'Outbox attempts cannot regress'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS outbox_identity ON outbox_events;
CREATE TRIGGER outbox_identity BEFORE UPDATE ON outbox_events FOR EACH ROW EXECUTE FUNCTION protect_outbox_identity();

REVOKE ALL ON entities,audit_events,outbox_events,users,memberships,tenants,login_attempts FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cargoorbit_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON entities TO cargoorbit_app;
GRANT SELECT,INSERT ON audit_events TO cargoorbit_app;
GRANT SELECT,INSERT,UPDATE ON outbox_events TO cargoorbit_app;
GRANT SELECT,INSERT,UPDATE ON users,memberships,tenants TO cargoorbit_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON login_attempts TO cargoorbit_app;

-- The operator creates a separate LOGIN with a secret and grants cargoorbit_app
-- to it. No password, owner privilege or BYPASSRLS is included in source control.
