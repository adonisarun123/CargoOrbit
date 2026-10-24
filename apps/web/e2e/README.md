# Browser acceptance suite

The Playwright suite runs the built Next.js application against the actual NestJS API, outbox worker and PostgreSQL runtime role. It does not mock application requests. The seed creates new random test tenants and accounts, leaving existing records unchanged. Never point these commands at a production database.

After installing dependencies, applying migrations, provisioning the restricted runtime role and running `npm run build`:

```sh
export NODE_ENV=test
export CARGOORBIT_E2E=1
export E2E_PASSWORD='isolated-ci-password-at-least-12-characters'
npx tsx apps/web/e2e/seed.mts
npx playwright install --with-deps chromium
npx playwright test --config=apps/web/playwright.config.ts
```

`DATABASE_URL`, `JWT_SECRET`, `OTP_SECRET`, and `MFA_ENCRYPTION_KEY` must be configured for the isolated environment. The web build must use `NEXT_PUBLIC_API_URL=http://localhost:4000/v1` (its local default); CORS is restricted to `http://localhost:3000`. Ports 3000 and 4000 must be free. The suite starts and stops its own API/worker/web processes.

Scenarios cover workspace selection and isolation, wrong credentials, logout, browser-created shipment and trip, driver delivery/evidence, exact receiver review and OTP seal, original/PDF retrieval, actual invoice submission/customer response/cash collection, authority revocation after review, live membership suspension, and mobile viewport/keyboard focus. Cross-reference search coverage exercises every page and Previous navigation, exact shipment/vehicle/e-way/freight references, formula-safe page CSV, and tenant/receiver-site/driver/financial-reference isolation. CSV/domain/session unit tests provide complementary coverage.

The suite uses the nonproduction OTP read endpoint and explicitly named `development-clean` scanner to make the browser workflow deterministic. It does **not** validate external OTP delivery, real malware scanning, production object storage, native Android behavior, SSO/provider contracts, or customer/legal acceptance. Those require separate deployed evidence.

Successful and failed test artifacts are written to `test-results/` and `playwright-report/`; screenshots and downloads are created by the actual browser test, never generated illustrations. Traces and videos are retained on failure. These artifacts contain isolated test identities and workflow data; keep them within the development/CI access boundary.

A test listing or TypeScript pass is not a browser acceptance pass. Record the tested commit and actual CI result. In the constrained local environment on 2026-10-24, Chromium installation failed because the CDN response was a truncated/invalid ZIP, so no local browser screenshot or browser-pass claim was produced.
