# CargoOrbit

Delivery evidence, authorized receiver acknowledgement, billing readiness and freight collections for Indian transport operations. Built from the supplied Viskan SRS v2 (24 October 2026), with CargoOrbit as the product name.

**Status: hardened release candidate; production acceptance remains gated.** The repository includes the web portal, API/worker, Android source, migrations, deployment/recovery tooling and automated regression suites. M delivery/billing controls and phase-gated P2/P3/selected P4 workflows are implemented to the boundaries below. This does not claim all 104 SRS requirements or real provider/device acceptance are complete. See [requirement coverage](docs/REQUIREMENTS.md) for exact boundaries and [release gates](docs/OPERATIONS.md) before real customer use.

## Applications

| Component | Implementation |
|---|---|
| Web | Next.js 16 / React / TypeScript; role-aware operations, receiver and finance workspace |
| API | NestJS; validated workflow actions, JWT sessions, membership checks, receiver challenge binding |
| Database | PostgreSQL; forced tenant RLS, non-owner runtime role, immutable accepted PODs, audit and transactional outbox |
| Worker | PostgreSQL durable outbox, bounded retry, evidence PDFs and manifests |
| Driver | Expo / React Native Android, SQLCipher encrypted per-user queue, camera, barcode lookup, restart-safe synchronization |
| Evidence | Private versioned S3 in production; local content-addressed storage for development; ClamAV scan gate |
| Expansion | Signed device observations, reviewed safety, inventory and returnables, emissions lineage, freight audit, investment and mission workflows |

## Run locally

Requirements: Node.js 24, npm, Docker Compose (or PostgreSQL 17 and ClamAV), an Android development environment for the native app.

```bash
cp .env.example .env
# Edit all passwords and generate distinct JWT_SECRET / OTP_SECRET.
npm ci
docker compose --profile scanner up -d
npm run db:migrate
npm run db:provision
npm run build -w @cargoorbit/database
npm run build -w @cargoorbit/domain
npm run db:seed
npm run dev
# In another terminal:
npm run worker
```

Open http://localhost:3000. API: http://localhost:4000/v1. Development API explorer: http://localhost:4000/v1/docs.

Seeding creates fictional companies and six consignments. Sign in with `owner@cargoorbit.test`, `operations@cargoorbit.test`, `receiver@cargoorbit.test`, `customer_admin@cargoorbit.test`, `finance@cargoorbit.test`, `customer_finance@cargoorbit.test`, or `driver@cargoorbit.test` using **your own `SEED_PASSWORD`**. It never sends messages and refuses production execution or an existing demo tenant.

For local-only photo experiments without ClamAV, `MALWARE_SCANNER=development-clean` is an explicit unsafe development bypass. Production rejects it. Do not use real evidence with that setting.

Development receiver OTPs are held in process memory and available only to the receiver account through `GET /v1/dev/otp`. Production disables this route and requires a configured message adapter. Self-service contact verification supports email and E.164 phone contacts, requires fresh authentication and a delivered OTP, and revokes sessions/receiver grants on change. Approved message templates and provider acceptance remain prerequisites for live delivery.

### Walkthrough

1. Operations adds organizations and sites, creates a consignment and plans a trip with allocated line quantities.
2. Driver captures milestones and photos. Operations or receiver prepares reconciled receipt quantities and reservations.
3. Customer administrator enrolls an active receiver, grants facility authority and may revoke it. Transport staff cannot appoint receivers.
4. Receiver reviews the draft and attachments, explicitly consents, requests an OTP and confirms online.
5. The accepted version becomes immutable. The worker generates its PDF and hash manifest. Corrections create a new linked draft.
6. Finance clears policy blockers, records external invoice issuance and actual submission, then customer acceptance and separate payment allocations.

Structured screens support receipt snapshots, evidence downloads, versioned policies, allocations, disputes, membership administration, scheduler rules, legal holds and retention requests. Pilot usability and browser accessibility review remain release gates.

### Android

```bash
# Ensure EXPO_PUBLIC_API_URL points to your reachable API (HTTPS for release).
cd apps/mobile
npx expo run:android
```

SQLCipher requires a custom native build; **Expo Go is unsupported**. A per-account KeyStore-backed encryption key isolates cached assignments and drafts. Reopening the app restores pending operations; reconnect/foreground/manual retry uploads with stable identifiers. Failed persistence is shown as an error. This repository includes a reproducible local Gradle build and native diagnostic workflow. Signed-device acceptance is still required; the reviewed build-tool mitigation does not change the unresolved upstream advisory. Run the device acceptance matrix in `docs/OPERATIONS.md`.

## Verification

```bash
npm run typecheck
npm test
npm run build
cd apps/mobile && npx expo install --check
```

Tests include genuine PostgreSQL SQL/RLS execution using PGlite plus transactional domain and expansion cases. These do not replace hosted PostgreSQL load/recovery tests, real SMS/ERP sandbox certification or Android hardware testing.

## Production administration

Use `scripts/provision-account.ts` to enroll an initial verified owner/customer administrator with an MFA secret and sponsor reference. Customer staff invitations are created by their customer administrator via `/v1/admin/invitations`; normal transporter invitations are created by the tenant owner. Invitation tokens must be securely delivered to verified contacts. Existing-account linking authenticates the existing password/MFA and rechecks the inviter's current scope; it never replaces account credentials. Refresh tokens rotate, reuse revokes the session, and sensitive changes require a short-lived scoped reauthentication token. See [API contract](docs/API.md).

## External services and later phases

No ULIP, e-way government write, GST, SAP, GPS vendor, WMS vendor, eSign, bank or robotics credential is included. No official status is fabricated. Local compliance tasks do not extend e-way bills. Telemetry does not establish goods receipt. Safety warnings need human review; no vehicle actuation or bank transfer endpoint exists. An approval-gated HTTPS provider gateway supports permitted read/write/reconciliation contracts, but no provider-specific operation is enabled without credentials, purpose/expiry approval and sandbox evidence. Reviewed route plans and rule-based ETA are available; optimizing solvers, AI, customs filing and a validated digital twin remain separate roadmap work.

Deploy using [the infrastructure guide](infra/DEPLOYMENT.md), the Render Blueprint, or `compose.production.yaml`; run `node scripts/release-readiness.mjs` against the target environment and actual per-commit acceptance evidence. Missing evidence intentionally blocks release. See [validation results and open gates](docs/VALIDATION.md).

Read [Architecture](docs/ARCHITECTURE.md), [Requirements](docs/REQUIREMENTS.md), [Operations](docs/OPERATIONS.md), and [API](docs/API.md). The original specification is preserved in [docs/SRS.md](docs/SRS.md).
