# Closing-workspace export access

Closing a tenant stops normal sign-in, refresh, SSO issuance, business requests and processing. It does not silently keep an owner's ordinary application session usable. The approved closure manifest records a future export deadline, bounded to 90 days, and the acknowledged completed archive that must remain available. The operator closure executor writes `tenants.features.exitExportUntil` and `exitExportReceiptId`; there is no API for a customer to extend these fields.

During that window, an active owner can open `/exit` and sign in with their existing password and local authenticator code. MFA is mandatory in every environment. The API issues a separate `cargoorbit-exit` audience token backed by `exit_sessions`, valid for at most thirty minutes and never beyond the agreed deadline. There is no refresh token. A fresh login is necessary after expiry.

The exit token is accepted only by these routes:

| Route | Behavior |
| --- | --- |
| `POST /v1/exit/login` | `{email,password,otp,membershipId?}`; returns `{exitToken,expiresIn,expiresAt,exitExportUntil,user}`. Multiple eligible workspaces return `WORKSPACE_REQUIRED` with authorized membership choices. |
| `GET /v1/exit/session` | Current owner and export-window metadata. |
| `GET /v1/exit/exports` | The single approved completed, acknowledged archive; storage keys and internal execution tokens are excluded. |
| `GET /v1/exit/exports/:id/download` | Download the approved retained archive, with `X-Archive-SHA256` and `X-Archive-Bytes`. Its usual seven-day download expiry is superseded by the approved exit window. Other archive IDs are rejected. |
| `GET /v1/exit/archive/download` | Stream a current tenant archive containing records, clean original objects, checksums and audit history. Authentication data and capability secrets remain excluded. |
| `POST /v1/exit/logout` | Revoke the separate exit session. |

All routes except login require `Authorization: Bearer <exitToken>`. The frontend uses separate session storage and a route allowlist; it does not use ordinary refresh, step-up or business navigation. Downloads are stopped when the session or window expires. Active streams recheck revocation every five seconds. Large exports must fit within the short session; interrupted downloads must be restarted after reauthentication.

Every authorized read checks the active user, current owner membership, MFA enrollment, session versions, closing tenant, current approved archive and future window. The database permits only reads and audit insertion for exit contexts. Changes to role, membership, user/session version, session revocation, tenant status, approved archive or deadline take effect on subsequent authorization checks. API tokens cannot authenticate an exit session, and exit tokens cannot authenticate ordinary application routes.

Operationally, preserve the approved archive and source evidence for the whole agreed window. The destructive retention executor refuses deletion before that deadline and rechecks legal holds and the signed retention approval. Tests cover the session boundary and SQL restrictions; a real customer closure, archive handover, deployed MFA/browser flow and retention execution still require authorized operational evidence.
