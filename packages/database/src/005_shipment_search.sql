-- Searchable source references are derived from the authoritative entity. Relations and
-- actor permissions are joined live before pagination, so assignment changes cannot leak.
-- The first 100 normalized characters cover the maximum query length, avoiding oversized
-- btree entries for the existing 2,000-character document references. No extension needed.
-- Match ECMAScript trim characters for legacy references while preserving display text.
CREATE FUNCTION normalize_shipment_reference(value text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT lower(btrim(value,U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))
$$;
CREATE TABLE shipment_search_terms (
 tenant_id text NOT NULL, source_kind text NOT NULL, source_id text NOT NULL,
 reference_type text NOT NULL CHECK(reference_type IN ('shipment','lr','vehicle','goods_invoice','eway_bill','freight_invoice')),
 value text NOT NULL,
 normalized_prefix text GENERATED ALWAYS AS (left(normalize_shipment_reference(value),100)) STORED,
 FOREIGN KEY(tenant_id,source_kind,source_id) REFERENCES entities(tenant_id,kind,id) ON DELETE CASCADE
);
CREATE INDEX shipment_search_prefix ON shipment_search_terms(tenant_id,reference_type,normalized_prefix text_pattern_ops);
CREATE INDEX shipment_search_all_prefix ON shipment_search_terms(tenant_id,normalized_prefix text_pattern_ops);
CREATE INDEX shipment_search_source ON shipment_search_terms(tenant_id,source_kind,source_id);
CREATE INDEX entities_goods_document_relation ON entities(tenant_id,(data->>'documentId')) WHERE kind='goods_document_links';
CREATE INDEX entities_attempt_trip_relation ON entities(tenant_id,(data->>'tripId')) WHERE kind='attempts';
ALTER TABLE shipment_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_search_terms FORCE ROW LEVEL SECURITY;
CREATE POLICY shipment_search_tenant ON shipment_search_terms TO cargoorbit_app USING(tenant_id=nullif(current_setting('app.tenant_id',true),''));
CREATE POLICY shipment_search_operator ON shipment_search_terms TO cargoorbit_operator USING(true) WITH CHECK(true);
REVOKE ALL ON shipment_search_terms FROM PUBLIC,cargoorbit_app;
GRANT SELECT ON shipment_search_terms TO cargoorbit_app,cargoorbit_operator;
CREATE FUNCTION shipment_reference_values(entity_kind text,entity_data jsonb) RETURNS TABLE(reference_type text,value text)
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT DISTINCT refs.reference_type,refs.value FROM (
  SELECT 'shipment'::text,entity_data->>'id' WHERE entity_kind='consignments'
  UNION ALL SELECT 'lr',entity_data->>'lrNumber' WHERE entity_kind='consignments'
  UNION ALL SELECT 'goods_invoice',v #>> '{}' FROM jsonb_array_elements(CASE WHEN entity_kind='consignments' AND jsonb_typeof(entity_data->'invoiceReferences')='array' THEN entity_data->'invoiceReferences' ELSE '[]'::jsonb END) v WHERE jsonb_typeof(v)='string'
  UNION ALL SELECT 'eway_bill',v->>'number' FROM jsonb_array_elements(CASE WHEN entity_kind='consignments' AND jsonb_typeof(entity_data->'ewayBills')='array' THEN entity_data->'ewayBills' ELSE '[]'::jsonb END) v
  UNION ALL SELECT entity_data->>'kind',entity_data->>'number' WHERE entity_kind='goods_documents' AND entity_data->>'kind' IN ('goods_invoice','eway_bill')
  UNION ALL SELECT 'vehicle',entity_data->>'vehicleNumber' WHERE entity_kind='trips'
  UNION ALL SELECT 'freight_invoice',entity_data->>'number' WHERE entity_kind='invoices'
 ) refs(reference_type,value) WHERE refs.value IS NOT NULL AND refs.value<>''
$$;
CREATE FUNCTION maintain_shipment_search_terms() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN DELETE FROM public.shipment_search_terms WHERE tenant_id=OLD.tenant_id AND source_kind=OLD.kind AND source_id=OLD.id; END IF;
 INSERT INTO public.shipment_search_terms(tenant_id,source_kind,source_id,reference_type,value)
 SELECT NEW.tenant_id,NEW.kind,NEW.id,r.reference_type,r.value FROM public.shipment_reference_values(NEW.kind,NEW.data) r;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION maintain_shipment_search_terms() FROM PUBLIC;
CREATE TRIGGER entities_search_terms AFTER INSERT OR UPDATE ON entities FOR EACH ROW
 WHEN (NEW.kind IN ('consignments','goods_documents','trips','invoices')) EXECUTE FUNCTION maintain_shipment_search_terms();
INSERT INTO shipment_search_terms(tenant_id,source_kind,source_id,reference_type,value)
 SELECT e.tenant_id,e.kind,e.id,r.reference_type,r.value FROM entities e
 CROSS JOIN LATERAL shipment_reference_values(e.kind,e.data) r
 WHERE e.kind IN ('consignments','goods_documents','trips','invoices');
