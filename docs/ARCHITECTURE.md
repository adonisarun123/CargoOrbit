# Architecture

CargoOrbit uses a modular TypeScript core with independent web, API, worker and Android processes. PostgreSQL owns business transactions. Private storage owns immutable original bytes; database evidence records bind exact object versions and SHA-256 checksums. File metadata is not trusted as proof of identity or occurrence.

## Data and tenancy

`entities` stores typed domain JSONB records under `(tenant_id, kind, id)`, indexed by customer and consignment. This compact baseline favors rapid domain iteration; normalize high-volume telemetry, stock and ledger tables with dedicated constraints as load measurements justify it. `users`, `memberships`, `tenants`, `audit_events`, `outbox_events` are relational tables.

Every business transaction sets a transaction-local tenant context and acquires a tenant advisory lock. The API verifies persisted sessions/membership on every request; business transactions recheck current session, membership and scope on their locked database connection. Rotating refresh tokens and short-lived scoped step-up tokens bind sensitive changes to the active account and workspace. Forced RLS protects business records, and application checks narrow organization, site, driver and role. A runtime startup guard rejects owner/superuser/BYPASSRLS credentials. Authentication directory tables are accessed by the trusted authentication/admin services and are not generally queryable through the workflow API.

The advisory lock deliberately serializes a tenant's business transactions to protect allocation and acceptance races. This is not an implementation of the SRS throughput target: measure contention, move query filtering/pagination into SQL and separate telemetry write paths before high-volume use. Current lists fetch a tenant resource then filter it in the service; suitable for controlled development datasets only.

## Acceptance

A draft is reconciled against an attempt's allocated quantities. Shortage is separate from physically received damaged/rejected goods. The server rechecks receiver grant, membership, expiry and the exact payload hash at confirmation. OTP verification failures commit their attempt counters instead of rolling back. The accepted payload, authority snapshot, hash, audit and outbox event commit together. SQL triggers prohibit changing or deleting accepted PODs. A correction is a new version, preserving prior invoice packet references.

## Finance

A versioned customer policy evaluates separate readiness blockers. Invoice issuance does not equal submission or acceptance. Due dates use the stored contractual trigger. Decimal arithmetic avoids binary float money drift. Cash, verified withholding and approved credits reduce unresolved balance; retention and disputed deductions remain visible and do not become fictional recoveries. External accounting owns statutory tax treatment.

## Reliability

A durable PostgreSQL outbox provides pending, processing, failed, completed and dead states, bounded retry and a lease for abandoned worker claims. Claims use SKIP LOCKED and lease-token fencing without acquiring the full tenant business lock. Packet jobs are idempotent. Notification provider requests carry stable IDs; provider-side idempotency is required. Full exactly-once behavior across a remote service cannot be assumed. PostgreSQL is used instead of a second Redis queue for this baseline to avoid a database/queue dual-write gap.

Android SQLCipher isolates local databases by tenant and user, with keys in the device secure store. Queue state is persisted before upload. Interrupted uploads retry using the original operation ID. Photos upload before dependent metadata. No offline action creates an authorized final customer acceptance. Native build/device tests are still required.

## Integration boundaries

Device observations use registered Ed25519 identities, assignment validity and event IDs. Source/ingest timestamps and late flags preserve provenance. Reviewed safety outcomes do not issue vehicle commands or automatic discipline. Inventory operations use one configured WMS authority and compensating movements. Third-party transport protocols remain unconfigured until access is approved; records never imply an official government response.

## Dependencies

Lockfile records installed dependencies. The current API/web production audit has zero findings; the mobile toolchain still has an unpatched upstream advisory. See [dependency review](../infra/DEPENDENCY_REVIEW.md). Re-run both checks for the release commit and periodically update supported releases. Official implementation references: [Next.js output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [NestJS authentication](https://docs.nestjs.com/security/authentication), [Expo SQLite / SQLCipher](https://docs.expo.dev/versions/latest/sdk/sqlite/).
