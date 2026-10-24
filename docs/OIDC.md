# Optional OpenID Connect

SSO is disabled unless operators configure `OIDC_CONFIG_JSON`. This is an authorization-code integration using `openid-client` 6.8.8, configured HTTPS providers and existing CargoOrbit memberships. It does not add SAML, SCIM, automatic account enrollment, tenant discovery from email domains, or an independent claim that an identity provider performed MFA.

## Configuration

Store the JSON in the deployment secret store. Do not commit real client secrets. Each provider is restricted to one tenant and one registered web callback:

```json
[
  {
    "id": "corporate",
    "label": "Corporate SSO",
    "tenantId": "existing-tenant-id",
    "issuer": "https://identity.example.invalid",
    "clientId": "registered-client-id",
    "clientSecret": "replace-with-provider-client-secret",
    "redirectUri": "https://app.example.invalid/sso/callback",
    "allowedEndpointOrigins": ["https://identity.example.invalid"],
    "algorithm": "RS256"
  }
]
```

`MFA_ENCRYPTION_KEY` must be configured to encrypt short-lived flow secrets. The callback origin must appear in `WEB_ORIGIN`. The tenant must have P2 enabled. Register the exact callback at the provider and permit authorization-code flow, `client_secret_post` client authentication, PKCE S256, `openid`, `max_age`, and the selected asymmetric ID-token algorithm. Supported configured algorithms are RS256, PS256 and ES256. Discovery, authorization, token and JWKS endpoints must all use explicit HTTPS origins from the operator allowlist. Redirects during server requests are refused; each request has a ten-second deadline and a one-MiB response budget.

## Enrollment and sign-in

A user first signs in locally to their existing workspace. Linking an external identity requires fresh `account:sso` step-up and an external authentication flow. The returned issuer/subject is bound to the same user and exact membership. Email claims do not create or select accounts, and a tenant administrator cannot silently bind a different person's external identity through these routes.

The frontend creates a random 32-byte base64url `browserBinding` and retains it in `sessionStorage` associated with the returned state. The server stores its HMAC and an encrypted verifier/nonce for five minutes. The browser navigates to the returned provider URL, then the provider returns to the configured frontend callback. No cookie authentication or credentialed cross-origin requests are introduced.

- `GET /v1/auth/oidc/providers` returns configured labels and identifiers.
- `POST /v1/auth/oidc/login/start` takes `{configurationId,browserBinding}` and returns `{authorizationUrl,state,expiresAt}`.
- `POST /v1/auth/oidc/login/callback` takes `{configurationId,state,code,browserBinding,iss?}` and returns `{completionRequired:true,completionId}` after provider verification.
- `POST /v1/auth/oidc/login/complete` takes `{configurationId,completionId,browserBinding,otp?}` and returns the normal application session. `MFA_REQUIRED` means a local authenticator code is required; the verified completion can be retried within its expiry. Local MFA anti-replay protection remains in force.
- The corresponding `/link/start` and `/link/callback` routes require the original authenticated membership/session; `/link/start` also requires step-up.
- `GET /v1/auth/oidc/bindings` shows only the caller's current membership bindings. Revoking `/bindings/:id/revoke` requires step-up and invalidates all local account sessions.

The state, browser binding, nonce, PKCE verifier, exact issuer, audience, expiry and JWS signature are checked. The library's `enableNonRepudiationChecks` is explicitly enabled so token-endpoint TLS alone is not used in place of ID-token signature verification. Only the verified subject is used; provider access/refresh/ID tokens are not persisted. Subject bindings use an HMAC identifier. Login completion consumes the flow and issues a session atomically after current user, membership, tenant, P2 and local-MFA checks. An independently committed per-account completion limit spans provider flows and IP addresses, so starting another SSO flow does not reset the local-MFA attempt budget.

Federated refresh sessions have an eight-hour absolute lifetime. Removing a binding revokes local sessions. Upstream account disablement is not automatically propagated: until SCIM/back-channel logout is implemented, the operational deprovisioning procedure must revoke local memberships/sessions as well. Local recovery remains an explicitly controlled operator procedure.

## Validation and deployment gates

The focused OIDC tests use the real protocol library with generated RSA/JWKS fixtures. They cover signed-token success, forged signatures, nonce/audience/issuer mismatch, unapproved endpoints, encrypted-flow tampering, browser binding, one-time exchange/completion, absence of automatic provisioning, exact-membership revocation, and retained local MFA. They also execute database session issuance and invalidation against a PostgreSQL-compatible SQL fixture.

These tests do not replace the selected provider's sandbox tests. Before enabling a real tenant, verify registered callback and client-secret custody, provider key rotation/outage behavior, max-age behavior, the deployed browser redirect flow, MFA, user unlinking and operational deprovisioning. Keep `oidc_flows` and `oidc_bindings` out of customer archives and logs. SSO should remain disabled when these checks have not been completed.

Implementation references: [openid-client authorization code flow](https://github.com/panva/openid-client/blob/main/docs/functions/authorizationCodeGrant.md), [expected state/nonce/PKCE checks](https://github.com/panva/openid-client/blob/main/docs/interfaces/AuthorizationCodeGrantChecks.md), [explicit JWS signature validation](https://github.com/panva/openid-client/blob/main/docs/functions/enableNonRepudiationChecks.md).
