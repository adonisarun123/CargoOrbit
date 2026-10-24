# API contract

Base `/v1`. JSON requests; authenticated routes require `Authorization: Bearer <accessToken>`. Errors contain `statusCode`, `code`, `message` and `requestId`; safe validation details are included for client errors. Secrets and internal errors are never returned. Decimal quantities and money are strings; timestamps include a timezone. Date-only invoice issue dates use `YYYY-MM-DD`.

## Identity and authority

- `POST /auth/login`: email, password, optional authenticator `otp` and `membershipId`. A multi-workspace account receives `409 WORKSPACE_REQUIRED` with authorized choices, then resubmits credentials with its selection. The web client supports this flow.
- `POST /auth/refresh`: one-use `refreshToken`. Successful rotation replaces both tokens; reuse of the preceding refresh token revokes the session. Clients serialize refresh per account and workspace and discard late responses after logout/account changes.
- `GET /auth/me`, `POST /auth/logout`: inspect/revoke the current persisted session. `GET /auth/sessions` and `POST /auth/sessions/:id/revoke` manage the caller's sessions.
- `POST /auth/step-up`: password, optional authenticator `otp`, and an exact `scope`; returns a five-minute token bound to account, workspace and session. Supply it in `X-Step-Up` for the sensitive action. Scope names are defined in `apps/api/src/security.ts`.
- `POST /auth/password`: `newPassword`, with `account:password` step-up; revokes all sessions.
- `POST /auth/contact/challenge`: new email or E.164 phone `contact`, with `contact:change` step-up. `POST /auth/contact/confirm` takes `challengeId` and six-digit `code` and the same scope. Successful ownership verification revokes all account sessions and receiver grants; a customer administrator must renew receiving authority. Development codes are accessible only to the requesting account outside production.
- `GET /admin/members`, `GET /admin/invitations`, `POST /admin/invitations`, `POST /admin/invitations/:id/revoke`, `POST /admin/members/:id/suspend`: owner/customer administrator operations constrained by current organizational and facility authority. Invitations and suspensions require the corresponding step-up scope.
- `POST /invitations/accept`: tenantId, invitationId, one-use token and password; an existing account must authenticate with its existing password and MFA where enrolled. Credentials are never overwritten during membership linking. Production invitations use the configured delivery adapter.

Login, contact, step-up and receipt-OTP endpoints use durable rate limits. Privileged administrators require MFA in production. Verified initial administrator enrollment is an operator procedure in `scripts/provision-account.ts`; SSO and self-service MFA recovery are not provided.

## Delivery and finance

- `GET /resources/:resource[/:id]`: role, tenant, organization, facility and assignment scoped records; list responses support q/limit/offset (maximum 500). Database scale/load acceptance is still required; this is not a promise of indexed pagination for every business query.
- `GET /resources/receiptReview/:podId`: exact prospective acknowledgement payload and its canonical hash. The receiver must review that version before issuing a challenge.
- `POST /actions/:action`: strict action schema in `packages/domain/src/schemas.ts`. Supported families include masters/policies, receiver authority, consignments/trips/reattempts/reassignments, milestones, drafts/corrections, challenges/acceptance, GRN, billing, invoice issuance/submission/response, receipt allocation/verification/reversal and dispute resolution.
- Policy changes and finance adjustments require their specific step-up scopes. Evidence registration and scanner status actions are internal-only.
- `POST /evidence` (alias `/evidence/uploads`): multipart `file`, consignmentId, UUID clientOperationId, optional attemptId/documentType/capturedAt/captureMethod/sha256. One file, 10 MB maximum, MIME sniffing and immutable checksum. Multi-stop evidence must identify its attempt. Upload returns pending scan status; it does not self-assert clean or finalize receipt. Reusing an upload ID with changed bytes or metadata fails.
- `GET /evidence/:id`: authorized scan-clean exact object version. `GET /evidence-packets/:podId` and `/manifest`: immutable accepted/refused receipt PDF and JSON manifest. Worker processing may initially return 409 pending.
- `GET /export`: scoped business metadata JSON. `GET /operations/archive/download`: tenant-owner tar.gz archive, with `policy:change` step-up, repeatable-read business records/audit plus exact clean originals and packet versions. Authentication challenges/tokens, provider configuration and raw integration results are excluded; quarantined bytes are excluded. Provider exports require a separately approved dataset policy. SHA-256 manifest, bounded members/bytes/time, cancellation cleanup and generation audit are included. A generated archive is not proof that a client received it or that a backup is complete.

