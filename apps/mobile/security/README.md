# Expo tooling: explicit node-forge mitigation

The locked Node tooling dependency is `node-forge@1.4.0`. On 2026-10-24, npm still published 1.4.0 as latest; the GitHub advisory [GHSA-86w9-cpqp-85rv / CVE-2026-85393](https://github.com/advisories/GHSA-86w9-cpqp-85rv) listed versions through 1.4.0 as affected and no published patched release. Raw `npm audit` therefore remains nonzero. This mitigation does not rename the package, change its version, suppress an advisory, or claim an official upstream release.

## Provenance and bounded change

The exact executable guard is taken from the open upstream [PR #1152](https://github.com/digitalbazaar/forge/pull/1152), commit `ceba34402e329f0365134f23fe19898756527d65`. It rejects extra nested DigestAlgorithm children inside RSA PKCS#1 v1.5 DigestInfo. It extends the existing ASN.1 shape validation; it does not implement or change a cryptographic algorithm. The proposal was not merged when reviewed. Review discussion also appears in [issue #1149](https://github.com/digitalbazaar/forge/issues/1149).

`forge-mitigation.json` records the exact pre/post source bytes and hashes. The patcher accepts only the named version and Node entry point `lib/index.js`; any changed source or dependency version fails closed. It examines every locked installed copy. Applying it twice verifies the existing result without another edit.

| `lib/rsa.js` | SHA-256 |
| --- | --- |
| Official 1.4.0 source before guard | `fd4740238145ec26470eb3f06a627c72039538ce1307dbdce40521f94dfd0a50` |
| Source after exact guard | `c9b1e3799e230528b6d6815c1f6cd3c6058b9d45975264b55d995abb976589af` |

The manifest, rather than this prose, is the executable hash authority. Only the Node `lib` entry used by Expo CLI/code-signing is covered. Upstream prebuilt browser `dist` bundles are not patched and must not be imported by CargoOrbit. The normal Expo runtime application does not intentionally import node-forge. A future dependency or entry-point change requires review and fresh tests, not broadening the accepted hashes automatically.

## Reproduction

From the repository root, after the pinned dependencies are installed:

```bash
node apps/mobile/security/forge-mitigation.cjs --apply
node apps/mobile/security/forge-mitigation.cjs --verify
node apps/mobile/security/verify-forge.cjs
npx vitest run tests/mobile-launch-security.test.ts
npm audit --json > /tmp/cargoorbit-raw-audit.json
```

The regression suite makes an isolated copy, verifies the original source hash, reproduces the public malformed-signature fixture against the original, applies the exact patch, and requires rejection with normal signature padding checks enabled. The checked-in fixture comes from the PR's public test and includes its source commit and license. Compatibility checks cover native OpenSSL ↔ forge RSA SHA-256/384/512 signing/verification, changed-message rejection, RSA-PSS, X.509 PEM certificate verification, CSR verification and encrypted PKCS8 roundtrip. Fourteen checks pass on the patched source. Source tampering, a changed package entry point and a changed version are rejected. These are focused regressions, not a claim that the upstream full suite or independent cryptographic certification ran.

An independent security review of the candidate remains a release record. Keep the raw audit artifact alongside the hash/fixture report so a successful mitigation check cannot be confused with an audit reporting no advisories. Once an official release fixes the advisory, review that release, update dependencies, rerun the exploit and interoperability regressions, then explicitly retire this backport.
