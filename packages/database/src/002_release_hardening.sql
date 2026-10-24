-- Additive migration. A duplicate business key intentionally blocks rollout for reconciliation.
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_last_counter bigint NOT NULL DEFAULT -1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_contact text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS auth_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  membership_id text NOT NULL REFERENCES memberships(id),
  refresh_hash text NOT NULL UNIQUE,
  previous_refresh_hash text UNIQUE,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  user_session_version integer NOT NULL DEFAULT 1 CHECK(user_session_version>0),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user_active ON auth_sessions(user_id,expires_at) WHERE revoked_at IS NULL;
REVOKE ALL ON auth_sessions FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON auth_sessions TO cargoorbit_app;

CREATE UNIQUE INDEX IF NOT EXISTS consignment_lr_namespace ON entities
 (tenant_id,(data->>'branch'),(data->>'financialYear'),(data->>'lrNumber')) WHERE kind='consignments';
CREATE UNIQUE INDEX IF NOT EXISTS freight_invoice_external_number ON entities
 (tenant_id,(data->>'accountingSource'),(data->>'number')) WHERE kind='invoices';
CREATE INDEX IF NOT EXISTS entities_ordered ON entities(tenant_id,kind,created_at,id);
CREATE INDEX IF NOT EXISTS entities_payer ON entities(tenant_id,kind,(data->>'payerId'));
CREATE INDEX IF NOT EXISTS entities_facility ON entities(tenant_id,kind,(data->>'facilityId'));
CREATE INDEX IF NOT EXISTS entities_assigned_driver ON entities(tenant_id,kind,(data->>'assignedDriverId'));
CREATE INDEX IF NOT EXISTS entities_status ON entities(tenant_id,kind,(data->>'status'));

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS lease_token text;
CREATE INDEX IF NOT EXISTS outbox_claimable ON outbox_events(tenant_id,available_at,created_at,id)
 WHERE status IN ('pending','failed','processing');

CREATE OR REPLACE FUNCTION protect_entity_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind IN ('observations','inventory_movements','asset_handovers','safety_tests','scorecards','emissions_runs','dock_reads','handling_unit_events','eta_estimates','maintenance_events','allocation_reversals','allocation_verifications','discrepancies') THEN
  RAISE EXCEPTION 'Historical record is append only; append a correction';
 END IF;
 IF OLD.kind='policies' THEN RAISE EXCEPTION 'Policy versions are immutable; create a new version'; END IF;
 IF OLD.kind='evidence' AND TG_OP='UPDATE' AND (NEW.data - ARRAY['scanStatus','scannerReference','scannedAt']) IS DISTINCT FROM (OLD.data - ARRAY['scanStatus','scannerReference','scannedAt']) THEN
  RAISE EXCEPTION 'Original evidence provenance is immutable';
 END IF;
 IF OLD.kind='evidence' AND EXISTS (
  SELECT 1 FROM entities p WHERE p.tenant_id=OLD.tenant_id AND p.kind='pods'
   AND p.data->'acceptedPayload'->'evidence' @> jsonb_build_array(jsonb_build_object('id',OLD.id))
 ) THEN
  IF TG_OP='DELETE' OR NEW.data IS DISTINCT FROM OLD.data THEN
   RAISE EXCEPTION 'Sealed evidence provenance is immutable';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS entities_history_immutable ON entities;
CREATE TRIGGER entities_history_immutable BEFORE UPDATE OR DELETE ON entities FOR EACH ROW EXECUTE FUNCTION protect_entity_history();

-- Explicitly prevent runtime creation of schema objects, including SECURITY DEFINER functions.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM cargoorbit_app;
