# API contract

Base `/v1`. JSON requests, bearer token after authentication. Error shape: `statusCode`, `code`, `message`, `details`, `requestId`. Domain schemas reject unknown fields. Decimal quantities/money are strings. Dates include ISO timezone; date-only invoice issue dates use `YYYY-MM-DD`.

- `POST /auth/login`: email, password, optional otp and membershipId. A multiple-membership login returns 409 with choices; current web UI requires a selected single membership.
- `GET /auth/me`, `POST /auth/logout` (invalidates user sessions).
- `GET /resources/:resource[/:id]`: scoped domain records, optional q/limit/offset.
- `POST /actions/:action`: validated domain action. Exact inputs are documented in `packages/domain/src/schemas.ts`.
- `POST /evidence`: multipart file, consignmentId, UUID clientOperationId, optional documentType/capturedAt/captureMethod. Files max 10 MB, MIME sniffing, original hash, quarantine scan. A successful upload is not evidence acceptance.
- `GET /evidence/:id`: authorized scan-clean original download.
- `GET /evidence-packets/:podId` and `/manifest`: authorized sealed PDF/JSON.
- `GET /export`: scoped metadata archive. Evidence bytes retrieved through authorized download APIs.
- `GET /settings/features`, `POST /settings/features`: enabled phases must be a subset of tenant entitlements.
- `POST /expansion/actions/:action`, `GET /expansion/resources/:resource[/:id]`: phase/role gated expansion business methods.
- `GET /admin/members`, `POST /admin/invitations`, `POST /admin/members/:id/suspend`: owner/customer-admin administration.
- `POST /invitations/accept`: tenantId, invitationId, one-time token and new password. Never overwrites an existing account.
- `GET /health`: database connection health only; not a full service SLA signal.

## Core action families

Master data: createOrganization, createFacility, createPolicy, grantReceiver, revokeGrant.

Transport: createConsignment, createTrip, recordEvent, saveDraft, correctPod.

Acceptance: issueChallenge, acceptPod (podId, challengeId, six-digit code, consent:true, idempotencyKey).

Finance: evaluateBilling, recordGrn, createInvoice, submitInvoice, respondInvoice, allocateReceipt, createDispute.

Compliance/import: createComplianceTask, resolveComplianceTask, importPreview, importCommit.

Evidence registration and malware status actions are internal-only and rejected by the public action endpoint.

## Providers

`SMS_WEBHOOK_URL` receives `{contact, code, purpose, expiresIn}` over HTTPS with a bearer secret. Map this contract to a verified message provider and approved templates. Never log bodies or OTPs. Current contact enrollment supports account email; add a verified phone directory before enabling actual SMS. OTP is not CCA eSign.

`NOTIFICATION_WEBHOOK_URL` receives an event ID and payload with an idempotency header. Provider acceptance is not message delivery; callback authentication/delivery-state workflow needs completing before production notifications.

ULIP and government writes have no enabled HTTP adapter. Manual outcomes carry provenance and cannot update official e-way bill status. Vendor mapping and certification must use the approved customer's contracts.
