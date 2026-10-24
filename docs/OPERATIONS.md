# Deployment and acceptance

## Deployment

1. Choose customer-approved geography and subprocessors. Provision PostgreSQL backups/PITR, encrypted private S3 with public access blocked and versioning, ClamAV, application compute and TLS.
2. Run migrations using a separate migration credential. Provision a non-owner runtime login using `npm run db:provision`. Keep owner credentials out of deployed API and worker environments.
3. Set unique secrets through the platform secret manager. Production startup rejects missing secrets, public-origin configuration, local evidence storage, missing SMS configuration or malware scanner bypass.
4. Enroll initial administrators using `npx tsx scripts/provision-account.ts`, documented sponsor reference and securely delivered TOTP seed. Do not write secrets into shell history or repository files.
5. Build with `npm ci && npm run build`. Deploy API (`npm run start -w @cargoorbit/api`), web (`npm run start -w @cargoorbit/web`), and worker (`npm run worker`) as distinct services. Set NEXT_PUBLIC_API_URL before web build. Dockerfile is a common image; override command per service.
6. Configure the message adapter and approved contacts/templates. Test OTP expiry, retry lockouts and revocation with real sandbox accounts before live traffic.
7. Validate multipart upload limits at ingress, scan service health, object access, worker dead letters and correlation logging. Keep logs free of credentials, message bodies and sensitive raw data.

The included Compose file starts local PostgreSQL/optional ClamAV only. It is not a production orchestration or HA template. HTTP health checks confirm only basic DB reachability; add storage, scanner, queue lag and external provider health separately.

## Recovery and privacy

Back up PostgreSQL together with versioned evidence object inventories. Restore into an isolated environment and reconcile accepted payload hashes, object versions, audit counts and outstanding balances. Measure RPO/RTO; do not claim the SRS targets until a drill passes. Review local device draft retention separately from server evidence.

Legal hold, tenant export window, selective deletion, immutable evidence retention and backup expiration require an approved retention matrix and implementation. The closing tenant state stops new business writes, but automated retention disposal is not implemented. Database administrator access is privileged and must be independently controlled/audited.

## Required pilot checks

- Real fleet Android matrix: SQLCipher enabled, restart/force-stop, 24 hours offline, low storage, 100 drafts, 300 MB media, account switch, revoked assignment, duplicate upload, expired login, interrupted camera write and connectivity recovery.
- Browser QA: receiver screen keyboard/screen reader, explicit quantity/exception review, attachment download, OTP resend/expiry, concurrent correction and submission, multi-stop/reattempt allocations, payment withholding reconciliation.
- Customer approval: receiver authority enrollment, sponsor verification, receipt wording, GRN and paper policy, finance acceptance, correct contractual payment trigger.
- Load: SRS mixed tenant/read/write target, upload traffic, queue bursts and telemetry reconnects. Current tenant-wide serialization and in-memory list filtering need measurement/refinement before target scale.
- Security: dependency audit, independent penetration assessment, MFA recovery, trusted proxy/rate limit configuration, invitation delivery, secrets rotation, cross-customer exports and evidence links.
- Integrations: ULIP/source permissions and sandbox contracts, official status provenance, ERP duplicate/uncertain timeout reconciliation. None are implied by local test success.
- Full 38-scenario customer UAT in the SRS. Unit tests cover a subset, not a signed acceptance certificate.

## Known limitations

Nested allocation editors and CSV/JSON import are included; XLSX import is not implemented. No polished live fleet map, warehouse handheld UI, SSO, temporary support approval, dedicated customer app, AI/OCR, route solver, customs filing, robot connector or digital twin is supplied. Notification callback and holiday/shift escalation scheduling remain. Android signing and physical testing, production hosting, vulnerability scanning and backup restore validation are not completed in this development session.
