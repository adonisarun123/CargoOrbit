# Render deployment proposal

`render.yaml` is a reviewable proposal, not a deployed environment. The selected account workspace has no existing CargoOrbit services or PostgreSQL database. No paid resources were created. Singapore is proposed because Render offers no India region; the data owner must approve the region, processors and any transfer implications before deployment.

| Resource | Proposed allocation | Monthly compute estimate |
|---|---|---:|
| API | 0.5 CPU, 512 MB | $7 |
| Next web | 0.5 CPU, 512 MB | $7 |
| Worker | 0.5 CPU, 512 MB; one export at a time | $7 |
| Private ClamAV | 2 CPU, 4 GB | $85 |
| PostgreSQL 17 | 0.1 CPU, 256 MB; 5 GB storage | $6 |
| Total compute | Single-instance preproduction baseline | $112 |

Storage is additional: 10 GB export staging disk, 5 GB signature disk, and 5 GB PostgreSQL storage. Workspace fees, egress, S3/version backups, email/SMS providers, domain and tax are additional. These are minimum application plans for measured preproduction validation, not a capacity or availability guarantee. Upgrade only against approved budget and measured workload; the database plan has no high availability. Disks restrict replicas and require deploy downtime. The worker cleans its own old temporary archives; completed S3 archives remain subject to reviewed retention.

ClamAV allocation follows its documented minimum 3 GiB/preferred 4 GiB memory guidance, rather than using a 512 MB service. The pinned OCI image digest was resolved from the official `clamav/clamav:1.4.6` registry image on 2026-10-24. That version includes the August 2026 security fixes. Freshclam remains enabled. Before launch, verify signature freshness, EICAR rejection, startup/reload memory, scan timeout behavior, and vulnerability review of the pinned image. This session has not run that service.

The official published Render JSON schema validates this file. Render CLI 2.31.0 was downloaded with its published SHA-256 checked. Platform validation reached the authentication requirement; the connector's session is not a CLI login. Once an operator supplies a Render CLI login, run:

```sh
render blueprints validate render.yaml --workspace tea-d72dg9sg9agc7395kufg --output json
```

Validation does not create resources. Do not apply the Blueprint until region, recurring costs, DNS, processor approval, provider access, release evidence and operational ownership are agreed. Automatic deploys are disabled. No production credentials or sample providers are supplied.

## Provisioning sequence

1. Approve workspace, region, budget, public web/API domains and the exact release commit. Review the Blueprint plan before applying. Initial application deployments may fail closed until the restricted database role exists; no placeholder privileged URL should be used to make them start.
2. In a private operator environment, use the Render PostgreSQL owner URL as `MIGRATION_DATABASE_URL`. Build the separate Docker `operator` target or use the checked-out release with `npm ci`. Run `npm run db:migrate`, then `npm run db:provision` with a unique `RUNTIME_DATABASE_PASSWORD`. Migration 003 creates a NOLOGIN `cargoorbit_operator` role and grants it to the migration owner for cross-tenant backup/retention under FORCE RLS. Never grant that role to application logins. Runtime startup rejects owner, operator, superuser, bypass, role-management and schema-create privileges.
3. Supply `DATABASE_URL` using the restricted `cargoorbit_runtime` login, verified TLS and approved CA settings. The Blueprint deliberately does not use `fromDatabase.connectionString`, which is the owner credential. The database denies external IPs by default; use an authorized private-network operator execution environment or a temporary narrowly scoped allowlist, then remove that exception. Never place owner URLs or enrollment credentials in API/worker environment variables or pre-deploy commands.
4. Render can generate distinct base64 256-bit JWT, OTP and notification-callback secrets using `generateValue`. MFA encryption requires a separately generated 64-character hex key. Supply approved S3 region/bucket and least-privilege access credentials, SMTP/SMS/notification bridges and their credentials, origins and proxy CIDRs through secret settings. No migration/account password is part of the runtime environment. The worker references the API's settings so keys agree. `APP_PUBLIC_URL` is the approved web origin; `NEXT_PUBLIC_API_URL` is the approved API base ending `/v1` and is embedded during the image build.
5. S3 must be private and versioned with reviewed encryption, lifecycle, object backup and IAM controls. Render is not being presented as S3 provisioning. Configure real provider bridges and their callback verification. OIDC and external integrations default to empty arrays; enable only approved issuer/provider configurations and credentials. See `docs/OIDC.md`.
6. Enroll verified administrators through the operator provisioning command, without placing their plaintext credentials in shared logs. Remove temporary owner/enrollment environment settings. Validate mounted export-disk permissions for uid 1000, available space, API readiness, ClamAV, signed callback processing, provider sandbox delivery, backups and monitoring. Run the browser/native/device/load/recovery gates and record actual evidence on the exact release commit before opening production access.

Sources reviewed: [Blueprint specification](https://render.com/docs/blueprint-spec), [compute plans](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), [environment variables](https://render.com/docs/environment-variables), [ClamAV memory requirements](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements), [ClamAV August security release](https://blog.clamav.net/2026/08/clamav-154-and-146-security-patch.html).
