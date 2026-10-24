# Persistence

`Database` implements the domain transaction port using PostgreSQL. A single transaction sets `app.tenant_id` locally, acquires a tenant advisory lock, and performs all reads, writes, audit inserts and outbox inserts on the same connection. This is compatible with transaction pooling. Tenant transactions currently serialize deliberately; run the SRS capacity test before claiming its throughput targets. `MemoryDatabase` provides rollback and serialized mutation for unit tests only.

Business metadata is stored as versioned JSONB entities inside a tenant namespace. Domain services validate every relationship and state transition. This first implementation uses flexible entity payloads rather than a normalized table per aggregate. The composite primary key, a JSON identity constraint, tenant payload check, forced RLS, transaction-local context and application authorization form independent scope checks. As volumes grow, migrate hot aggregates to dedicated normalized tables without changing the domain transaction port.

Run `MIGRATION_DATABASE_URL=… npm run db:migrate` using a migration owner able to create the `cargoorbit_app` group role. The API and worker must instead use a non-owner LOGIN role without `SUPERUSER` or `BYPASSRLS` and membership of `cargoorbit_app`. The database adapter rejects unsafe runtime credentials on first use. Configure TLS through the connection URL or the managed provider's trusted certificate configuration; no certificate checks are disabled by code.

Example operator provisioning (replace the password using a secret manager, outside source control):

```sql
CREATE ROLE cargoorbit_runtime LOGIN PASSWORD '<generated-secret>' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT cargoorbit_app TO cargoorbit_runtime;
```

Auth tables are `users`, `memberships`, and `tenants`. Email uniqueness is case insensitive. Login and membership resolution need global auth reads; business exports never query those tables directly. Tenant IDs must come from a validated membership, never a posted body or arbitrary header. The API revalidates membership and session version for each token. Restrict direct database access and use separate credentials for migration, runtime and backup administration.

`tx.list('audit')` and `tx.list('outbox')` expose tenant scoped records from dedicated tables. Audit events cannot be updated or deleted by the runtime role, and a trigger also prevents mutation. Outbox events have immutable identity and payload; workers may advance lifecycle state, attempt count and retry time through `tx.put('outbox', event)`. Emitting an event must happen in the same transaction as its business change. Provider calls still require their own idempotency/reconciliation contract.

Tenant `closing` status permits authorized reads and audit records while rejecting new processing. `closed` blocks application transactions. Account deletion does not automatically delete evidence or legal holds. Production backup/PITR, evidence snapshots, retention jobs and recovery drills are deployment responsibilities and remain release gates.

## Release hardening

Numbered migrations are discovered from the bundled SQL directory, applied atomically under a migration advisory lock and recorded with SHA-256 checksums. Already applied migrations must not be edited; add the next numbered migration. The original checksum-less baseline is adopted once without rerunning it. `002_release_hardening` adds session/contact state, LR/invoice uniqueness, history/provenance triggers, query indexes and worker lease tokens.

`tx.find(kind,{where,before,limit,offset})` applies a JSONB containment filter in SQL with a 500-row ceiling; `tx.count(kind,where)` counts matching records without materializing them. These methods currently apply only to business entities. Role, organization, site and assignment filters remain the caller's responsibility; tenant isolation is enforced in the adapter and database. Legacy `list` remains for atomic aggregate business logic and must not be used to claim high-volume query scalability.

Worker methods `claimOutbox`, `completeOutbox`, and `failOutbox` use an independent short transaction. Claims use `FOR UPDATE SKIP LOCKED`, a bounded lease and a new random token each time. A worker must pass that same token on completion/failure; a previous worker cannot finalize after another claim. The methods return `false` for a lost lease. External providers still need idempotency keys to avoid duplicate side effects after an uncertain timeout.

Statement/lock timeouts are bounded (`DB_STATEMENT_TIMEOUT_MS`, `DB_LOCK_TIMEOUT_MS`). Runtime credentials may not create roles/databases or objects in the public schema. Business transactions pin a safe search path. Append-only history and accepted evidence cannot be purged through normal APIs; approved retention disposal requires a separately controlled maintenance procedure that verifies legal holds and preserves its own audit trail.
