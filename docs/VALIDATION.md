# Release-candidate validation — 24 October 2026

This record reports executed checks, not production certification. The requirement-by-requirement assessment is in [REQUIREMENTS.md](REQUIREMENTS.md); deployment acceptance remains separate.

## Executed locally

- TypeScript checks across database, domain, API, web and Android source passed.
- Full regression suite: 164 passed across 20 suites; six hosted PostgreSQL tests skipped because no `TEST_DATABASE_URL` is available locally. Final review regressions cover withholding/credit verification, original-paper custody and replay after receiver revocation. PGlite executes actual PostgreSQL SQL, RLS and triggers for local tests; it does not replace multi-connection server acceptance.
- API/domain/database compilation and optimized Next.js production build passed.
- Expo package compatibility and mobile TypeScript 6 checks passed. These are source/tooling checks, not a signed Android build or device pass.
- Scoped deployed API/web production dependency audit: zero vulnerabilities. Patched Zod, Multer and js-yaml dependencies are locked. Full workspace audit remains blocked by one upstream node-forge advisory propagated through four Expo toolchain packages. [Dependency review](../infra/DEPENDENCY_REVIEW.md) records the affected graph and no-patched-version evidence; no advisory is waived.
- Local export streaming/error cleanup, exact evidence hashes, scanner protocol, PDF generation, reminder shifts/reversals, callback replay, sessions/contact/invitations, receiver/policy/correction/finance workflows, warehouse/provider boundaries and mobile queue/session regressions are exercised by tests.
- Production readiness command fails without actual production environment/acceptance evidence, as intended. Operator script syntax and CI YAML checks pass.

## GitHub CI

The workflow runs migration/checksum repeatability, real PostgreSQL isolation/lease/session tests, source checks, full tests/build, Expo compatibility and a scoped server dependency audit. Its container job builds a non-root server-only image and performs an HTTP smoke test with a read-only filesystem.

Mobile toolchain security is a separate non-waived blocking job. A failing mobile security job must not be reported as a green production release even if server checks pass. A committed workflow is not evidence that its run passed: inspect the Actions run for the exact pushed SHA.

## Not executed or not satisfied

- Browser visual, accessibility and complete end-to-end validation. Local Chromium downloads repeatedly returned an empty/invalid archive; no browser pass or screenshot is claimed.
- Local Docker execution or hosted PostgreSQL integration. GitHub CI is configured to perform these; this local record does not pre-claim its outcome.
- Signed Android APK/AAB, real SQLCipher encrypted-at-rest proof, camera/device cleanup, 24-hour offline and 100-draft/300-MB capacity tests.
- Live S3/IAM/versioning recovery, ClamAV freshness, backups/PITR/object restore drill, load/latency/SLA targets or independent penetration testing.
- Real OTP/DLT/invitation/notification delivery, ULIP/e-way/ERP/WMS/eSign vendor mappings, permitted datasets, source approvals and sandbox certification. Gateways are disabled without operator configuration; no official status is fabricated.
- Customer receipt/finance agreements, all 38 SRS UAT scenarios, region/domain/processor approval and named operational/security owners.
- Code gaps explicitly listed in REQUIREMENTS.md, including scoped support access, selected workflow/analytics extensions and separately scoped P4 capabilities. Approval-only retention requests do not automate evidence deletion or tenant closure.

No production resources were provisioned, no live provider messages sent, and no signed mobile artifact or live service deployment is claimed.
