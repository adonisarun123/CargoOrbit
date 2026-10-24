# Production deployment and acceptance

The repository contains release hardening and executable workflows, but the complete SRS is not accepted for production. [REQUIREMENTS.md](REQUIREMENTS.md) identifies missing code separately from external release gates. [VALIDATION.md](VALIDATION.md) records what was actually tested. Do not infer a deployed service, signed Android app, provider approval, SLA or restore result from a successful build.

## Before scheduling a release

Agree which SRS requirements the release will support and resolve or explicitly defer the corresponding code gaps. The important remaining implementation work includes:

- Complete M workflows: shipment/stop invitations, immediate no-authorized-receiver escalation, complete task ownership/aging/escalation and approved temporary support access. Quantity conversions/tolerances/overdelivery, accepted-correction review closure and issue-date calendar payment terms are now implemented and need customer UAT.
- Notification coverage: the scheduler handles pending receivers, recorded e-way validity, invoice-issue review, overdue invoice balances and unresolved P2 sensor alerts. Reassignment notifications, escalation tiers, per-site shifts and overnight shifts remain absent. The 60-second worker sweep cannot establish the SRS 30-second alert target.
- Retention execution: legal holds and reviewed requests are records, not an automated deletion/export-window/backup-disposal engine.
- Scale: many core queries materialize tenant collections; tenant business transactions serialize. Telemetry currently shares that path and is not a separate partitioned ingestion service.
- Contracted P2/P3/P4 capability: SSO/service accounts, provider-specific mappings, full fleet rules/map, complete WMS handheld/ASN/putaway flows and advanced optimization/customs/copilot modules remain incomplete. A phase entitlement is not evidence that these features exist.

Do not configure placeholder providers or enable unfinished modules as though they were live. Optional customer apps, OCR and XLSX import must not be confused with the SRS's mandatory browser, barcode and CSV paths.

## Deployment sequence

1. Select the customer-approved geography, hostnames and subprocessors. Provision separate development, staging and production environments; PostgreSQL with tested backups/PITR; private encrypted versioned S3; ClamAV with current definitions; application compute; TLS; and a secrets manager. Record an operational owner for each dependency.
2. Use the supported Node version declared in package.json. Run npm ci, the checks in VALIDATION.md and npm run build against the intended release commit. Build-time NEXT_PUBLIC_API_URL must point at the correct API. Keep development seeds and fake scanner/messaging modes out of production.
3. Apply numbered migrations with MIGRATION_DATABASE_URL and npm run db:migrate, using the separate migration credential. Provision the runtime login with npm run db:provision. The deployed API and worker must use a non-owner login without superuser, BYPASSRLS, database/role creation or schema ownership privileges. Run the runtime-role and tenant-isolation checks using that exact credential. See [database deployment notes](../packages/database/README.md).
4. Populate the current [.env.example](../.env.example) through the host secret manager. JWT and OTP secrets must be distinct; MFA_ENCRYPTION_KEY must be a unique 32-byte hex key. Set explicit HTTPS WEB_ORIGIN values, database TLS, private bucket and region, ClamAV and approved OTP adapter. Configure only explicit trusted proxy CIDRs; never trust arbitrary forwarded headers.
5. Give the runtime storage identity only the required bucket/object/version operations. Startup/readiness verify S3 versioning, encryption and public-access controls in production. Verify denial of anonymous object access and retrieval of an exact historical version. Storage checks do not establish backup recoverability or a retention policy.
6. Provision initial privileged accounts with scripts/provision-account.ts, a named sponsor verification reference and securely delivered authenticator seed. Use the documented operator flow rather than demo credentials. Confirm customer organization/facility scope and receiving authority separately from the ability to sign in.
7. Deploy three services: API with npm run start -w @cargoorbit/api, web with npm run start -w @cargoorbit/web, and worker with npm run worker. The common Docker image needs the appropriate command override per service. Configure restart policy, resource limits, termination grace, outbound controls and dependency monitoring in the actual host.
8. Configure invitation, OTP and scheduled-notification adapters with approved destinations/templates. The notification gateway must honor the stable notification idempotency key and return a stable provider reference. Configure and test signed callbacks before claiming delivered status. An accepted message request is not recipient delivery or human approval.
9. Configure the tenant scheduler deliberately: time zone, weekdays, holiday dates, daytime start/end hour, lead times and recipient. It currently supports one tenant schedule/contact and daily deduplication; receiver timing uses the consignment policy when present. It rechecks shift and unresolved state before sending and defers out-of-shift work. It is not a general staffing calendar. An invalid overnight interval is rejected; do not represent it as covered.
10. Enable selected provider integrations only after implementing and testing the actual provider contract. Supply current approved configuration and secret references; default integration configuration is empty. Read [INTEGRATIONS.md](INTEGRATIONS.md) for the fixed HTTPS gateway contract, purpose/dataset restrictions and reconciliation behavior. No environment variable creates a real ULIP, ERP, eSign or WMS vendor adapter.
11. Build and sign the Android application using [apps/mobile/README.md](../apps/mobile/README.md). Release/preview profiles require HTTPS API configuration. Install the signed build on the approved fleet devices and complete native acceptance before distributing it to drivers.
12. Run the agreed end-to-end acceptance scenarios in staging, capture the release commit/configuration and retain the evidence below. Release only the accepted scope and establish rollback and incident ownership before moving traffic.

