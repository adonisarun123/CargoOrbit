# Capability read pagination

`POST /v1/support/read` and `POST /v1/machine/read` retain their projected-array response and accept optional integer `limit` and `offset` fields. `limit` defaults to 500 and must be between 1 and 500. `offset` defaults to zero and must be a nonnegative safe integer. A request with `id` reads only that exact authorized record and does not use list pagination.

For a list, the service traverses every matching database page within the approved shipment scope, removes duplicate shipment identifiers, sorts the matching records by identifier, and then applies the output offset and limit. There is no separate first-100-record limit for each shipment. Increase the offset by the number of returned records until a page contains fewer than the requested limit; an exact multiple requires one final empty-page request. For example, `{resource:"tasks",limit:500,offset:500}` reads the second page.

Each request rechecks the current support grant or machine credential and audits the exact identifiers returned. Pagination does not expand the approved tenant, shipments, resources, or field projection. It does not reveal storage keys, contacts, full receipt snapshots, credentials, or raw provider data.

These compatibility endpoints collect the scoped matching set before selecting an output page. Their work grows with that set, including when an offset is large. Prefer exact-record reads when an identifier is known. Separate requests are not a single immutable snapshot: concurrent inserts or removals can move offset positions, so consumers should reconcile record identifiers. Use the authenticated tenant archive workflow when a repeatable, complete export is required.

Authorization decisions and access-management lists use all matching database pages. Receiver policy selection, grant eligibility, current draft receipt selection, tracking-stop snapshots, and self-owned OIDC binding lists must not use a presentation-page limit as a complete result.
