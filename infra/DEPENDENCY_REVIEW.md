# Dependency security review — 2026-10-24

The API/web production dependency audit and the scoped root/API/web build and development audit both pass with zero reported vulnerabilities:

```sh
npm audit --omit=dev --audit-level=high --workspace=@cargoorbit/api --workspace=@cargoorbit/web
npm audit --audit-level=high --workspace=@cargoorbit/api --workspace=@cargoorbit/web --include-workspace-root
```

The complete workspace audit **does not pass**. It reports four high-severity package entries caused by one unresolved advisory: `node-forge` 1.4.0 and its Expo CLI, Expo certificate, and Expo parent dependency paths. The [upstream advisory GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) states that no patched version is published. The npm registry's latest `node-forge` release at review time is 1.4.0. The affected operation is RSA PKCS#1 v1.5 signature verification. No advisory suppression, package/version spoofing, or Expo downgrade has been applied. An exact source-hash-locked candidate guard from the upstream still-open PR is now applied to the Node entry point by the root postinstall and Docker build. The provenance and scope are recorded in `apps/mobile/security/forge-mitigation.json` and `docs/ANDROID_SECURITY_REVIEW.md`; browser distribution bundles are not patched.

`mobile-toolchain-security` runs the complete production workspace audit as a separate release check. It intentionally fails while this advisory remains. The server image job depends on application verification and the server audit, allowing its image checks to run independently. A green server audit is not approval to release the Android application or its build/signing toolchain. Re-run both audits on the exact candidate commit; the release evidence may separately record `reviewed_mitigation` only after an independent reviewer approves this exact commit/source hash and the native build and cryptographic regression evidence. The raw audit still fails and is preserved as a CI artifact even when that explicit acceptance is recorded. No independent approval is inferred from the automated regression tests.

Patched dependencies:

- Vitest 4.1.12 replaces 3.2.7. It removes the affected Tinypool dependency path ([GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr)) and includes the patched mocker for [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9). The complete local suite passes under 4.1.12: 167 tests passed; six real PostgreSQL tests remain reserved for CI. No tests needed weakened or removed assertions.

- Zod 4.6.7 replaces 3.25.76 in API/domain and, through a scoped override, Expo CLI. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) identifies 4.6.6 as the first patched version. Record schemas use Zod 4's explicit key/value form; the domain import preview narrows parsed output. The test suite exercises Expo's actual extension/command schemas under the override.
- Multer 2.5.0 is used directly and overrides Nest's vulnerable nested 2.4.0 dependency. [GHSA-q7qp-rjg7-q26m](https://github.com/advisories/GHSA-q7qp-rjg7-q26m) identifies 2.5.0 as patched.
- Swagger's js-yaml dependency is overridden to 5.5.0 for [GHSA-r3ph-w7gj-g6xm](https://github.com/advisories/GHSA-r3ph-w7gj-g6xm). Expo's separate 4.3.2 path is unaffected by this advisory.
- Mobile TypeScript is pinned to the Expo 58 compatible `~6.0.3`; the server/web compiler stays on 5.9.3. `expo install --check` and mobile type checking pass.

The Docker runtime uses a fresh API/web-only production dependency installation. It copies only compiled API/database/domain output and the Next build into that dependency stage. Expo, Expo CLI, and node-forge are explicitly checked absent from the resulting server image. This removes native build/signing tools from server delivery; it does not erase the outstanding mobile toolchain finding.
