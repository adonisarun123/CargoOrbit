# SRS implementation coverage

This register deliberately distinguishes executable implementation from complete acceptance. No NFR capacity, SLA, security certification or field reliability target is claimed by a compile/test pass. The repository is a development baseline.

| Requirement | Phase | Capability | State | Evidence / remaining boundary |
|---|---|---|---|---|
| FR001 | M | Tenant isolation | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR002 | M | Company and site records | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR003 | M | Membership | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR004 | M | Receiver governance | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR005 | M | Customer policies | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR006 | M | Import validation | Partial | CSV parser and validated batch preview/duplicate checks implemented; XLSX and advanced column mapping remain. |
| FR007 | M | LR identification | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR008 | M | Consignment contents | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR009 | M | Document relationships | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR010 | M | Dispatch | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR011 | M | Operational milestones | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR012 | M | Cancellation and reattempt | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR013 | M | Scoped authority | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR014 | M | Secure invitations | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR015 | M | Transaction bound OTP | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR016 | M | OTP protection | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR017 | M | Explicit consent | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR018 | M | Delegation and revocation | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR019 | M | Authority exceptions | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR020 | P2 | Stronger signature assurance | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR021 | M | Quantity receipt | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR022 | M | Reconciliation | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR023 | M | Exception records | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR024 | M | Uploads | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR025 | M | Evidence provenance | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR026 | M | Seal acceptance | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR027 | M | Evidence packet | Partial | Sealed payload PDF + JSON manifest generated; polish customer packet layout and evidence bundle before pilot. |
| FR028 | M | Corrections | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR029 | M | Partial and failed delivery | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR030 | M | Driver scope | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR031 | M | Offline drafts | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR032 | M | Sync integrity | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR033 | M | Offline authority boundary | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR034 | M | Visible recovery | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR035 | M | Native Android field application | Partial | Native encrypted queue/camera/scan source provided; physical Android build, 24-hour recovery and low storage validation pending. |
| FR036 | M | Billing evaluation | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR037 | M | Freight invoice record | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR038 | M | Packet and submission | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR039 | M | Approval and rejection | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR040 | M | Payment terms | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR041 | P2 | Accounting connectors | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR042 | M | Legal timing alerts | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR043 | M | Allocation ledger | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR044 | M | Deduction cases | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR045 | M | Reconciliation | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR046 | P2 | Recovery reporting | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR047 | M | Action queues | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR048 | M | Notifications | Partial | Outbox delivery adapter and bounded retry; full shift/holiday escalation scheduler and delivery callbacks remain. |
| FR049 | M | Escalations | Partial | Outbox delivery adapter and bounded retry; full shift/holiday escalation scheduler and delivery callbacks remain. |
| FR050 | M | Audit | Implemented core | Executable guards and persisted workflow; see tests/workflow.test.ts and database tests. |
| FR051 | M | Support access | Blocked by design | Platform administrators cannot browse shipments; approved temporary support grants are not implemented. |
| FR052 | M | Search and export | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR053 | M | E-way bill references | Partial | Manual references and compliance tasks; automatic timed expiry dispatch and official provider verification pending. |
| FR054 | M | Expiry alerts | Partial | Manual references and compliance tasks; automatic timed expiry dispatch and official provider verification pending. |
| FR055 | M | Extension workflow | Partial | Manual references and compliance tasks; automatic timed expiry dispatch and official provider verification pending. |
| FR056 | P2 | ULIP adapter | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR057 | P2 | Government write adapter | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR058 | P2 | Provider resilience | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR059 | P2 | Observation provenance | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR060 | P2 | Control tower | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR061 | P2 | Route and ETA | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR062 | P3 | Handling unit identity | Partial | Returnable serial/custody and dock scans exist; shipment handling-unit aggregation/disaggregation remains. |
| FR063 | P3 | Custody scans | Partial | Returnable serial/custody and dock scans exist; shipment handling-unit aggregation/disaggregation remains. |
| FR064 | P3 | Aggregation | Partial | Returnable serial/custody and dock scans exist; shipment handling-unit aggregation/disaggregation remains. |
| FR065 | M | Configuration and entitlement | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR066 | M | Data portability | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR067 | M | Exit and retention | Partial | Closing tenant stops writes; export supported. Retention/deletion and legal hold automation need approved policies. |
| FR068 | P2 | Enterprise identity | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR069 | M | Scan and assisted extraction | Partial | Native barcode lookup implemented; OCR suggestions are not implemented. |
| FR070 | P2 | Shared operational identifiers | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR071 | P2 | Device registry | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR072 | P2 | Telemetry ingestion | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR073 | P2 | GPS and trip visibility | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR074 | P2 | Operational alert rules | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR075 | P2 | Control room cases | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR076 | P2 | Customer tracking access | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR077 | P2 | ETA methods and confidence | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR078 | P2 | Sensors | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR079 | P2 | Incident video | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR080 | P2 | Driver monitoring review | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR081 | P2 | Breath test workflow | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR082 | P2 | Vehicle control boundary | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR083 | P2 | Driver score and incentives | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR084 | P2 | Fuel and toll reconciliation | Partial | Domain/device event foundations; vendor connectors, control-room map/ETA and field commissioning remain. No vehicle actuator. |
| FR085 | P4 | Maintenance intelligence | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR086 | P3 | WMS source of truth | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR087 | P3 | Inventory ledger | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR088 | P3 | Inbound operations | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR089 | P3 | Pick and dispatch | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR090 | P3 | Cycle counts | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR091 | P3 | Dock portal validation | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR092 | P3 | Returnable asset ledger | Partial | Executable stock/custody/count business APIs; external WMS and scanner deployment must be commissioned. |
| FR093 | P3 | Line feeding and milk runs | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR094 | P4 | Automation task boundary | Partial | Reviewed observations / mission state tracking only; no robot transport or motion controller. |
| FR095 | P4 | AMR AGV and drone pilots | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR096 | P4 | Weight and vision stock observations | Partial | Reviewed observations / mission state tracking only; no robot transport or motion controller. |
| FR097 | P4 | Slotting and digital twin | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR098 | P2 | Freight audit and payment controls | Partial | Calculation/review foundation and provenance; external ERP/OEM mapping and operational approval remain. |
| FR099 | P4 | Planning and return loads | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR100 | P4 | Customs and document automation | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR101 | P2 | Emissions reporting baseline | Partial | Calculation/review foundation and provenance; external ERP/OEM mapping and operational approval remain. |
| FR102 | P4 | Planner analytics and copilot | Deferred integration / scope | Requires approved provider contract, production adapter or separately implemented advanced algorithm; not represented as live. |
| FR103 | P2 | SaaS module access | Partial | Core workflow implemented; validate full SRS acceptance in customer UAT. |
| FR104 | P2 | Commissioning and investment gates | Partial | Calculation/review foundation and provenance; external ERP/OEM mapping and operational approval remain. |

## Nonfunctional validation

Type checks, web/API builds, domain regression tests and PostgreSQL RLS/immutability SQL tests run locally. NFR01–07, NFR11–15, NFR17–19 and NFR22 need measured deployment, device or operational acceptance. NFR08–10 and NFR21 have targeted automated tests, not exhaustive proof. NFR16 metadata export exists; complete evidence archive/restore needs field validation.
