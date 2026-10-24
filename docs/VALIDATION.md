# Release-candidate validation — 24 October 2026

This record distinguishes executed engineering checks from production acceptance. See [REQUIREMENTS.md](REQUIREMENTS.md), [ANDROID_SECURITY_REVIEW.md](ANDROID_SECURITY_REVIEW.md), and the [Render deployment guide](../infra/RENDER.md) for boundaries. No live customer deployment, provider delivery or physical-device certification is claimed.

## Executed locally

- TypeScript checks across database, domain, API, web and Android source passed after the final contract-limit integration.
- The final integrated local suite passed 331 tests, with six hosted PostgreSQL tests skipped locally. PostgreSQL SQL/RLS/immutability checks execute through PGlite; hosted multi-connection tests run in CI.
- Optimized Next.js build passed with the workspace, tracking link, OIDC callback and authenticated receipt-verification routes. Focused browser-side tests cover session isolation, CSV mappings, callback return/binding guards, receipt hashes and bounded/streaming archive downloads.
- Twenty-one operational/export regressions passed, including cursor scope, stale task updates, role-matched assignment, current-user inbox, concurrent archive attempt fencing, aborts while waiting on database/storage, immutable-object hash failures and real Node stream cancellation.
- Scoped API/web production dependency audit returned zero vulnerabilities. The hash-locked node-forge candidate mitigation reproduced and rejected the known malformed-signature vector and passed 13 normal interoperability/compatibility probes. An independent implementation review repeated those probes and tamper refusal. This does not erase the upstream advisory or constitute independent security certification.
- Native Expo prebuild/configuration checks passed for preview and diagnostics: HTTPS enforced, backups disabled, unnecessary permissions removed and no debug signing fallback for release. Native APK compilation and emulator execution are CI work, not local claims.
- The Render YAML was checked against the published schema. Official CLI semantic validation reached the separate CLI authentication requirement; connected MCP authentication is not available automatically to that CLI.
- The load harness was exercised against a real local HTTP fixture, including deliberate failures that correctly fail the thresholds. This is validation of the harness, not evidence that CargoOrbit meets its production capacity targets.
- Production readiness remains fail-closed without configured runtime dependencies and actual per-commit acceptance evidence.

## Hosted checks

CI runs migration/checksum repeatability, real PostgreSQL tenant/session/outbox tests, full source/test/build checks, four browser scenarios against real API/worker/PostgreSQL, a disposable database/object recovery rehearsal, scoped server audits and a non-root server-container HTTP smoke test. A separate Android workflow compiles unsigned preview/diagnostic APKs and exercises SQLCipher/restart diagnostics on an emulator.

The first pushed candidate (`be60ceaa6e3282f2ff522f514da02ffa7ac25742`) passed 300 unit/integration tests, production build and synthetic recovery in CI. Browser startup then failed on a test-server port collision, and the Android job failed on a retired SDK package; both configurations were corrected. Those results do not prove the corrected browser/native run. Inspect the Actions runs for the exact pushed commit; a workflow definition alone is not a passing result. Raw full-workspace advisory audit remains a distinct hard-failing gate while the unresolved node-forge advisory applies. The mitigation proof and raw audit are retained together. CI unsigned diagnostics do not establish signed fleet-device acceptance.

## Live acceptance still required

- Approved hosting region, sized plans, domain, S3/IAM/versioning and runtime secrets; actual health, scanner freshness and ingress checks.
- OTP/invitation/notification contracts and approved senders/templates; selected government/ERP/WMS/eSign provider mappings, access rights and sandbox results.
- Signed APK/AAB, signing-key custody, 24-hour offline/force-stop/low-storage/shared-device/upgrade behavior on the agreed physical Android fleet.
- Independent security acceptance of the mitigation and full system; the raw upstream advisory remains explicit.
- Customer receipt/finance acceptance, representative accessibility/browser UAT and the SRS scenarios assigned to enabled phases.
- Full cloud DB/object/PITR recovery, measured RPO/RTO, production load/latency/backlog targets, incident ownership and retention/backup disposal drills.
- Remaining code boundaries marked Partial or Absent in REQUIREMENTS.md, especially high-volume indexed workflows, provider-specific mappings and conditional advanced hardware/model capabilities.

No live tenant deletion, external provider message or cloud resource creation was performed during these local checks.
