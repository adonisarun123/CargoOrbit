-- Managed PostgreSQL owners are not superusers. Explicit operator membership permits
-- backup/retention through FORCE RLS without weakening the restricted application role.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cargoorbit_operator') THEN
  CREATE ROLE cargoorbit_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
 END IF;
END $$;
GRANT cargoorbit_operator TO CURRENT_USER;
CREATE POLICY entity_operator ON entities TO cargoorbit_operator USING(true) WITH CHECK(true);
CREATE POLICY audit_operator ON audit_events TO cargoorbit_operator USING(true) WITH CHECK(true);
CREATE POLICY outbox_operator ON outbox_events TO cargoorbit_operator USING(true) WITH CHECK(true);
GRANT SELECT ON entities,audit_events,outbox_events TO cargoorbit_operator;

-- Maintained counters avoid loading every entity to report usage. Metadata bytes are serialized JSON,
-- not physical PostgreSQL disk usage; object bytes represent registered versions, not bucket billing.
CREATE TABLE tenant_usage (
 tenant_id text NOT NULL REFERENCES tenants(id), kind text NOT NULL,
 record_count bigint NOT NULL DEFAULT 0 CHECK(record_count>=0),
 metadata_bytes bigint NOT NULL DEFAULT 0 CHECK(metadata_bytes>=0),
 object_bytes bigint NOT NULL DEFAULT 0 CHECK(object_bytes>=0),
 PRIMARY KEY(tenant_id,kind)
);
CREATE FUNCTION registered_object_bytes(entity_kind text,entity_data jsonb) RETURNS bigint
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT CASE WHEN entity_kind IN ('evidence','packets') AND entity_data->>'size' ~ '^[0-9]{1,18}$' THEN (entity_data->>'size')::bigint WHEN entity_kind='tenant_exports' AND entity_data->>'bytes' ~ '^[0-9]{1,18}$' THEN (entity_data->>'bytes')::bigint ELSE 0 END
$$;
ALTER TABLE entities NO FORCE ROW LEVEL SECURITY;
INSERT INTO tenant_usage(tenant_id,kind,record_count,metadata_bytes,object_bytes)
 SELECT tenant_id,kind,count(*),sum(octet_length(data::text)),sum(registered_object_bytes(kind,data)) FROM entities GROUP BY tenant_id,kind;
ALTER TABLE entities FORCE ROW LEVEL SECURITY;
ALTER TABLE tenant_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_usage_scope ON tenant_usage TO cargoorbit_app USING(tenant_id=nullif(current_setting('app.tenant_id',true),''));
CREATE POLICY tenant_usage_operator ON tenant_usage TO cargoorbit_operator USING(true);
REVOKE ALL ON tenant_usage FROM PUBLIC,cargoorbit_app;
GRANT SELECT ON tenant_usage TO cargoorbit_operator;
GRANT SELECT ON tenant_usage TO cargoorbit_app;
CREATE FUNCTION maintain_tenant_usage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP IN ('DELETE','UPDATE') THEN
  UPDATE public.tenant_usage SET record_count=record_count-1,metadata_bytes=metadata_bytes-octet_length(OLD.data::text),object_bytes=object_bytes-public.registered_object_bytes(OLD.kind,OLD.data)
   WHERE tenant_id=OLD.tenant_id AND kind=OLD.kind;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') THEN
  INSERT INTO public.tenant_usage(tenant_id,kind,record_count,metadata_bytes,object_bytes)
   VALUES(NEW.tenant_id,NEW.kind,1,octet_length(NEW.data::text),public.registered_object_bytes(NEW.kind,NEW.data))
   ON CONFLICT(tenant_id,kind) DO UPDATE SET record_count=public.tenant_usage.record_count+1,
    metadata_bytes=public.tenant_usage.metadata_bytes+excluded.metadata_bytes,object_bytes=public.tenant_usage.object_bytes+excluded.object_bytes;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION maintain_tenant_usage() FROM PUBLIC;
CREATE TRIGGER entities_usage AFTER INSERT OR UPDATE OR DELETE ON entities FOR EACH ROW EXECUTE FUNCTION maintain_tenant_usage();

-- Operator-only minimal receipts survive tenant erasure and contain references/hashes, never account credentials.
CREATE TABLE retention_execution_receipts (
 id text PRIMARY KEY,tenant_id_hash text NOT NULL,request_id text NOT NULL,action text NOT NULL CHECK(action IN ('close','delete')),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[a-f0-9]{64}$'),receipt jsonb NOT NULL,executed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id_hash,request_id,action)
);
REVOKE ALL ON retention_execution_receipts FROM PUBLIC,cargoorbit_app;
CREATE TRIGGER retention_receipts_immutable BEFORE UPDATE OR DELETE ON retention_execution_receipts FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

-- Extend append-only history without rewriting the deployed migration checksum.
CREATE OR REPLACE FUNCTION protect_entity_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind IN ('observations','inventory_movements','asset_handovers','safety_tests','scorecards','emissions_runs','dock_reads','handling_unit_events','eta_estimates','maintenance_events','allocation_reversals','allocation_verifications','discrepancies','operational_rules','fuel_entries','toll_events','warehouse_task_events','quality_reviews','replenishment_events','recovery_verifications','advanced_approval_history','maintenance_signals','maintenance_rules','layout_versions','goods_documents','goods_document_links','transshipments','barcode_mappings','task_history','usage_warnings') THEN
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