The Compose file is local development infrastructure, not production HA orchestration. Infrastructure, DNS, TLS, signing credentials and production accounts are not supplied by the repository.

## Identity and account operations

Access tokens last 15 minutes; refresh tokens rotate once within a fixed 30-day session lifetime. Web and Android clients serialize refresh and persist the new session before retrying. An uncertain refresh result requires reauthentication rather than replaying a possibly consumed token. Never copy refresh tokens into logs, tickets or shared command histories.

Password changes revoke all sessions. A verified contact change invalidates sessions and receiver authority as implemented; re-enroll receiving grants only after customer approval. Member suspension and session revocation must be tested across open browser tabs and mobile sync. Reusing a TOTP code for a second sensitive action is rejected; wait for a fresh authenticator code.

Customer administrators appoint their own receiving staff; transporter administrators do not appoint alternates for them. Privileged administrator recovery remains a controlled operator procedure. SSO and scoped service accounts are not implemented. Temporary elevated support grants are also absent: do not work around that gap with unrestricted customer sessions or direct production record edits.

## Health, alerts and worker recovery

- /v1/health/live checks process liveness. /v1/health/ready (and /v1/health) check database, evidence-storage configuration and scanner availability. These checks do not prove notification delivery, complete object readability, backup freshness or business latency.
- /v1/health/workspace is authenticated and tenant scoped; authorized operators can inspect pending/dead jobs and oldest pending age. No unauthenticated global backlog is exposed.
- Monitor worker heartbeat, backlog age, dead letters, scan failures, provider circuit/uncertain calls, storage failures, response latency and authentication failures. Deploy centralized metrics, correlation-aware logs and alert routing; source logging alone is not an operations center.
- Workers claim durable jobs with a lease token. A stale worker cannot complete another worker's claim. Retries are bounded; an external side effect still requires a provider idempotency/reconciliation contract.
- Investigate a dead job using its event ID, tenant, correlation ID and referenced business record. Confirm the provider outcome before any replay. A lost response must not cause a second invoice, mission or other non-idempotent operation.
- There is no general dead-letter replay UI. Use a reviewed operator procedure for any state repair and preserve its audit trail. Never modify the immutable event payload, accepted POD or object reference to force a retry.

The current worker subscribes to evidence scan, POD acceptance and scheduled notification jobs. Other business events remain durable history and are audited without side effects. The scheduler separately queues unresolved sensor-alert reminders. A recorded alert or submitted reminder is still not delivered notification or human response, and staffed escalation tiers are not implemented.

## Evidence and receipt recovery

