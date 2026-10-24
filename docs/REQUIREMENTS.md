# SRS implementation and release gaps

This is a source review against [SRS.md](SRS.md), updated for the release-hardening work on 2026-10-24. It does not assert that the full SRS or a production release has passed acceptance. M, P2, P3 and P4 retain the SRS phase meanings. Enabling a phase does not complete its requirements.

**Core** means executable central behavior exists; the boundary column still applies. **Partial** means required behavior is missing or narrower than the SRS. **Absent** means there is no implementation of that capability. **Code** identifies engineering work. **Gate** identifies deployment, provider, customer or field evidence that cannot be supplied by a source change. Optional enhancements are identified as optional.

Use [VALIDATION.md](VALIDATION.md) for actual commands and results, and [OPERATIONS.md](OPERATIONS.md) for release procedures. Unit tests and builds do not establish capacity, availability, native reliability or independent security acceptance.

## Implementation evidence

| Area | Source and targeted checks |
|---|---|
| Core workflow | packages/domain/src/index.ts, schemas.ts, types.ts; tests/workflow.test.ts, tests/domain-release.test.ts |
| Identity | apps/api/src/auth.ts, admin.ts, contact.ts, security.ts; tests/api-security.test.ts, tests/api-security-admin.test.ts |
| Persistence | packages/database/src/001_initial.sql, 002_release_hardening.sql, index.ts; tests/postgres.test.ts, tests/database-release.test.ts |
| Evidence/export | apps/api/src/evidence.ts, storage.ts, packets.ts, packet-renderer.ts, export.ts; tests/evidence-release.test.ts |
| Scheduling/retention review | apps/api/src/operations-service.ts, operations.ts, worker.ts; tests/operations-release.test.ts |
| Browser | apps/web/components and lib; tests/csv.test.ts; browser results only as recorded in VALIDATION.md |
| Android | apps/mobile/App.tsx and src; tests/mobile-release.test.ts, tests/mobile-release-storage.test.ts; [native testing guide](../apps/mobile/README.md) |
| Connected modules | apps/api/src/expansion/service.ts and integrations; tests/expansion.test.ts, tests/expansion-release.test.ts; [integration guide](INTEGRATIONS.md) |

## Functional requirements

