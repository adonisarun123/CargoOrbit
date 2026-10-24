# CargoOrbit Driver for Android

The driver application captures assigned delivery-attempt milestones, photo evidence and provisional quantities. It never finalizes customer acceptance offline. Receiver OTP approval remains an authenticated server workflow.

## Build

Requires the repository's pinned npm dependencies, Java/Android SDK and a supported emulator or device. From the repository root, run `npm ci`. Then:

```bash
cd apps/mobile
cp .env.example .env
# Set your reachable API URL. Local emulator HTTP is development only.
npm run android
```

SQLCipher is enabled by the Expo SQLite config plugin. **Expo Go is not supported**: startup probes `cipher_version` and refuses unencrypted storage. Preview and production native builds require an explicit HTTPS `EXPO_PUBLIC_API_URL`; missing/unsafe URLs fail before packaging. A local development build may opt into emulator HTTP with `CARGOORBIT_ALLOW_DEV_HTTP=true`. Release Android manifests deny cleartext traffic and device backup.

The Android signing key, package ownership, distribution and rollout approval must be supplied by the operator. No credential, signing key, provider secret or production APK is included. Android native project generation was executed successfully; native compilation and emulator execution need the Android SDK and have not been demonstrated in this environment.

## Reproducible native builds and emulator checks

The installed Expo 58 / React Native 0.88 template requires Java 17, Android platform 37.0 (`platforms;android-37.0`), build-tools 37.0.0, NDK 27.1.12297006, target SDK 36 and min SDK 24. CI pins Google's command-line-tools build 15859902. The generated wrapper pins Gradle 9.4.1. Install these through the official Android SDK manager and set `ANDROID_HOME`. Google publishes the API 37 platform with a minor suffix; the build script validates its declared API and creates the local `android-37` compatibility alias required by the pinned native templates, as described in the [upstream runner discussion](https://github.com/actions/runner-images/issues/13859). It does not change SDK contents or compile against a lower API.

```bash
# From repository root, after npm ci and dependency-mitigation verification:
EXPO_PUBLIC_API_URL=https://api.your-domain.example/v1 \
  bash apps/mobile/scripts/build-android.sh assembleRelease
# Use bundleRelease for an AAB.
```

Release output is unsigned unless all four variables are set: `CARGOORBIT_ANDROID_KEYSTORE` (absolute user-owned keystore path), `CARGOORBIT_ANDROID_KEYSTORE_PASSWORD`, `CARGOORBIT_ANDROID_KEY_ALIAS`, and `CARGOORBIT_ANDROID_KEY_PASSWORD`. Store passwords in CI secrets. The config plugin removes the template’s release fallback to its public debug keystore and fails on unexpected templates or partial credentials. Verify the resulting certificate against your approved signing fingerprint before distribution.

No external EAS CLI is required or supplied. `EAS_BUILD_PROFILE` is used only as the existing configuration profile environment variable for these local scripts.

The isolated diagnostic build uses package `com.cargoorbit.driver.test` and performs no live API requests:

```bash
EAS_BUILD_PROFILE=diagnostics EXPO_PUBLIC_NATIVE_DIAGNOSTICS=true \
  EXPO_PUBLIC_API_URL=https://example.invalid/v1 \
  bash apps/mobile/scripts/build-android.sh assembleRelease
# Start an Android emulator first (API 36 x86_64 in CI), then:
bash apps/mobile/scripts/test-android-emulator.sh
```

The harness refuses any APK with another package ID. It signs only this isolated test APK with a temporary local test identity, clears only its test package, waits for the first durable-capture marker, force-stops, restarts and checks the second marker. Native checks cover interrupted-state recovery, persisted photo bytes, conflict replacement, photo-before-draft sync, SQLCipher non-plaintext database header and wrong-key rejection. The test key is deleted after the run and never signs the driver app. Results and logs are written to `apps/mobile/native-test-results/`; CI should archive them. This executable harness supplements physical camera, OS, storage-pressure, server-connectivity and field acceptance; those still need real device evidence.

`security/README.md` documents the hash-locked upstream node-forge guard used by the Expo tooling. Raw npm audit still reports the unpublished advisory; the explicit regression/mitigation report must be retained alongside it.

## Field workflow