If an upload remains pending or failed, verify scanner connectivity/definitions, object version access and worker backlog. Quarantined or unverified bytes must not be shared or manually relabeled clean to clear a billing gate. A replacement upload is a separate object; an accepted attachment set must remain unchanged.

If a POD is stale, reload the current attempt/POD version and review the conflict. A rejected stale draft must not silently overwrite the newer draft. For accepted evidence, create a linked correction and obtain renewed acceptance. Submitted invoices keep their original packet reference. Finance may close the correction-review task with a reason and reference only after the linked correction has been accepted.

If a packet is missing, locate the pod.accepted job and verify the sealed payload and each original object version/hash before recovering generation. PDF and manifest must represent the exact acknowledged version. A successful PDF download is not an invoice submission.

Check body/upload limits at the reverse proxy as well as API limits. Avoid logging raw documents, OTPs, tokens, message bodies or sensitive provider responses. Treat image metadata as untrusted capture information.

## Android field operations

The queue separates tenant/user accounts and fails closed if the native SQLCipher capability is unavailable. It tracks up to 100 metadata drafts and a 300 MiB media budget with an 80% warning; photos have a separate size bound. Assignments older than 24 hours block new capture pending refresh, while existing queued work remains available for recovery.

Queue states distinguish local persistence from server receipt. Transient failures receive bounded retry; stale, forbidden or invalid work is held for review. Failed drafts have an explicit server comparison, a five-minute freshness limit and a reasoned replacement that preserves the original payload/hash and evidence links. Finalized or reassigned attempts cannot be replaced. Metadata-only escalation is durably queued offline and shown as synchronized only after the server acknowledges a task; a revoked assignment may also deny escalation, requiring authorized operations to review the retained device capture. Manual retry does not override authority, state conflicts or content validation. Do not clear app data, uninstall or delete a queue to make an error disappear while unsynchronized evidence remains.

Sign-out waits for in-flight queue work and separates accounts. Reauthenticate the same authorized account to recover its pending work. Test revocation and account switching with live uploads, camera capture and refresh in progress. Background/terminated operation is not represented as uninterrupted background synchronization.

Camera and multipart upload operations temporarily create plaintext JPEG files in the private app sandbox, then remove them. Startup/sign-out clean matching upload temporary files; this is not forensic secure deletion. Confirm device encryption, backup restrictions and the organization's lost-device procedure. See the native testing guide for the exact test matrix and unresolved build/device evidence.

## Provider uncertainty and connected modules

A write attempt that times out stays uncertain. Query/reconcile using the original operation and business-record identity before any new operation. Provider lookup must not execute the write again. Confirmed gateway responses still require the provider-specific authenticity/mapping checks specified by the contract.

Manual e-way references and compliance outcomes remain attributed records. Local task completion is not an official extension; only an authorized official response can establish that result. eSign request/reconciliation does not by itself establish a validated signed document.

Before warehouse writes, select and record the authoritative stock system for each site/customer. Reconcile stock, reservations and movements with that authority; do not operate a second uncoordinated WMS. Portal reads, GPS, robot outcomes and weight/vision estimates never establish accepted goods receipt by themselves.

Device credentials, calibration and assignment periods require actual commissioning. Rule alerts are investigation/review evidence. No cloud vehicle actuator or bank-payment command exists. Robot transport, low-level motion safety and physical interlocks remain outside this implementation.

## Backup, export, retention and closure

Back up PostgreSQL and matching versioned evidence inventories together. Preserve encryption-key recovery under separately controlled access. Restore into an isolated environment; verify accepted payload hashes, original object versions, packet links, audit counts, receipt balances and pending jobs before allowing outbound messages or provider calls. Measure RPO/RTO and record the actual drill result; the SRS targets are not assumed from a hosting plan.

The owner archive is a streamed tar.gz containing tenant records, accepted payloads, clean evidence/packet bytes and an audit/checksum manifest. Sensitive challenge/invitation/credential records, raw integration-call results and quarantined object bytes are excluded. Verify every manifest checksum, referential link, balance and record count after export. Budget overflow or interruption produces an incomplete archive: do not treat a partial download as a successful export. Large partitioned export and import/restore tooling remain engineering work.

