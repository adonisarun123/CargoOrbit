# Release infrastructure

The Dockerfile and production Compose file define API, worker, Next.js, ClamAV and a TLS reverse proxy. They are a reference single-host topology, not an availability certification. For redundant production, put API/web/worker replicas behind an approved load balancer and use managed PostgreSQL with PITR and private versioned object storage.

Build with `docker build --build-arg NEXT_PUBLIC_API_URL=https://<approved-domain>/v1 -t <registry>/cargoorbit:<commit> .`. Publish only after CI passes. Resolve the image to an immutable digest and set `CARGOORBIT_IMAGE` to that digest. Pin Caddy/ClamAV digests after your vulnerability review. Configure workload identity/IAM for S3; no static AWS credential is embedded. Compose credentials come from your deployment secret manager or a tightly permissioned environment file, never source control.

Run migrations and verified administrator provisioning as a separate operator job. The deployed API/worker runtime must not receive `MIGRATION_DATABASE_URL`, `ACCOUNT_PASSWORD`, `ACCOUNT_MFA_SECRET` or backup-owner credentials. MFA seeds are AES-GCM encrypted before database insertion. `ACCOUNT_VERIFIED_CONTACT` is recorded only alongside the operator's sponsor/verification reference; the script does not independently verify phone ownership.

`compose.production.yaml` requires approved database/provider/evidence settings. Execute `docker compose -f compose.production.yaml config --quiet` to validate without printing interpolated secrets. Start only after the release checklist is approved. Never run `docker compose config` without `--quiet` in shared logs because resolved environment values contain secrets.

Runtime database controls reject owner/superuser/BYPASSRLS/CREATEDB/CREATEROLE and schema CREATE privileges. Each request reestablishes a transaction-local tenant context. Outbox claims use SQL `FOR UPDATE SKIP LOCKED`; completion/failure checks a random lease token to fence an expired worker. Duplicate external side effects still require provider idempotency and reconciliation.

## Recovery

`scripts/backup-database.mjs` creates a consistent `pg_dump` archive plus a matching evidence inventory under a database exported snapshot. Requires PostgreSQL client binaries and an operator-only backup URL; output directory must be on encrypted storage. It never prints the URL or passes the password on the command line. Copy both files and immutable evidence objects/versions to the approved backup account. Do not mark a recovery point complete until all three are reconciled.

`scripts/restore-drill.mjs` refuses target database names not ending `_restore_drill`, refuses an existing schema, verifies the dump checksum, then restores into the isolated target and checks evidence inventory counts. It does not delete an existing database. Full object restore and application workflow replay remain part of your recorded drill, along with measured RPO/RTO.

## Release gates

Use `scripts/release-readiness.mjs` to check required configuration and the operator acceptance evidence file. This script never creates resources, sends notifications or enables government/device integrations. Missing approvals or verification artifacts produce a nonzero exit. Reference examples are in `infra/release-evidence.example.json`; editing JSON does not perform a penetration test, UAT or restore drill. Evidence references must identify work actually completed.

Provider sandbox contract tests, real Android device tests, independent security assessment, browser accessibility/end-to-end results, restored objects and measured load test outcomes must be supplied before launch. Region selection, sender/DLT approval, customer finance acceptance, security ownership and incident contacts are business/operational dependencies that cannot be fabricated by code.

Provider gateway credentials are named by `INTEGRATION_CONFIG_JSON`. Explicitly map each approved `CARGO_PROVIDER_*` secret into the API container through your secret manager; never mount an operator environment containing migration or enrollment credentials. Configure `TRUST_PROXY_CIDRS` for the actual trusted proxy network before enforcing public IP rate limits. The notification callback uses its own distinct HMAC secret.
