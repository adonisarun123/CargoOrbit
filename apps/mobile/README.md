# CargoOrbit Driver for Android

The driver application captures assigned delivery-attempt milestones, photo evidence and provisional quantities. It never finalizes customer acceptance offline. Receiver OTP approval remains an authenticated server workflow.

## Build

Requires the repository's pinned npm dependencies, Java/Android SDK and a supported emulator or device. From the repository root, run `npm ci`. Then:

```bash
cd apps/mobile
cp .env.example .env
# Set your reachable API URL. Local emulator HTTP is development only.
npx expo run:android
```

SQLCipher is enabled by the Expo SQLite config plugin. **Expo Go is not supported**: startup probes `cipher_version` and refuses unencrypted storage. Preview and production EAS builds require an explicit HTTPS `EXPO_PUBLIC_API_URL`; missing/unsafe URLs fail before packaging. A local development build may opt into emulator HTTP with `CARGOORBIT_ALLOW_DEV_HTTP=true`. Release Android manifests deny cleartext traffic and device backup.

```bash
# Install/authenticate EAS CLI through your organization's build process, then configure project and signing.
npx eas-cli build --platform android --profile preview
npx eas-cli build --platform android --profile production
```

The EAS project, Android signing key, package ownership, distribution and rollout approval must be supplied by the operator. No credential, signing key, provider secret or APK is included. Native release builds were not executed in this environment.

## Field workflow

1. Sign in with a driver account and, where applicable, select the authorized driver workspace. Refresh rotation is serialized and stored in SecureStore before requests retry.
2. Refresh assigned consignments, attempts and existing drafts. Select the correct stop. A multi-stop LR barcode prompts explicit stop selection instead of guessing.
3. Record arrival/unloading milestones and photos. The camera photo is written to an encrypted queue before the UI reports saved.
4. Review quantities allocated to that delivery attempt. Accepted, damaged, rejected and short must sum exactly, using fixed-point decimal validation. Exceptions need a reason.
5. Save a provisional receipt. The app preserves the server POD version and stable operation ID. Only one pending local draft per attempt is allowed.
6. Inspect the sync queue. Synchronized means server acknowledgement, not customer authorization or billing readiness. Conflicts/revocations are held for operations review and never overwritten automatically.

## Persistence and recovery controls

- One SQLCipher file and random SecureStore/Android KeyStore-backed key per tenant and named user.
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
npx vitest run tests/mobile-release*.test.ts
```

The suite verifies sync ordering/replay, permanent conflict holds, account switching, one-time refresh concurrency, exact allocation quantities, quotas, SQLite restart recovery and fail-closed encryption capability checks. Storage tests use a genuine SQLite engine with a test capability shim; **they do not prove SQLCipher encryption on Android**.

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
