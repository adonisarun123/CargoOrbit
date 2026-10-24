# Release-candidate validation — 24 October 2026

This record distinguishes executed engineering checks from production acceptance. See [REQUIREMENTS.md](REQUIREMENTS.md), [ANDROID_SECURITY_REVIEW.md](ANDROID_SECURITY_REVIEW.md), and the [Render deployment guide](../infra/RENDER.md) for boundaries. No live customer deployment, provider delivery or physical-device certification is claimed.

## Executed locally

- TypeScript checks across database, domain, API, web and Android source passed after the final contract-limit integration.
- The current integrated local suite passed 385 tests, with six hosted PostgreSQL tests skipped locally; the earlier hosted candidate recorded below passed 341 tests with none skipped. PostgreSQL SQL/RLS/immutability checks execute through PGlite; hosted multi-connection tests run in CI.
- Optimized Next.js build passed with the workspace, tracking link, OIDC callback and authenticated receipt-verification routes. Focused browser-side tests cover session isolation, CSV mappings, callback return/binding guards, receipt hashes and bounded/streaming archive downloads.
- Twenty-one operational/export regressions passed, including cursor scope, stale task updates, role-matched assignment, current-user inbox, concurrent archive attempt fencing, aborts while waiting on database/storage, immutable-object hash failures and real Node stream cancellation.
- Scoped API/web production dependency audit returned zero vulnerabilities. The hash-locked node-forge candidate mitigation reproduced and rejected the known malformed-signature vector and passed 13 normal interoperability/compatibility probes. An independent implementation review repeated those probes and tamper refusal. This does not erase the upstream advisory or constitute independent security certification.
- Native Expo prebuild/configuration checks passed for preview and diagnostics: HTTPS enforced, backups disabled, unnecessary permissions removed and no debug signing fallback for release. Native APK compilation passed in the hosted run recorded below; the emulator result is separately qualified. No local native compile is claimed.
- The Render YAML was checked against the published schema. Official CLI semantic validation reached the separate CLI authentication requirement; connected MCP authentication is not available automatically to that CLI.
- The load harness was exercised against a real local HTTP fixture, including deliberate failures that correctly fail the thresholds. This is validation of the harness, not evidence that CargoOrbit meets its production capacity targets.
- Production readiness remains fail-closed without configured runtime dependencies and actual per-commit acceptance evidence.

- Later hardening adds 501-record conservation/snapshot regressions, complete receiver/access/OIDC history checks, stale-source approval rejection and production URL/key/TLS readiness failures. Those source changes require their own hosted run; earlier exact-commit results below remain historical evidence.

## Hosted checks

CI runs migration/checksum repeatability, real PostgreSQL tenant/session/outbox tests, full source/test/build checks, four browser scenarios against real API/worker/PostgreSQL, a disposable database/object recovery rehearsal, scoped server audits and a non-root server-container HTTP smoke test. A separate Android workflow compiles unsigned preview/diagnostic APKs and exercises SQLCipher/restart diagnostics on an emulator.

The candidate [`4d6f93d72a3063225e1bfd1427a95c7fa85ad0db`](https://github.com/adonisarun123/CargoOrbit/commit/4d6f93d72a3063225e1bfd1427a95c7fa85ad0db) has the following executed results in [main CI run 40118418042](https://github.com/adonisarun123/CargoOrbit/actions/runs/40118418042):

- **Verify passed:** 341 tests across 42 suites, with real PostgreSQL/RLS/session/outbox/operator/exit checks, repeatable migrations, all workspace typechecks and optimized production build.
- **Four browser scenarios passed:** tenant/session isolation and sign-out; shipment through driver evidence, receiver OTP, sealed PDF/verification, invoice acceptance and verified collection; receiver revocation/member suspension; and 390-pixel navigation/keyboard focus. Tests use real API, worker and PostgreSQL with isolated fixture tenants. This is engineering acceptance, not customer UAT or a complete accessibility audit.
- **Server dependency audit passed:** no vulnerabilities reported in the scoped server/build dependencies.
- **Container checks passed:** release image builds, runs as `node`, excludes the mobile signing toolchain and serves web HTTP using a read-only filesystem. The image was not published or deployed.
- **Synthetic recovery passed:** database backup 0.45 seconds, restore 0.414 seconds, total 1.18 seconds, with one 52-byte fixture object. This validates the disposable rehearsal, not production cloud storage/PITR, RPO/RTO or capacity.
- **Mobile raw advisory gate failed:** the exact source-hash mitigation and 14 exploit/compatibility checks pass, but the unpatched upstream node-forge advisory remains visible. The overall CI workflow is therefore not green. No waiver or audit suppression is applied.

[Android run 40118418016](https://github.com/adonisarun123/CargoOrbit/actions/runs/40118418016) compiled both preview and diagnostics APKs. The preview artifact is unsigned. The emulator installed the isolated diagnostics package, but the initial runtime check was blocked by a system Quickstep launcher ANR before its success marker could be observed; that run does **not** establish encrypted-storage/restart acceptance. A bounded launcher-only harness recovery is being validated separately. Both APK builds use `https://example.invalid/v1`; a distributable build must be rebuilt with the actual approved API origin and owner-controlled signing identity.

The CI [browser artifact](https://github.com/adonisarun123/CargoOrbit/actions/runs/40118418042/artifacts/12569943341) was inspected at desktop and mobile sizes. The [unsigned preview APK artifact](https://github.com/adonisarun123/CargoOrbit/actions/runs/40118418016/artifacts/12570606946) is retained for seven days. Artifact availability expires; archive approved release evidence in the operational evidence store. A later source change must be associated with its own applicable checks; these exact-commit results are not automatically production approval.

## Live acceptance still required

- Approved hosting region, sized plans, domain, S3/IAM/versioning and runtime secrets; actual health, scanner freshness and ingress checks.
- OTP/invitation/notification contracts and approved senders/templates; selected government/ERP/WMS/eSign provider mappings, access rights and sandbox results.
- Signed APK/AAB, signing-key custody, 24-hour offline/force-stop/low-storage/shared-device/upgrade behavior on the agreed physical Android fleet.
- Independent security acceptance of the mitigation and full system; the raw upstream advisory remains explicit.
- Customer receipt/finance acceptance, representative accessibility/browser UAT and the SRS scenarios assigned to enabled phases.
- Full cloud DB/object/PITR recovery, measured RPO/RTO, production load/latency/backlog targets, incident ownership and retention/backup disposal drills.
- Remaining code boundaries marked Partial or Absent in REQUIREMENTS.md, especially high-volume indexed workflows, provider-specific mappings and conditional advanced hardware/model capabilities.

No live tenant deletion, external provider message or cloud resource creation was performed during these local checks.
