# Android tooling mitigation review

Reviewed on 2026-10-24. This review covers the repository's hash-locked mitigation for node-forge 1.4.0 used through the Node entry point in the Expo tooling dependency tree. It is a local mitigation review, not a published upstream fix, native Android acceptance, or an independent penetration test.

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

The mitigation should be removed only after reviewing an official fixed release, updating the lockfile, rerunning the negative and interoperability tests, and confirming every Expo/EAS execution path uses the reviewed package. Signed APK/AAB builds, SQLCipher/device validation, secure signing custody, delivery-provider contracts and deployed security testing remain separate release gates.
