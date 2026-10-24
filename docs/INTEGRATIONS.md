# Approved integrations and expansion workflows

The application contains an executable tenant-scoped integration framework and an operator-configured HTTPS gateway adapter. It does **not** claim to have implemented or certified unpublished ULIP, NIC, SAP, WMS or eSign vendor contracts. It makes no external calls unless an operator supplies a current approved configuration and credentials. Default configuration is empty.

## Provider lifecycle

`createIntegrationService(database)` reads `INTEGRATION_CONFIG_JSON` at startup. Each entry binds tenant, provider, adapter, exact purpose, approved operations, identifier types, dataset IDs, expiry, rate, freshness, approval and contract-test references. It also describes a fixed gateway HTTPS origin, allowlisted hostname, request/lookup paths and a `CARGO_PROVIDER_*` secret environment variable name. No secret values are persisted in domain records.

Gateway contract (map this to the actual approved vendor using a separately tested adapter):

- Request: operationId, operation, purpose, identifierType, identifier, datasetId, parameters.
- Response: status (`confirmed`, `pending`, `not_found`, `rejected`), observedAt, data, and externalReference for confirmed writes.
- Lookup: original operationId and operation. Lookup must never execute the underlying write again.

Permitted operations: ulip.read, eway.read, eway.extend, erp.invoice.create, erp.invoice.lookup, wms.read, wms.movement.post, esign.request and esign.lookup. No bank transfer, customs clearance or vehicle-control operation exists. E-way extension additionally requires approved official transaction authority. Response provenance is not a substitute for contract-specific response verification.

Three bounded read attempts may occur after transport failure. Writes execute once. Any unconfirmed write stays `uncertain` and returns `reconciliationRequired`; submitting the same operation returns the existing state without a second remote creation. Write identity is bound to the tenant, configuration, operation and business record, so changing a caller's retry key or finance user cannot silently duplicate the same invoice export. ERP create requests use internal invoice IDs and stored invoice snapshots; WMS writes use stored movement IDs, eSign uses accepted POD IDs, and government extension uses an open compliance-task ID. Arbitrary caller-supplied financial payload fields are rejected. Lookup reconciliation requires current phase and operation approval, shares the configured rate limit, has a 30-second minimum interval and cannot overwrite a newer reconciliation result. Three consecutive failed calls open the provider circuit for 60 seconds. Each transport attempt, including read retries and reconciliation lookups, is metered per tenant configuration and minute.

The gateway transport accepts only HTTPS hostnames on port 443 with fixed paths and no URL credentials. It resolves IPv4 public addresses, rejects internal/metadata ranges, pins the validated address during TLS connection, rejects redirects, applies an end-to-end deadline (DNS, credentials, TLS and streaming) and response-size limits, and never logs credentials or request bodies. Internal gateways and IPv6-only gateways need an explicitly reviewed deployment-specific transport; loosening the defaults is not necessary for normal approved public providers.

Provider call records contain hashes of the request and exact outbound payload, the approval snapshot, provenance and the validated response. Unresolved writes also retain the minimal reconciliation request (internal business ID and reviewed reason/reference, never the full outbound financial record) so an authorized operator can recover after a client restart. History exposes that exact request only to the requester or tenant owner. General CSV exports do not include these restricted records. Provider-specific retention, downstream redistribution rights, response redaction and data ownership require approval before enabling a dataset.

## Deployment wiring

The factory exports an `IntegrationService` with:

```ts
await service.capabilities(context);
await service.execute(context, request);
await service.reconcile(context, originalRequest);
await service.query(context, optionalCallId);
```

The API exposes `/integrations/capabilities`, `/integrations/calls[/:id]`, `/integrations/execute` and `/integrations/reconcile`; sensitive writes additionally require a fresh step-up token. Authenticated API wrappers must supply the server-verified context, not a tenant ID from the request body. Configuration is server-only; never offer a public endpoint that accepts gateway origins or secret values. P2 must be entitled. ERP calls are restricted to owner/finance, government/eSign to owner/operations, WMS exchange to owner until service-account policies are added. Remote data does not silently mutate business records; a confirmed mapping/receipt workflow is required.

## Additional business workflows

The existing `/expansion/actions/:action` route supports:

| Action | Purpose |
|---|---|
| closeDeviceAssignment | Close an assignment without changing the identity of historical observations |
| cancelReservation | Release unconsumed stock once, retaining audit history |
| registerHandlingUnit | Identify pallet/box/parcel and reconcile item quantities to its shipment |
| aggregateHandlingUnits | Version pallet composition, preventing cycles, duplicate containment and cross-owner aggregation |
| scanHandlingUnit | Persist ordered, idempotent custody events with exact composition; never finalize customer POD |
| calculateEta | Rule-based ETA from fresh signal plus sourced operator distance/speed inputs; missing/stale signal yields unknown |
| recordTransportPlan | Deterministic delivery-only route proposal with capacity, cargo, windows, service and duty constraints |
| releaseTransportPlan | Recheck shipment freshness, acknowledge unserved work and record planner release |
| completeMaintenance | Close a due reminder with a retained service event; no roadworthiness certification |

Query resources include handlingUnits, handlingEvents, etaEstimates, transportPlans, maintenanceEvents and emissionsReviews.

Signed observations must include `tenantId` inside the signed envelope and must match a current registered device assignment at the source timestamp. Revoked devices are denied. Replaying a changed event ID is rejected. Late observations are retained with a label and do not replace newer vehicle positions. Open sensor alerts enter the approved operations schedule; notification contacts, channels and shift coverage come from owner-approved scheduler configuration. Creating an alert does not itself send a message or bypass shift approval. Staffed coverage and escalation must be validated before field rollout.

Warehouse memberships require both stock owner organization and permitted facilities; same-site access does not imply access to another customer's goods.

## Explicit remaining boundaries

These source modules need field rollout and provider contract tests. The route planner is a deterministic heuristic using supplied travel times, not a global optimizer, licensed traffic feed or predictive model. It stores a reviewed plan and does not silently assign trips. Handling-unit custody does not replace receiver goods acceptance. GPS does not prove receipt. Hardware installation, calibration, GRAI/SSCC allocation rights, specialized warehouse machine safety, tax/customer finance decisions and legal evidence acceptance remain independently owned launch gates.
