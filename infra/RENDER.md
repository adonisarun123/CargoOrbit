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

Render's private PostgreSQL endpoint uses self-signed certificates and does not support `verify-ca` or `verify-full`. This deployment therefore uses the **full external PostgreSQL hostname with `sslmode=verify-full`**, including from API and worker. Do not use the private hostname, an IP address, `require`, `no-verify`, or `NODE_TLS_REJECT_UNAUTHORIZED=0`. The external route adds network latency; measure it with the approved preproduction workload before capacity acceptance. Live CA, hostname/SNI and encrypted-session checks remain mandatory.

1. After approving workspace, region, costs and the exact commit, create the initial Blueprint using `infra/render-database.bootstrap.yaml`. It creates only the paid database, with external access denied. Set the Blueprint's **Auto Sync to No**; service `autoDeployTrigger: off` alone does not disable infrastructure synchronization. Record the resulting database ID. No application runtime URL is needed before the database exists.
2. Record the authorized operator's actual fixed egress IP/CIDR and temporarily allow only that address. The CLI command below is an example to execute only after approval with actual values; it replaces the entire allowlist. Never use `0.0.0.0/0` or `::/0`.

   ```sh
   render pg update "$RENDER_POSTGRES_ID" --ip-allow-list "$OPERATOR_EGRESS_CIDR" --output json
   ```

3. Obtain the database's full **external** owner connection URL through the secure Render interface. Set it as operator-only `MIGRATION_DATABASE_URL` with `sslmode=verify-full`, retaining its full hostname. Validate a real TLS connection using the installed Node PostgreSQL client before provisioning; the following prints no credential:

   ```sh
   node --input-type=module -e 'import pg from "pg"; const u=new URL(process.env.MIGRATION_DATABASE_URL); if(u.searchParams.get("sslmode")!=="verify-full") throw new Error("Verified TLS required"); const p=new pg.Pool({connectionString:u.href}); try { const r=await p.query("SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()"); if(r.rows[0]?.ssl!==true) throw new Error("TLS session required"); console.log("Verified TLS connection established"); } finally { await p.end(); }'
   ```

   Run `npm ci`, `npm run db:migrate`, and `npm run db:provision` with a unique `RUNTIME_DATABASE_PASSWORD` from the private operator checkout, or use the Docker `operator` target. Migration 003 grants its NOLOGIN operator role to the migration owner for cross-tenant backup/retention under FORCE RLS. Never grant that role to the application login. Create the runtime URL in the secret manager with `cargoorbit_runtime` and its password, keeping the verified external hostname and TLS mode. Neither the owner URL nor enrollment credentials belong in API/worker environment variables or pre-deploy commands.
4. In the **same Blueprint**, change the configured file path to `render.yaml` using the Blueprint settings or the documented Update Blueprint API `path` field, then review a manual sync. Do not create a second Blueprint with a duplicate database. Supply approved S3/provider credentials, domain/origin values, a separately generated 64-character hex MFA key and the restricted runtime URL. Render generates distinct JWT, OTP and callback secrets; worker references the API's values. New application services cannot reach the deny-all database yet, so initial API/worker readiness is expected to fail closed. Obtain their actual outbound egress CIDRs from Render; record only those approved ranges plus the temporary operator address in `render.yaml`'s database `ipAllowList`. Review and sync that exact allowlist, then redeploy. This repository deliberately leaves it empty until the addresses are known. Remove the temporary operator CIDR after provisioning; future syncs must retain the reviewed service ranges, or they will revoke application connectivity.
5. `fromService` values refresh on **Blueprint sync**, not immediately when API environment values change. After setting or rotating API secrets/URLs, manually sync and redeploy API/worker together. `NEXT_PUBLIC_API_URL` must be the real HTTPS API base ending `/v1`; Render passes it to the Docker `ARG`, and Next embeds it at build time. After changing it, **rebuild and deploy the web service**; a runtime-only redeploy leaves the old API URL in the browser bundle. `APP_PUBLIC_URL` must be an exact origin included in `WEB_ORIGIN`. No reserved example/test/invalid URLs pass readiness. The readiness command checks environment configuration, not a previously compiled web bundle; verify browser network requests target the approved API after deployment.
6. S3 must be private, versioned and covered by approved encryption, object backup, lifecycle and IAM controls. Configure real OTP/invitation/notification bridges and verified callbacks. OIDC and integrations remain disabled until approved configurations are supplied. Enroll verified administrators via the operator command, then remove temporary owner/enrollment settings. Check API and worker connectivity independently with their restricted login, ClamAV/EICAR and signature freshness, mounted disk permissions for uid 1000, export space, backups and monitoring. Complete browser/native/device/provider/load/recovery gates and exact-commit evidence before opening production access.

Sources reviewed: [Blueprint specification](https://render.com/docs/blueprint-spec), [compute plans](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), [environment variables](https://render.com/docs/configure-environment-variables), [PostgreSQL TLS and connectivity](https://render.com/docs/postgresql-creating-connecting), [Blueprint lifecycle](https://render.com/docs/infrastructure-as-code), [Blueprint path update](https://api-docs.render.com/reference/update-blueprint), [ClamAV memory requirements](https://docs.clamav.net/manual/Installing/Docker.html#memory-ram-requirements), [ClamAV August security release](https://blog.clamav.net/2026/08/clamav-154-and-146-security-patch.html).