| ID | Phase | State | Implemented behavior and remaining boundary |
|---|---|---|---|
| FR001 | M | Core | Membership-derived tenant scope, forced RLS, transaction-local context, scoped objects and exports. **Gate:** deployed runtime-role, storage and worker isolation tests. |
| FR002 | M | Partial | Separate party/facility records, addresses/GST/PIN and audited updates/deactivation protect new work. **Code:** complete effective active-date ranges and structured transporter-identifier model remain. |
| FR003 | M | Core | Invitations, verified contact changes, scoped suspension, rotating sessions and revocation retain attribution. **Gate:** deployed invitation/OTP delivery and account recovery. Privileged enrollment remains an operator procedure. |
| FR004 | M | Core | Customer administrators govern receiver grants; privileged provisioning requires sponsor reference and MFA. **Gate:** actual sponsor verification and administrator appointment. |
| FR005 | M | Core | Versioned receipt/payment snapshots, approver/effective date, required documents/GRN/paper, receiver scope, escalation timing, tolerance and approved unit conversions. **Gate:** customer-approved rules and representative boundary-value UAT. |
| FR006 | M | Partial | CSV/JSON consignment preview, row/reference errors, duplicate checks and hash-bound batch commit. **Code:** invoice import and general column mapping. XLSX is absent; CSV satisfies the SRS format alternative. |
| FR007 | M | Core | Tenant/branch/year LR uniqueness and immutable internal IDs retain supplied LR numbers. **Gate:** customer external-number namespace/mapping agreement. |
| FR008 | M | Core | Item/SKU/package/weight/decimal unit quantities, goods invoice references and separate freight/goods values. **Code:** invoice references are not a complete structured goods-document ledger. |
| FR009 | M | Partial | Multi-LR trips/stops, e-way references and explicit attempt-line allocations. **Code:** shared structured goods documents and general transshipment relationships. |
| FR010 | M | Partial | Driver/vehicle/partner, route/arrival and reasoned reassignment history. **Code:** affected-user reassignment notifications lack a worker subscriber. |
| FR011 | M | Core | Attempt-scoped dispatch/arrival/unloading/refusal/return/delay events retain client ID, source and occurrence/server times. **Gate:** field SOP and device-clock validation. |
| FR012 | M | Partial | Cancellation, reassignment and linked reattempts preserve evidence and remaining-quantity guards. **Code:** dedicated transshipment workflow. |
| FR013 | M | Core | Organization/site/action/time/shipment grant checked against current membership and attempt on confirmation. **Gate:** customer authority enrollment. |
| FR014 | M | Partial | Expiring membership invitations do not grant POD acceptance; authenticated scoped receiver access is required. **Code:** dedicated shipment/stop invitation lifecycle; membership invitations are not stop invitations. |
| FR015 | M | Core | OTP binds receiver, grant, action, POD version and canonical payload hash; edits invalidate it. **Gate:** verified receiver contact and real messaging adapter. |
| FR016 | M | Core | Five-minute expiry, five failures, resend invalidation, rate limits, hashed secrets and outcome audit. **Gate:** production abuse controls, delivery references and redacted logs. |
| FR017 | M | Core | Exact receipt quantities, reservations, identities, policy wording/privacy version and explicit consent. **Gate:** customer wording approval and accessible receiver UAT. |
| FR018 | M | Core | Customer-admin temporary alternates are bounded by the original site/shipment/validity; parent revocation cascades and invalidates challenges. **Gate:** customer alternate-approver process. |
| FR019 | M | Partial | Provisional drafts cannot satisfy authorized-POD gates; pending-receiver reminders create tasks. **Code:** immediate, explicit no-authorized-receiver exception/escalation flow. |
| FR020 | P2 | Partial | Approved gateway eSign request/reconciliation uses accepted POD snapshots. **Code:** selected provider mapping, signed-document validation and verified artifact retention. **Gate:** provider authority/contract tests. |
| FR021 | M | Core | Exact accepted/damaged/rejected/short accounting and mandatory reasons prevent double counting. **Gate:** customer disposition definitions. |
| FR022 | M | Core | Exact attempt reconciliation/cumulative guards, versioned unit conversions with retained input/factor/reason, explicit shortage tolerance and separate unexpected-overdelivery observations. **Gate:** customer unit/rounding/tolerance UAT; tolerance does not silently rewrite acknowledged quantities. |
| FR023 | M | Core | Reservation reasons, notes and scoped evidence remain visible on accepted exceptions. **Gate:** customer reason taxonomy and evidence UAT. |
| FR024 | M | Core | Bounded multipart image/PDF upload, MIME-byte checks, private storage and malware quarantine before access. **Gate:** production ClamAV, ingress and malicious-file tests. |
| FR025 | M | Core | Original hash/version, actor/time/method, sealed attachment set and clean/durable gates. **Gate:** S3 IAM/versioning, object recovery and export checksums. |
| FR026 | M | Core | Atomic sealed payload/grant/policy/authentication/version/time/audit/outbox; immutable originals. **Gate:** deployed concurrency and restore verification. |
| FR027 | M | Partial | Readable PDF and JSON manifest use only sealed snapshots and include receipt/authority/hash data. **Code:** no dedicated verification URL/QR in the PDF. **Gate:** rendered packet review, required scripts/fonts and long-content cases. |
| FR028 | M | Core | Linked corrections, head/version guards, renewed acceptance and billing holds preserve submitted packet links. Finance closes the review task only after accepted correction, with reason/reference. **Gate:** concurrent correction/submission and customer finance UAT. |
| FR029 | M | Core | Per-stop partial/refused receipt, return/reattempt allocations and aggregate billing gates. **Code:** optional subset-shipment invoicing policy is absent. |
| FR030 | M | Core | Assigned attempts, scoped data, account-separated queue and guarded async sign-out/switch. **Gate:** shared-device and assignment-revocation field tests. |
| FR031 | M | Core | Encrypted local events/drafts/photos with stable IDs and saved-on-device status. **Gate:** SQLCipher, 24-hour force-stop/restart retention and disk-pressure behavior on signed builds. |
| FR032 | M | Core | Stable operations/checksums, photo-first sync, crash recovery, bounded retry and held stale conflicts; bytes persist until server acknowledgment. **Gate:** real network/process-death/duplicate-upload tests. |
| FR033 | M | Core | Offline evidence remains provisional; live server authorization is required for final receipt. No offline OTP trust protocol is claimed. |
| FR034 | M | Partial | Queue states, persistence errors, transient manual retry and visible held conflicts. **Code:** in-app escalation and conflict merge/resolution workflow; held work needs operator review. |
| FR035 | M | Partial | React Native camera/barcode/SQLCipher source, session refresh, recovery and HTTPS release config. **Gate:** signed APK/AAB, native SQLCipher proof and physical fleet device matrix. TypeScript checks are not a native build. |
| FR036 | M | Core | Versioned readiness, all blockers/owners/time and reevaluation on acceptance, scans, GRN, paper and discrepancies. **Gate:** worker latency and customer rule UAT. |
| FR037 | M | Core | Draft/issued freight invoice, charge lines, payer/date/source/tax reference and issue/void lifecycle. **Gate:** finance mapping; no authoritative GST calculation. |
| FR038 | M | Core | Packet generation/download is distinct from actual submission; channel/reference/time and POD versions persist. **Gate:** customer packet completeness and real channel. |
| FR039 | M | Core | Scoped customer or attributed manual response, reasons and preserved history with rejection follow-up. **Gate:** customer finance evidence/attribution approval. |
| FR040 | M | Core | Delivery/GRN/submission/acceptance and issue-date calendar triggers, day/month-offset with month-end clamping and India end-of-day, payer snapshots and audited overrides. **Code:** arbitrary holiday calendars need a further rule or explicit override. |
| FR041 | P2 | Partial | Approved gateway uses stored invoice snapshots, business-record idempotency and uncertain-write lookup. **Code:** accounting product mappings, customer-response ingestion and vendor validation. **Gate:** ERP authority/sandbox tests. |
| FR042 | M | Partial | Configurable invoice-issue review reminders separate POD from tax permission. **Code:** comprehensive missing-tax-data and customer legal deadline rules. **Gate:** finance/legal rule ownership. |
| FR043 | M | Core | Cash, withholding, credit, retention and disputes remain separate; unallocated balance and appended verification/reversal records. **Gate:** agreed finance golden dataset. |
| FR044 | M | Core | Deduction amount/reason/customer reference, owner/action, linked POD/lines and reviewed resolution. **Gate:** claims workflow UAT. |
| FR045 | M | Core | Exact balances, partial/multi-invoice receipts, verified noncash settlement and reversal guards. **Gate:** reconcile authoritative accounts. |
| FR046 | P2 | Partial | Dispute resolution links actual cash recovery; withholding, credits and outstanding remain distinct. **Code:** baseline-adjusted recovery-benefit reporting. |
| FR047 | M | Partial | Pending receipts/blockers/corrections/rejections/balances, scheduled tasks and reviewed finance task closure exist. **Code:** complete owner reassignment, aging and escalation lifecycle across every category remains. |
| FR048 | M | Partial | Durable scheduled messages including unresolved sensor alerts, provider references, signed content-checked callbacks and bounded retries; pre-send state/shift revalidation. **Code:** full business subscriber coverage, including reassignment notifications. **Gate:** approved contacts/templates and real delivery contract. |
| FR049 | M | Partial | Tenant time zone/weekdays/holidays/daytime shift, policy-specific receiver timing, daily deduplication and current-state cancellation/defer before sending. **Code:** per-site/overnight shifts, escalation tiers and staffed alert policy. |
| FR050 | M | Core | Protected actor/role/tenant/action/target/time/correlation audit includes audit/export access. **Gate:** denied-path coverage, centralized retention and trace drill. |
| FR051 | M | Absent | Platform administrators cannot browse normal tenant shipments. **Code:** approved temporary support grants and support-session audit workflow. |
| FR052 | M | Partial | Scoped queries/UI search, JSON/CSV export and formula escaping. **Code:** complete indexed cross-reference search and asynchronous large exports; many queries still materialize tenant lists. |
| FR053 | M | Core | E-way number/validity/source/provenance are distinct from commercial ETA. **Gate:** unknown/stale display UAT; manual references are not official verification. |
| FR054 | M | Partial | Scheduled validity review with lead time and operations ownership. **Code:** multiple offsets/per-site compliance ownership and applying verified provider validity to the reference. |
| FR055 | M | Partial | Compliance reason/location/distance/outcome/reference; local completion does not extend validity. **Code:** automatic complete task creation from a driver delay event. |
| FR056 | P2 | Partial | Tenant/purpose/dataset/identifier approvals, expiry, metering, freshness and provenance. Raw integration-call results are excluded from general archives. **Code:** dataset-specific mappings and independently permitted provider exports. **Gate:** actual ULIP access/usage terms. |
| FR057 | P2 | Partial | Explicitly approved e-way extension bound to stored compliance task, with uncertain/pending/confirmed states. **Code:** direct provider mapping and verified response application. **Gate:** official authority/contract tests. |
| FR058 | P2 | Core | Gateway deadline/rate/circuit/read retry controls and write-once attempt plus lookup reconciliation. **Gate:** real provider outage/duplicate/timeout contracts; no exactly-once network-delivery claim. |
| FR059 | P2 | Core | Signed source/event/ingest/accuracy/calibration/late observations; older GPS cannot replace newer state. **Gate:** vendor timestamp/signal-quality commissioning. |
| FR060 | P2 | Partial | Role-scoped connected tables and operational references. **Code:** live map, complete cross-company field-sharing policy and joined operational/billing control tower. |
| FR061 | P2 | Partial | Fresh-signal ETA rule and explicit unknown state. **Code:** route deviation/dwell/geofence evaluation. **Gate:** licensed route data/lane validation. |
| FR062 | P3 | Core | Unique handling units, shipment-line allocation and separate optional returnable-asset link. **Gate:** genuine GS1 allocation/partner conventions; internal IDs are not certified identifiers. |
| FR063 | P3 | Partial | Scoped deduplicated custody scans and reasoned mismatch outcomes. **Code:** planned-movement missing-unit escalation and warehouse native scan flow. **Gate:** scanner/dock field test. |
| FR064 | P3 | Core | Parent-child aggregation/disaggregation history with cycle/allocation checks; GPS is not unit receipt. **Gate:** repacking/custody UAT. |
| FR065 | M | Partial | Contract-entitled phase enablement and roles; freight invoicing is separate. **Code:** granular usage limits and commercial subscription billing. |
| FR066 | M | Core | Owner archive streams records, clean originals/versions, sealed payloads, audit and checksum manifest with budgets/interruption audit. **Code:** automated import/restore and partitioned export jobs. **Gate:** reconciled full customer export and restricted-data policy. |
| FR067 | M | Partial | Closing blocks processing; legal holds and two-person retention review. **Code:** deletion execution, export-window expiry, backup disposal and scheduled retention. Approval alone does not dispose of data. |
| FR068 | P2 | Absent | Named human memberships exist. **Code:** SAML/OIDC SSO and scoped API machine-account lifecycle. |
| FR069 | M | Partial | Native barcode resolves assigned cached consignment identifiers without fetching scanned URLs or accepting POD. **Code:** invoice barcode mappings. Optional OCR suggestions are not implemented. |
| FR070 | P2 | Core | Provider/entity mapping with source/validity and ambiguity rejection. **Code:** vehicle/driver master adapter for the selected authoritative system. |
| FR071 | P2 | Core | Vendor serial/capability/firmware/approval/calibration, Ed25519 identity, revocation and assignment history. **Gate:** real key rotation/enrollment and hardware commissioning. |
| FR072 | P2 | Partial | Signed tenant/device/assignment validation, replay checks and late-state protection. **Code:** vendor MQTT/HTTPS adapters and independent partitioned telemetry path; current ingestion uses core entity transactions. |
| FR073 | P2 | Partial | Last source/position/time and stale state are exposed. **Code:** complete map, stopped-versus-offline classification and trip visibility. |
| FR074 | P2 | Partial | Temperature/fuel/humidity rules with duration/hysteresis/health/calibration guards. **Code:** geofence/dwell/idle/deviation/signal-loss and customer/class inheritance. |
| FR075 | P2 | Partial | Severity/owner/evidence, reasoned review history and scheduled unresolved-alert notifications with provider outcomes. **Code:** staffed escalation tiers and alert-specific response/delivery presentation are incomplete. **Gate:** actual staffed operating model. |
| FR076 | P2 | Partial | Authenticated customer/site scope restricts fields and shipments. **Code:** separately scoped expiring/revocable tracking links. Dedicated customer mobile app is optional. |
| FR077 | P2 | Partial | Straight-line fresh-GPS ETA exposes rule/time/uncertainty or unknown. **Code:** traffic/weather routing, measured arrival error and predictive models. **Gate:** sources and lane calibration. |
| FR078 | P2 | Partial | Sensor source/units/health/calibration and eligible threshold checks. **Code:** vendor normalization and complete cargo/door/tamper workflows. **Gate:** calibrated hardware and cargo SOP. |
| FR079 | P2 | Partial | Restricted safety-event metadata/evidence references. **Code:** camera clip ingestion, immutable clip validation, audited clip retrieval and retention. |
| FR080 | P2 | Partial | Provider detection/confidence, human review, false-positive and coaching outcomes. **Code:** full vendor clip linkage/correction lifecycle. **Gate:** driver privacy and SOP. |
| FR081 | P2 | Partial | Driver/trip/device-bound breath records, calibration checks and dispatch hold. **Code:** vendor result authentication and safe-stationary check request flow. **Gate:** calibrated devices/dispatch SOP. |
| FR082 | P2 | Core | No vehicle actuator command exists; dispatch decisions are records. **Gate:** any physical prestart interlock is separately engineered and accepted by the vendor/customer. |
| FR083 | P2 | Partial | Versioned scoring inputs/exposure and no-data handling. **Code:** supervisor incentive approval and correction/reissue lifecycle. No payroll/discipline execution. |
| FR084 | P2 | Partial | Fuel observations and investigation thresholds. **Code:** refuel/receipt/FASTag toll reconciliation and expenditure dashboard. |
| FR085 | P4 | Partial | Maintenance due records and completion history. **Code:** odometer/fault/TPMS adapters and validated predictive model. |
| FR086 | P3 | Partial | Site/customer stock-authority guard and approved stored-movement export. **Code:** selected WMS master/ASN/reconciliation adapter. **Gate:** one stock authority per site/customer. |
| FR087 | P3 | Core | Owner/site/bin/SKU/unit/lot/condition stock, exact movements/reservations and serialized guards. **Code:** complete serialized-item and cross-owner transfer workflows. **Gate:** deployed concurrency/reconciliation. |
| FR088 | P3 | Partial | Expected/accepted/damaged/short receipt with damaged stock and separate ERP posting status. **Code:** persistent ASN tasks, quarantine release, directed putaway and handheld UI. |
| FR089 | P3 | Partial | Scoped reservation/cancel, SKU/bin/unit match and one-time pick/dispatch movement. **Code:** separate loading, serial verification and supervisor mismatch override. |
| FR090 | P3 | Partial | Source/confidence counts, expected snapshot, independent approval and stale-stock recount guard. **Code:** assigned blind/recount tasks and drone adapter. |
| FR091 | P3 | Partial | Duplicate/missing/unexpected/ambiguous dock reads do not post stock or POD. **Code:** portal transport/direction inference and reconciliation closure. **Gate:** measured portal pilot. |
| FR092 | P3 | Partial | Returnable owner/custodian/location/condition/due date and issue/return/loss/repair/retirement history. **Code:** partner disputes and agreed charge rules. |
| FR093 | P3 | Absent | **Code:** line-side replenishment/container/time requirements and milk-run execution. Delivery transport proposals are not a line-feeding system. |
| FR094 | P4 | Partial | Mission records and guarded lifecycle states. **Code:** actual WCS/fleet-manager transport and hardware dispatch. |
| FR095 | P4 | Partial | Commissioning and mission/count foundations. **Code:** AMR/AGV/drone connectors and complete pilot lifecycle. **Gate:** permissions, safety owner, fallback and measured site trial. |
| FR096 | P4 | Partial | Source/method/confidence estimates require physical review and cannot rewrite stock directly. **Code:** calibrated tare/model execution, mixed-content checks and adapters. |
| FR097 | P4 | Absent | **Code:** versioned layout, slotting recommendations and validated simulation/digital twin. |
| FR098 | P2 | Partial | Fixed/per-km snapshot audit and maker-checker export approval. **Code:** vehicle-class, detention/surcharge/POD tolerance rules and actual ERP payment-export mapping. No bank transfer. |
| FR099 | P4 | Partial | Constrained delivery-only proposals expose infeasible/unserved work and require reviewed release. **Code:** optimizer, pickup/backhaul matching and complete duty/time-window routing. Public marketplace is separate scope. |
| FR100 | P4 | Absent | **Code:** customs OCR/proposals, approval and filing/acknowledgment connector. No official clearance is generated. |
| FR101 | P2 | Partial | Exact activity/factor calculations with source/version/boundary/quality and review. **Code:** complete load/empty-leg allocation, named OEM format and correction/reissue. **Gate:** licensed factors/sustainability review. |
| FR102 | P4 | Absent | **Code:** scoped evidence-citing planner copilot and approved action workflow. |
| FR103 | P2 | Partial | Phase entitlements, roles and customer/warehouse scope. **Code:** contract-granular module/white-label configuration and machine-client scopes. |
| FR104 | P2 | Partial | Checklist/test/support references, payback calculation and approved management exception. **Code:** signed artifact validation and full rollout lifecycle. **Gate:** signed commissioning, measured savings and investment approval. |

