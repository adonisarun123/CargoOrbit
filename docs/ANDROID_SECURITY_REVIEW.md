# Android tooling mitigation and native validation review

Reviewed on 2026-10-24. The tooling review covers the repository's hash-locked mitigation for node-forge 1.4.0 used through the Node entry point in the Expo tooling dependency tree. Hosted native validation evidence is recorded separately below. Neither establishes a published upstream security fix, physical-device acceptance, or an independent penetration test.

## Source and change

The [GitHub advisory GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) lists affected versions through 1.4.0 and no patched version. The [upstream pull request 1152](https://github.com/digitalbazaar/forge/pull/1152), commit `ceba34402e329f0365134f23fe19898756527d65`, was open when reviewed. Its proposed guard rejects additional elements inside the nested RSA PKCS#1 v1.5 DigestAlgorithm sequence.

The repository mitigation preserves the package name/version and verifies the exact `lib/rsa.js` preimage and postimage, recorded in `apps/mobile/security/forge-mitigation.json`. It requires the expected Node entry point, patches exactly one matching site, writes through a temporary file, and refuses unknown versions or source hashes. It enumerates locked installations and rejects dependency directories resolving outside the repository. It does not rename the package, suppress the advisory, download executable patches, or alter browser distribution bundles.

## Executed proof

The reviewer copied the locked installed package to an isolated temporary directory and ran the supplied regression verifier in separate Node processes:

1. The unmodified package accepted the supplied malformed signature, reproducing the reported vulnerability with normal padding checks enabled.
2. The mitigation produced SHA-256 `c9b1e3799e230528b6d6815c1f6cd3c6058b9d45975264b55d995abb976589af`.
3. The malformed signature was rejected after the patch.
4. SHA-256, SHA-384 and SHA-512 signatures interoperated with Node crypto in both directions; altered-message checks rejected the signatures.
5. RSA-PSS SHA-256, X.509 certificate roundtrip/native verification, CSR roundtrip verification and encrypted PKCS#8 private-key use passed.
6. Appending an unreviewed change to the patched source caused verification to fail.

There were 14 post-mitigation checks and one locked installation in the reviewed tree. The temporary copy was removed. This review did not modify the live installation or publish an Android artifact.

## Limits and release handling

No bypass was found in the reviewed normal Node `lib/index.js` path. This does not establish that arbitrary custom Forge verification schemes, test-only skip-check options, browser bundles, global installations or independently installed EAS tooling are covered. Package integrity outside the patched file still depends on the committed lockfile and a clean trusted installation.

A build must run the apply-and-verify gate after dependency installation and before executing project Expo tooling. Preserve the raw dependency audit and the explicit mitigation evidence; a successful local regression is not an upstream security release. Global/EAS CLI packages and remote build environments need their own pinned and verified dependency evidence. The reviewed change removed the external EAS build configuration and its version-range escape. The supported release path now uses the repository's pinned Expo toolchain and local Gradle wrapper with explicitly supplied signing credentials. Independently installed EAS or global tooling is outside this mitigation and is not a supported substitute for the reviewed build path.

The mitigation should be removed only after reviewing an official fixed release, updating the lockfile, rerunning the negative and interoperability tests, and confirming every Expo/EAS execution path uses the reviewed package. Production APK/AAB signing, physical-device acceptance, secure signing custody, delivery-provider contracts and deployed security testing remain separate release gates. The raw advisory gate remains unchanged.

## Hosted native validation evidence

The [Android native validation workflow](https://github.com/adonisarun123/CargoOrbit/actions/runs/40120184596) passed both jobs on 2026-10-24 at Android component commit `c57f1b02ac190984df368b37e4b15d192c9efc21`:

- [Preview job 120949842186](https://github.com/adonisarun123/CargoOrbit/actions/runs/40120184596/job/120949842186) compiled the unsigned driver APK.
- [Diagnostics job 120949841981](https://github.com/adonisarun123/CargoOrbit/actions/runs/40120184596/job/120949841981) compiled the isolated diagnostic APK, installed it using an ephemeral test identity, and passed the API 36 x86_64 Pixel 7 emulator checks. The job log records `Native encryption and force-stop recovery checks passed` at 18:32:56 UTC.

The diagnostic artifact ZIP was downloaded and its SHA-256 checked against GitHub's digest. Its `NATIVE_CHECK_PHASE1_PASS.xml` and `NATIVE_CHECK_PHASE2_PASS.xml` each contain the exact expected marker in a `com.cargoorbit.driver.test` UI node. The captured log shows separate React Native processes before and after the forced stop, followed by SQLCipher's expected HMAC/decryption rejection during the deliberate wrong-key test. No launcher recovery was needed in this successful run.

The executable assertions cover an open encrypted queue across forced process termination, interrupted-upload recovery, unchanged persisted photo bytes and assignment cache, an explicitly reviewed replacement retaining the original conflict, photo-before-draft ordering, three persisted acknowledgements from the simulated transport, a non-plaintext SQLite header, and wrong-key rejection. Four separate shell-harness regression tests cover the observed launcher ANR recovery, repeated-ANR refusal, app-failure refusal, and physical-device refusal. These tests never turn a launcher recovery into a pass: both app markers remain mandatory.

| Artifact | ZIP SHA-256 |
| --- | --- |
| [Unsigned driver validation APK](https://github.com/adonisarun123/CargoOrbit/actions/runs/40120184596/artifacts/12571077674) | `1d52c4d93462aa493a4ff362c10ae823d90f217f54cb31a3357f6ec059b6c926` |
| [Unsigned diagnostics APK and native evidence](https://github.com/adonisarun123/CargoOrbit/actions/runs/40120184596/artifacts/12570743045) | `fdcc439657a4acd3bfca921bfabd59a18327f7f5f7207c0835cbeda89bda3a26` |

The artifacts expire on 2026-10-31 under the seven-day CI retention policy. These are archive hashes, not APK signatures. CI used `https://example.invalid/v1`; the diagnostic transport made no live API requests. The preview artifact is unsigned, and the ephemeral identity only installed the separate diagnostic package. Rebuild with the approved production API and signing identity before distribution.

This evidence applies to the named Android component commit. Documentation, web and independent server changes do not imply another native execution; changes to mobile sources, root dependency manifests/lockfile or the native workflow trigger the native workflow again. Physical camera behavior, 100 metadata records and 300 MB of photo evidence retained for 24 hours, low-storage and power-loss behavior, supported device/OS coverage, account changes against live services, and production signing remain operator acceptance work.
