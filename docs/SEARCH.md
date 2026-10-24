# Scoped shipment reference search

`GET /v1/search` finds shipments by LR number, internal shipment ID, vehicle number, inline or linked goods-invoice reference, e-way bill, and linked freight invoice. It returns navigation summaries and matching reference strings, not the financial records, receiver contacts, evidence, or full shipment payloads.

## Browser use

Open **Search references**, select a reference type and **Starts with** or **Exact reference**, and enter 2–100 characters. The page size can be 10, 25, 50 or 100. Previous/Next navigate the same query. Changing the query clears the prior results. Account, workspace or authority changes remount the search; late requests cannot populate the new session.

**Export this page** downloads only the current authorized result page, with spreadsheet formula protection. It does not claim to export all matching records. Complete owner archives use the separate repeatable-read archive workflow. Each page request rechecks current authorization; multiple pages do not form an immutable snapshot.

## API contract

```http
GET /v1/search?q=KA01&type=vehicle&match=prefix&limit=25
Authorization: Bearer <normal interactive access token>
```

- `type`: `all` (default), `lr`, `shipment`, `vehicle`, `goods_invoice`, `eway_bill`, or `freight_invoice`.
- `match`: `prefix` (default) or `exact`. Reference normalization ignores surrounding whitespace and case. `%`, `_`, quotes and backslashes are literal identifier characters, not query syntax.
- `limit`: integer 1–100, default 25.
- `cursor`: opaque `nextCursor` from the preceding page. Keep the query and current identity/scope unchanged. The requested page size may change.

The response is `{items, nextCursor?}`. Each item includes its shipment ID, LR, branch, financial year, status, route IDs and at most 20 distinct matching references. An exact normalized match is preferred before other prefix matches. `matchesTruncated: true` means further **authorized** matching references exist for that shipment. There is no global total or inaccessible-record count. Empty results have no next cursor.

## Authorization and persistence

The database filters both the reference relation and current actor scope **before** the result-page limit. Transport roles retain tenant scope; customer administrators and receivers retain receiving-organization/site scope; customer finance retains payer scope. Drivers require a current assigned, non-cancelled/non-transferred attempt, with the existing legacy assignment fallback only when no attempts exist. Vehicle matches additionally require the current trip driver, so a historical accepted attempt does not expose a replacement driver's vehicle. Freight-invoice references are excluded from driver/receiver/customer-administrator searches, including `type=all`.

Cursors bind normalized query, match type, tenant, user, membership, role, organization, facilities and driver scope. Tampering with scope does not broaden the query. Each request also passes ordinary session and membership validation. Audit records store a query hash, type, match method and returned count; raw queries and cursors are not written to that audit entry.

Migration `005_shipment_search.sql` derives reference terms from existing entities and backfills historical rows. PostgreSQL prefix indexes narrow matching source references; live joins evaluate current document links, attempts, trips, invoices and actor permissions. Trigger updates keep references current, and a source foreign key cascades deletion. The derived table has forced tenant RLS and runtime SELECT-only permission. Existing source immutability, audit, quota and retention rules still apply. No PostgreSQL extension is required.

## Validation boundary

Targeted tests exercise more than 600 results/inaccessible candidates, all reference types, SQL/Memory parity, whitespace and literal wildcard handling, cursor-scope changes, reassignment, hidden financial references, bounded matches, runtime write denial and managed-owner migration/backfill. Hosted CI additionally runs real PostgreSQL and browser search, pagination, CSV and tenant/site/driver scenarios. See [VALIDATION.md](VALIDATION.md) and the exact commit's Actions results for executed outcomes.

This implements reference search, not a rewrite of every list/dashboard/telemetry query. Other workflows still materialize some tenant collections. Broad-prefix query cost, concurrent tenant-write serialization and production latency/capacity remain load-test acceptance requirements.