## Nonfunctional acceptance

No numeric target is claimed from a unit-test pass.

| ID | Source safeguard | Remaining work and acceptance evidence |
|---|---|---|
| NFR01 | Pagination/import/export bounds and SQL query primitives. | **Code/Gate:** many queries still materialize tenant collections and tenant writes serialize. Measure/refine 10 tenants, 100,000 shipments/month, 500 users. |
| NFR02 | Durable transactions/outbox and bounded requests. | **Gate:** mixed 30 requests/s sustained and 100/s five-minute burst. |
| NFR03 | Indexes and statement/lock timeouts. | **Gate:** P95 reads under 500 ms and writes under 800 ms at target load. |
| NFR04 | Durable acceptance/packet/readiness jobs. | **Gate:** P95 readiness within 60 seconds after the final blocker, including backlog/restarts. |
| NFR05 | Separate services and dependency readiness. | **Gate:** actual HA hosting, alerts and measured 99.9% monthly service availability. |
| NFR06 | Versioned objects, immutable hashes and migrations. | **Gate:** matched DB/object PITR, quarterly measured RPO ≤15 minutes/RTO ≤4 hours. |
| NFR07 | SQLCipher, 100 metadata drafts/300 MiB media, 80% warning and retry/close guards. | **Gate:** signed native 24-hour/restart/low-storage/reconnect matrix. Mocked storage tests do not validate the native cipher. |
| NFR08 | Tenant/customer/site/attempt tests, runtime-role guards and RLS. | **Gate:** deployed export/object/cache/worker/provider isolation and independent adversarial review. |
| NFR09 | Sealed snapshots, append-only history, hashes and linked corrections. | **Gate:** original retrieval after real restore and deployed-credential overwrite tests. |
| NFR10 | Stable IDs, worker leases, refresh serialization and uncertain-write reconciliation. | **Gate:** actual provider crash/timeout/replay tests; no exactly-once network claim. |
| NFR11 | Semantic controls and explicit review/focus handling. | **Gate:** critical-flow keyboard/screen-reader/contrast/touch review against WCAG 2.2 AA. |
| NFR12 | Browser and Android source/configuration. | **Gate:** agreed Chrome/Edge/Safari and manufacturer/Android matrix, signed install/upgrade. |
| NFR13 | Correlation IDs, audit/outbox and tenant backlog health. | **Code/Gate:** deploy centralized metrics/traces/alerts and trace acceptance through packet/message/billing. |
| NFR14 | MFA/step-up/revocation, encrypted secrets, quarantine and restrictive release config. | **Gate:** current dependency scan and independent assessment with no unresolved agreed critical/high findings. |
| NFR15 | UTC times, site/scheduler zones and redacted errors. | **Gate:** synchronized clocks, approved log geography/retention and retrieval/incident drill. |
| NFR16 | Bounded record/object archive with checksum manifest. | **Code/Gate:** partitioned exports/restore tooling and reconciled customer archive drill. |
| NFR17 | Signed deduplicated ingestion. | **Code/Gate:** separate telemetry ingestion/store; 200 vehicles and 100 events/s reconnect test without receipt degradation. |
| NFR18 | Durable observations with separate source/ingest time. | **Gate:** P95 visibility within five seconds, reporting source delay separately. |
| NFR19 | Durable sensor rules and shift-aware scheduled alert notifications. | **Code/Gate:** the current worker sweep is 60 seconds and does not guarantee the 30-second target; implement/measure the accepted fast alert path and staffed escalation. |
| NFR20 | Signed tenant/device scope, revocation, interval/replay tests. | **Gate:** real gateway key rotation/revocation and MQTT topic permissions if selected. |
| NFR21 | Exact stock movements, owner/site scope, retries, serialization and stale counts. | **Gate:** scanner concurrency and authoritative WMS reconciliation. |
| NFR22 | Score contributions/policy and factor/input snapshots retained. | **Code/Gate:** complete correction/reissue lineage and reproducible released reports on approved golden data. |

The SRS acceptance scenarios remain customer UAT work. Record the tested commit, configuration, actors, data and actual outcome. Missing workflows, unsigned native builds and unavailable providers must stay explicit untested/failed boundaries; related unit tests cannot turn them into passes.