1. Sign in with a driver account and, where applicable, select the authorized driver workspace. Refresh rotation is serialized and stored in SecureStore before requests retry.
2. Refresh assigned consignments, attempts and existing drafts. Select the correct stop. LR, attempt, invoice and registered goods/invoice labels resolve through the assigned offline cache. A label matching multiple stops prompts explicit selection. Scanned URLs are never fetched.
3. Record arrival/unloading milestones and photos. The camera photo is written to an encrypted queue before the UI reports saved.
4. Review quantities allocated to that delivery attempt. Accepted, damaged, rejected and short must sum exactly, using fixed-point decimal validation. Exceptions need a reason.
5. Save a provisional receipt. The app preserves the server POD version and stable operation ID. Only one pending local draft per attempt is allowed.
6. Inspect the sync queue. Synchronized means server acknowledgement, not customer authorization or billing readiness. Open a failed item to compare the latest server quantities, refresh within five minutes, review each allocated item and record a reason. Confirming saves a separate provisional replacement with an immutable link and checksum to the retained original. Finalized or reassigned attempts cannot be rebased.
7. Escalate an unresolved capture with a reason, including while offline. The device queues one metadata-only review request per operation. It shows synchronized only after the server returns a task ID. Photos remain on the device until their normal acknowledgement; no raw capture or credentials are sent in the escalation. A revoked assignment can also deny escalation; keep the device data and contact authorized operations through your organization’s support channel.

## Persistence and recovery controls

- One SQLCipher file and random SecureStore/Android KeyStore-backed key per tenant and named user. All queue reads and writes are serialized on a private keyed connection; transactions do not use Expo’s exclusive helper, which opens a separate unkeyed connection.
- Android backup disabled; supported device storage remains an operational dependency.
- At least 100 metadata items and 300 MB media capacity are enforced as quotas; capture checks free disk space and warns at 80%. This is not a device certification of those capacities.
- Photo hashes are checked when decrypting and against the server acknowledgement. Stable upload/event IDs survive crash/restart.
- Photos upload before dependent receipt drafts. Synchronized photo identities remain while unsynchronized drafts refer to them.
- Interrupted uploads return to pending after restart. Retry delays are bounded; automatic retries stop after eight attempts, with an explicit retry button for transient failures.
- Stale, unauthorized or invalid data is retained on device for review. No “force overwrite” or silent discard is offered.
- Account shutdown permanently stops that sync engine and waits for storage operations before closing. A stale reconnect callback cannot restart another user's queue.
- Existing queued work may recover at any time; new capture is blocked when assignment snapshots exceed 24 hours without server refresh. Offline revocations cannot be known until reconnect.
- Photos temporarily exist as plaintext **inside the app's private cache** during the native camera/upload APIs. Cleanup runs in `finally`, and orphan CargoOrbit upload files are removed on startup/sign-out. Sudden process/OS failure can interrupt cleanup; this implementation does not claim forensic secure deletion or uninterrupted encryption during native camera capture. Include this boundary in the device threat assessment.

## Automated validation

From repository root:

```bash
npm run typecheck -w @cargoorbit/mobile
npx vitest run tests/mobile-release*.test.ts tests/mobile-launch*.test.ts
```

The suite also verifies immutable conflict replacements, metadata-only idempotent escalation/retry, exact invoice barcode mapping, and the pinned dependency exploit/compatibility fixture. It verifies sync ordering/replay, permanent conflict holds, account switching, one-time refresh concurrency, exact allocation quantities, quotas, SQLite restart recovery and fail-closed encryption capability checks. Storage tests use a genuine SQLite engine with a test capability shim; **they do not prove SQLCipher encryption on Android**.

## Required native acceptance before rollout

Record device make/model, OS, app build/version and test evidence for:

- Verify SQLCipher content is unreadable without the key; no plaintext SQLite fallback.
- Kill/restart during capture, during encryption and after server commit but before acknowledgement.
- Maintain 100 metadata drafts and 300 MB photo evidence for 24 hours offline; check 80% warning, disk full and successful recovery.
- Switch users/tenants repeatedly while a request/refresh/upload is in flight; ensure prior user's records are inaccessible.
- Revoke membership, driver assignment or invitation; confirm pending data is held and not accepted as final POD.
- Multi-stop partial allocations, changed draft versions, shortages, damaged goods and receiver refusal.
- Reconnect, force-stop/foreground and battery optimization behavior. Background uninterrupted upload is not promised; foreground/manual retry is supported.
- Camera permission denial/revocation, native temporary-photo cleanup, secure-store failure and device storage eviction.
- Release HTTPS rejection of cleartext origins, Android signing, backups disabled and crash log redaction.