Receipt acceptance is transaction-bound and checks active membership, receiver grant, delivery attempt, version, exact quantities/evidence, OTP expiry/attempt count, payload hash, consent and idempotency. Shipment delivery and invoice eligibility use all applicable attempts. A correction creates a linked new version; it never edits an accepted version. Cash, verified withholding/credits, retention and disputed amounts remain distinct; reversal/verification history is append-only.

## Operations, integrations and health

- `GET /operations/:resource`: scheduler_config, notifications, legal_holds or retention_requests for permitted operators.
- `POST /operations/scheduler`: versioned IANA time zone, weekdays, daytime shift, holidays, reminder thresholds and approved channel/contact. Queues pending-receiver, e-way review, invoice-issue review, overdue-balance and enabled sensor-alert reminders. Delivery rechecks shifts and source state; deferred reminders resume within a configured shift.
- `POST /operations/legal-holds`, `POST /operations/legal-holds/:id/release`, `POST /operations/retention-requests`, `POST /operations/retention-requests/:id/review`: owner-only, `policy:change` step-up, reason/reference and separate reviewing authority. Active holds block deletion approval. Retention requests require an operator reconciliation procedure; the service does not automatically purge evidence or close a tenant.
- `GET/POST /settings/features`: enabled phases must remain a subset of the tenant's contracted entitlements.
- `POST /expansion/actions/:action`, `GET /expansion/resources/:resource[/:id]`: phase/role/scope gated devices, reviewed safety, warehouse, returnables, emissions and planning workflows.
- `GET /integrations/capabilities`, `GET /integrations/history[/:id]`, `POST /integrations/execute`, `POST /integrations/reconcile`: approved, operator-configured gateway operations. No external operation is enabled by default. See [integration contracts](INTEGRATIONS.md).
- `GET /health/live`: process liveness. `GET /health/ready` (alias `/health`): bounded cached database/scanner/storage readiness. `GET /health/workspace`: authorized tenant outbox lag/dead-event health. Readiness is not an SLA or end-to-end delivery certificate.

## Message provider contracts

`SMS_WEBHOOK_URL` receives `{contact, code, purpose, expiresIn}` over HTTPS with a bearer secret. It is an OTP delivery bridge; map email/phone destinations and purpose to approved provider templates. Production requires a configured bridge and a JSON response containing a provider `reference`, `messageId` or `id` (at most 200 characters). Requests include a stable HMAC-derived idempotency key; receipt authentication history retains the provider reference without the OTP. A verified phone contact can be enrolled through the contact challenge. OTP does not constitute CCA eSign.

`INVITATION_WEBHOOK_URL` receives the invitation contract documented by `apps/api/src/admin.ts`. Use an approved secure template/link domain. Never record tokens in message-delivery logs. The API does not disclose the invitation token to the inviter in production.

`NOTIFICATION_WEBHOOK_URL` receives `{eventId, notificationId, tenantId, channel, contact, message}` with a bearer secret and `Idempotency-Key` equal to the stable notification ID. It must honor retries with the same key and return `{id}` or `{reference}`. Provider acceptance records `submitted`, not `delivered`.

Delivery callbacks go to `POST /provider-callbacks/notifications/:tenantId` with JSON `{notificationId,providerReference,eventId,status,occurredAt}`; status is delivered or failed. Set `X-Cargoorbit-Timestamp` to Unix seconds and `X-Cargoorbit-Signature` to lowercase hex HMAC-SHA256 over the exact UTF-8 prefix `<tenantId>.<timestamp>.` followed by the raw request bytes, using `NOTIFICATION_CALLBACK_SECRET`. The server allows five minutes of skew, validates the provider reference, rejects conflicting event replays and prevents late failures from regressing delivered status.

Do not log OTPs, invitation tokens, authorization headers, credentials or raw provider bodies. Callback authenticity does not by itself certify the provider's underlying delivery claim.