Legal holds and retention requests require tenant authority; a different authority must review retention requests/release holds. Approved requests remain marked for operator reconciliation and do not delete data. Before disposal, agree a matrix for original evidence, financial records, telemetry, local drafts, audit/logs, backup versions, legal holds and export windows.

Closing stops new business processing; closed blocks application transactions. Coordinate the export window before closing access. Tenant status transition and disposal need a separately controlled operator procedure. Immutable database triggers are not a retention implementation and must not be casually disabled. Track approved exceptions and preserve the maintenance audit.

Raw integration-call results are excluded from the general archive. A separate provider-data export requires an explicitly approved dataset/redistribution policy. Database/cloud administrators remain privileged outside normal application controls and need independently controlled/audited access.

## Required release evidence

| Gate | Evidence to retain |
|---|---|
| Customer scope | Accepted SRS subset, named business/receiving/finance owners, receipt wording, authority/delegation, GRN/paper/claims and billing-trigger decisions. |
| Native Android | Signed APK/AAB identity and installed device matrix; SQLCipher proof; 24-hour, 100-draft, 300 MiB, force-stop/reboot, low-storage, camera interruption, account switch, revoked assignment, token expiry and reconnection results. No native build/device success is implied by current source tests. |
| Browser | Receiver quantities/reservations/consent/attachments/OTP; correction/concurrency/multi-stop/finance scenarios; keyboard, screen-reader, contrast and touch checks on agreed Chrome/Edge/Safari versions. |
| Isolation/security | Exact runtime-role RLS and customer/site/object/export tests; proxy/rate limits; current dependency results; independent preproduction findings and remediation; enrollment/recovery/revocation drills. |
| Load/latency | Agreed mixed-tenant 30 requests/s and 100/s burst, 500 users, upload/worker bursts; billing readiness within 60 seconds; P2 telemetry reconnect and alert targets after the required ingestion separation and faster alert path are implemented. |
| Recovery/privacy | Matched DB/object restore with measured RPO/RTO, verified archive, key recovery, legal-hold/closure/disposal procedure and log location/retention drill. |
| Providers | Actual approved contracts/mappings, purpose/dataset permissions, expiry/revocation, signature/callback verification, duplicate and uncertain-timeout reconciliation. |
| Devices/warehouse | Calibrated hardware, assignment/key lifecycle, safe operating procedure, scanner/portal concurrency and one authoritative inventory ledger. |
| Operations | Named on-call owner, dependency/queue/provider alerts, correlation trace, rollback plan, incident exercise and acknowledged residual gaps. |

Execute the SRS acceptance scenarios against the final release candidate. Record passes, failures and untested cases individually. The customer UAT and external operator gates cannot be replaced with a blanket “production ready” label.

## Background exports and task operations

Owner export requests run through durable outbox jobs. Allocate an encrypted staging volume with at least the configured archive budget plus 256 MiB free; the reference deployment gives the worker a dedicated directory. Only one export runs per worker, while other slots process evidence and notifications. Worker startup removes only abandoned `cargoorbit-export-*` directories older than 24 hours. The process aborts generation when its outbox lease cannot renew; a run token prevents a replaced attempt from publishing or resetting another attempt's result.

Downloads address the exact stored version, verify SHA-256 while streaming and expire after seven days. Access expiry does not delete the source archive or satisfy retention disposal. The owner must compute the downloaded file hash and record a matching receipt reference before closure. The operator retention executor separately reconciles each exact object version and approved backup disposal. No cleanup or retention execution has been performed on real tenant data in this development session.

Task boards expose source-controlled generated tasks and separately editable manual tasks. Due dates, priority and role-matched assignments use expected-version checks and append history; financial/source closure cannot be bypassed with a task transition. Review tenant/site staffed schedules, overnight holidays, escalation contacts and fallback finance ownership with the actual operations team before enabling notifications.
