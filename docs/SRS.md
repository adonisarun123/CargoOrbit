# Viskan Logistics Platform Final Software Requirements Specification

Prepared for Arun Mahendran and Viskan  
Version 2.0 | 24 October 2026 | Consolidated product and implementation baseline

## 1 Executive decision

Build a multi tenant logistics SaaS with Viskan as the initial operating customer. Launch with ePOD, a supported Android driver app, designated receiver approval, exception evidence and billing readiness. Expand through a connected fleet control tower, reviewed safety events, warehouse and returnable asset visibility, and later optimisation. Buy suitable devices and specialist automation systems while building the workflow and customer software layer. [C01]

This final specification combines the customer meeting notes, Viskan Technology Roadmap and ULIP research. The roadmap covers fleet safety, ePOD, warehouse technology and wider logistics capabilities. It is a strategic section of a larger document, rather than an implementation budget or interface specification. Phase assignments below establish proposed scope boundaries and require the appropriate business and technical sign-off.

ULIP supplies approved government logistics data. The SaaS owns receiver authority, receipt evidence, billing policies and operational workflows. Access to a dataset does not automatically grant source system write rights or unrestricted commercial redistribution. Current access and commercial terms must be confirmed. [S01, S02]

The initial business hypothesis is that earlier accepted invoice submission can reduce cash delays. Validate it with payer finance teams. A POD upload does not by itself complete a GRN, approve freight charges or start payment terms.

Recommend Next.js and TypeScript portals, React Native Android, NestJS API and workers, PostgreSQL, private evidence storage and a durable queue. Use a modular business core and separately deployable telemetry ingestion. Prefer approved India hosting where required; Neon remains conditional because its reviewed regions do not include India. [S17]

M covers ePOD and billing, P2 the connected control tower and integrations, P3 warehouse and returnables, and P4 advanced optimisation or automation. Software, hardware, source access, customer acceptance and investment gates remain separately controlled. System volumes, targets and cost allowances are planning assumptions, not existing Viskan fleet data or guaranteed outcomes.

## 2 Research findings and product implications

### 2.1 What ULIP provides

The Government of India describes ULIP as an API gateway bringing together logistics information from government systems. A July 2026 government release reports 46 systems across 12 ministries and departments, 142 APIs and more than 2,000 data fields. These are dated ecosystem metrics, not a guarantee that this SaaS will be entitled to every field. NLDSL is the logistics arm of NICDC and operates ULIP and other logistics platforms. [S01]

An official published onboarding description sets out registration, submission of a use case and data needs, review, an NDA, security checks and integration testing before data access. This is a useful starting sequence; the current portal agreement and approval checklist must govern implementation. Commercial software companies and startups participate in the ecosystem. [S02]

The DPIIT annual report for 2024 to 2025 records e-way bill integration and additional verification and logistics data capabilities. Public government material also documents vehicle and driver verification and FASTag based truck observations. Exact APIs, identifier requirements, fields, freshness, limits and permissions must be validated against the approved catalog. [S03, S32]

| Capability | Potential contribution | Boundary for this product |
| --- | --- | --- |
| Vehicle and driver data | Compliance checks during onboarding or dispatch | Not a substitute for customer authorization or physical inspection |
| E-way bill information | Validate references and monitor returned validity | Does not establish generation or extension rights |
| FASTag observations | Last observed toll crossing and transit milestones | Not continuous GPS or proof of goods receipt |
| Rail or container events | Future multimodal visibility | Not required for the road freight MVP |
| Other approved logistics data | Enrichment of later workflows | Enabled only for a permitted use case |

The SaaS must supply LR management, delivery records, receiver delegation, quantities and exceptions, evidence collection, billing readiness, disputes, notifications and audit exports. These are application responsibilities even when an upstream observation comes from ULIP.

### 2.2 ULIP access and commercial uncertainty

A current public official tariff, guaranteed free allowance, rate limit table, approval duration and contractual service level were not established by this research. Do not base the business plan on the MoM assumption that ULIP has no subscription or usage cost. Obtain current written terms and model upstream costs as a variable until confirmed.

Before committing to a customer, obtain answers on operator versus transporter onboarding, multi tenant use, customer consent, permitted downstream display, redistribution, raw data retention, caching, export, deletion, audit, security assessment, IP allowlisting, support, credential renewal and charges. A shared SaaS credential must never become a way to query unrelated vehicles or consignments without an approved purpose.

E-way bill write operations require an independent access assessment. NIC documents its own onboarding and transaction APIs. Source system integration within ULIP does not mean the SaaS can generate, cancel, extend or update an e-way bill through ULIP. [S04, S29]

### 2.3 The demo must be identified

Government also launched Track Your Transport as an end user application powered by ULIP. It supports tracking and vehicle or driver verification. The customer may have seen this, another NLDSL application, or private software using ULIP. The received Viskan roadmap is not the exact demo, URL or operational SOP referenced in the meeting; those items remain to be identified. They must be reviewed before copying workflow assumptions. Allcargo usage mentioned in the meeting was not independently verified. [S33]

Run two separate discovery exercises: an ePOD workflow pilot with consenting receivers and finance teams, and a technical data access assessment for ULIP. The first should not wait for the second unless an approved dataset is essential to the selected pilot.

### 2.4 Existing products and the build decision

The capabilities in this comparison are vendor published descriptions, not independently tested performance. Missing public detail means a demonstration is needed.

| Product | Published relevant capabilities | Benchmark for the proposed SaaS |
| --- | --- | --- |
| SuperProcure | OTP ePOD, configurable forms, SKU records, LR upload, shortage and damage, multi drop and GRN integration | Closest direct comparison for the initial workflow [S13] |
| Fleetx | Digital customer and driver acknowledgement, consignment booking, trip mapping, billing and recovery | Transporter operations and owned fleet fit [S14] |
| Pando | Automated POD, driver applications, ERP integration and broader transport management | Enterprise integration and freight workflow [S15] |
| Shipsy | Photo, signature, barcode and geofence delivery evidence | Later handling unit execution and scanning [S16] |

Pando and Fleetx announced their combination in August 2026; these offerings should not be counted as independent vendor groups in procurement. Numeric prices for the compared scope were not verified. Request matched scope demonstrations and quotations. [S31]

OTP, photos and a POD to billing trigger are established capabilities. Differentiation must be tested through implementation speed, customer adoption, delegated authority, exact finance acceptance requirements, transparent costs and deduction recovery workflow. A custom build is justified if repeatable needs remain unmet at a viable total cost; otherwise a configured existing product may be preferable.

## 3 Corrections to assumptions in the meeting

### 3.1 E-way bills and routes

Model a government e-way bill, commercial route plan and customer arrival SLA as separate concepts. Standard e-way bill validity is distance linked; the reviewed rules use one day for up to 200 km and an additional day per further 200 km or part, with different rules for specified cargo or movement types. There is no basis in the reviewed material to encode a universal government fixed road route. Use the official returned validUpto value as the authoritative compliance timestamp. [S34]

The present transporter can request an extension, or the generator where no transporter is assigned. NIC documents an eight hour window before and after expiry, plus reason, current location and remaining distance requirements. A local date change is not an official extension. [S04]

NIC release notes record the 2025 validations concerning document age and a 360 day extension ceiling. The 30 July 2026 update places proposed EWB Closure and mandatory Ship-to GSTIN changes on hold. Therefore this product must not imply that accepting a POD closes a government e-way bill. Rules and provider adapters require a monitored change process. [S05]

### 3.2 LR and invoices

An LR is separate from the e-way bill, but describing it as only internal is incomplete. A consignment note can have contractual and GST significance. GTA document particulars must be confirmed for the transporter and included where applicable. The software should keep the goods seller invoice, LR, e-way bill, ePOD, freight invoice and customer GRN as distinct linked records. [S06]

Delayed paper POD is commonly a commercial invoice submission gate. It is not a universal rule that a transporter is legally prohibited from issuing an invoice until POD arrives. Taxable service invoice timing and the transporter's GST status need CA review. Qualifying GTAs can have e-invoice exemptions, so an IRN must not be made mandatory for every transporter. [S07, S28]

### 3.3 Receipt and payment

A receiver may confirm quantity while reserving quality inspection or damage claims. Receipt does not necessarily approve freight rates, waive claims, complete the GRN or authorize payment. The product must track each milestone independently. Customer contracts must define which evidence replaces paper originals and which event starts payment terms.

The reported 5 percent short payment must be classified using actual ledgers. Contractual retention, shortage claims, agreed discounts, tax withholding and unidentified differences have different treatment. Statutory withholding may be a tax credit; it is not automatically collectible freight leakage. This product should record the classification and evidence, not presume that every difference is recoverable cash.

## 4 Product goals and commercial model

### 4.1 Intended users and buying decision

The initial buyer is a road transporter operating across India with recurring customer sites and delayed POD dependent billing. Receiver organizations participate as controlled external users. A consignee can differ from the party paying freight; both relationships must be modeled explicitly.

The initial positioning is delivery to billing and collections software for transporters. The platform may later serve shippers and 3PLs, but the initial release should not combine marketplace procurement, full accounting, fleet maintenance and warehouse execution.

### 4.2 Outcome measures

Measure baseline and pilot cohorts using the same customer sites and comparable lanes. Record delivery time, authorized acknowledgement, billing ready time, submission, customer acceptance and payment. Report medians and P90 as well as averages. Do not count an offline draft as a finalized POD or a generated invoice packet as an accepted invoice.

| Metric | Definition | Proposed pilot goal |
| --- | --- | --- |
| POD turnaround | Authorized acceptance minus unloading completion | At least 80 percent of eligible receipts within 24 hours |
| Billing preparation | Billing ready minus final required POD condition | P95 within 60 seconds for the system event |
| Submission delay | Actual invoice submission minus delivery | Reduce median versus agreed baseline |
| First pass acceptance | Invoices accepted without document rework divided by submitted invoices | Improve versus baseline |
| Electronic acceptance | Eligible deliveries accepted without original paper requirement | At least 80 percent at participating sites |
| Authorization failures | Proven unauthorized or incorrectly attributed confirmations | Zero accepted as valid in pilot |
| Cash improvement | Actual days to cash for comparable invoices | Observe over the full payment cycle |

These goals are proposed acceptance criteria, not evidence that 15 to 30 days will be saved. A four to six week operational pilot can validate workflow; a 60 to 100 day payment cycle requires longer follow up to demonstrate cash improvement.

### 4.3 Illustrative value calculation

For monthly eligible freight billings of INR 1 crore, a steady 30 day month and a 15 percent annual funding cost, saving 15 days could release approximately INR 50 lakh of receivables and avoid INR 7.5 lakh of annual financing cost. Saving 30 days could release INR 1 crore and avoid INR 15 lakh annually. These are calculations using assumptions, not forecasts.

Receivables released equals monthly eligible freight billings multiplied by days saved divided by 30. Annual financing benefit equals the released balance multiplied by the actual annual funding rate. Use freight charges rather than goods value from an e-way bill. Working capital release is a balance sheet change; it must not be counted as recurring new revenue. Savings occur only if the process change advances actual collection.

Test a subscription including an agreed delivery allowance, with transparent overage and separately scoped integrations. Receiver approvers should normally be free users because their participation is essential. Keep messaging, maps, eSign, tracking, ULIP usage and long term evidence costs visible. Proposed pricing needs customer interviews and cost validation rather than copying an unverified market tariff.

## 5 Scope and release boundaries

| Release | Included | Explicit boundary |
| --- | --- | --- |
| M ePOD and billing foundation | Tenant and customer setup, LR and trip records, Android photo and QR or barcode capture, offline drafts, named receiver OTP, exceptions, evidence packet, billing queue, manual invoice and deduction tracking | No general warehouse stock engine, continuous GPS promise, hardware safety controls or full SAP implementation |
| P2 Connected control tower | One agreed GPS or device provider, approved ULIP reads, customer tracking portal, alerts, reviewed driver safety pilot, sensor adapters, driver scorecards, one scoped ERP or TMS connector, freight audit and emissions reporting baseline | Device installation and approvals are separate; advanced predictive models require evidence; no automatic payment or in-motion immobilisation |
| P3 Warehouse and returnable assets | WMS integration or agreed WMS foundation, barcode or RFID execution, pallet and box custody, serial returnable racks and bins, reconciliation, counts and dock pilot | Existing WMS ownership and stock authority must be decided before writes; robotics remain separate vendor projects |
| P4 Advanced operations | Optimisation, return load matching, predictive maintenance, expanded multimodal visibility, warehouse automation integration, digital twin and planner copilot | Each module needs a data assessment, independent scope and business case; no blanket commitment to all roadmap technologies |

M supports a delivery and billing action dashboard. Live fleet maps, safety events and automatic ERP exchange belong to P2 unless discovery explicitly brings a defined adapter into the first paid scope. Barcode lookup of an LR in M is distinct from a full handling unit or warehouse stock ledger in P3. Manual imports and exports remain supported with provenance labels.

### 5.1 Customer roadmap reconciliation

The mapping below covers all four supplied roadmap subsections and the items visually highlighted by Viskan. Highlights are treated as prioritisation signals rather than evidence of agreed commercial scope. Source page numbers refer to the three page rendered copy of the received roadmap. [C01]

| Roadmap item | Release | Requirement coverage | Gate or interpretation |
| --- | --- | --- | --- |
| GPS, route, geofence, ETA, idle and deviation | P2 | FR059 to FR061, FR071 to FR077 | Provider signal quality, permissions and site rules |
| Breath analyser and proposed ignition lock | P2 pilot | FR081 FR082 | Calibrated vendor device and independent vehicle safety approval |
| Cabin DMS and road camera | P2 pilot | FR079 FR080 | Reviewed detection, clip access and driver privacy |
| Door, cargo, fuel, temperature and tamper sensors | P2 | FR078 FR084 | Units, calibration and hardware compatibility |
| Customer portal, app and ERP APIs | M web then P2 | FR014 FR068 FR076 FR103 | Web access first; separate customer app only if needed |
| Driver scoring and incentives highlighted on page 1 | P2 | FR080 FR083 | Exposure adjusted score and review process |
| ePOD, work copy, consignee sign-off and claims | M | FR013 to FR029, FR036 to FR045 | Customer receiving and finance acceptance |
| E-way bill, GST, SAP and TMS highlighted on page 1 | P2 adapters | FR041 FR053 to FR058 FR098 FR100 | Current access, tax classification and one defined interface per scope |
| Offline capture and QR or barcode scan | M | FR030 to FR035 FR069 | Supported Android device and field test |
| Warehouse priority 1 WMS and handheld scans | P3 first | FR086 to FR090 | Decide integrate existing WMS versus build foundation |
| Warehouse priority 2 dock RFID or barcode portals | P3 | FR091 | Read direction, missed reads and reconciliation pilot |
| Warehouse priority 3 AMR or AGV routes | P4 | FR094 FR095 | Specialist vendor and one or two controlled routes |
| Warehouse priority 4 drone or camera counts | P4 | FR090 FR095 | Site permission, safe operation and count verification |
| Warehouse priority 5 weight and vision stock | P4 | FR096 | Calibrated observations reviewed before stock adjustment |
| Warehouse priority 6 digital twin or slotting | P4 | FR097 | Reliable layout and movement data |
| About 24 month warehouse payback highlighted on page 2 | Every warehouse purchase | FR104 | Viskan investment gate, not a guaranteed market outcome |
| Multimodal control tower and 4PL visibility | P2 road then P4 modes | FR060 FR070 FR103 | Separate mode identifiers and permitted data sources |
| Return loads and load matching | P4 | FR099 | Start with private carrier network; public marketplace separate |
| Routing, milk runs and predictive ETA | P2 rules then P4 optimisation | FR077 FR093 FR099 | Feasible schedules and human release |
| Freight audit, payment and claims | M ledger then P2 audit | FR043 to FR046 FR098 | Rate evidence, maker checker and ERP authority |
| OCR and customs automation | M assisted capture then P4 customs | FR069 FR100 | Human validation and separately authorised filing |
| Fuel theft, toll analytics and predictive maintenance | P2 basic then P4 prediction | FR084 FR085 | Anomaly is not proof of theft or imminent failure |
| Returnable packaging for auto customers | P3 | FR062 to FR064 FR092 | Separate reusable asset identity from shipment identity |
| Cold chain if expanded | P2 optional adapter | FR078 | Cargo approved limits and calibrated devices |
| OEM carbon reporting highlighted on page 3 | P2 baseline then P4 assurance | FR101 | Named OEM method, factors and evidence required |
| ULIP, BI and planner AI | P2 data then P4 copilot | FR056 FR102 | Approved dataset use and scoped, reviewable answers |

### 5.2 Ownership and acceptance boundaries

Viskan's roadmap calls for owning the software layer and buying certified or appropriately approved hardware. The commercial agreement must separately define SaaS platform IP, customer specific configuration, integrations, source access or escrow if needed, data ownership, device firmware and third party licences. The roadmap alone does not transfer product IP or authorise resale of vendor or government data.

The broader platform is not a single fixed price ePOD feature list. M, P2, P3 and P4 need separate acceptance and commercial schedules. Viskan may change sequencing after discovery, but every promoted module must carry its hardware, integration, security and operational dependencies into that decision.

## 6 Actors and authorization

| Role | Authorized actions | Required restriction |
| --- | --- | --- |
| SaaS administrator | Tenant provisioning and service operations | No routine shipment browsing or customer sign-off; support access separately approved and audited |
| Transporter owner | Tenant configuration, staff, reporting and finance oversight | Cannot create customer approval authority unilaterally |
| Transport operations | LR, trips, assignments, evidence and escalations | Cannot impersonate a consignee |
| Driver or field operator | Assigned trip details, arrival and draft evidence | Cannot finalize customer acknowledgement |
| Customer administrator | Site approval policies, named receivers, alternates and revocation | Access limited to their organization and contracted shipments |
| Authorized receiver | View and accept assigned site or consignment quantities with exceptions | No unrelated customer documents or freight settlement authority by default |
| Transport finance | Billing packets, invoice status, due dates, receipts and disputes | Cannot rewrite accepted delivery evidence |
| Customer finance | Invoice acknowledgement and commercial acceptance when enabled | Does not automatically acquire physical receiver authority |
| Auditor | Read only authorized evidence and history | No changes or unrestricted exports |
| Control room and safety reviewer | Triage telemetry and safety events, contact operators and close reviewed cases | Cannot approve customer POD or issue unsafe vehicle commands |
| Warehouse operator and supervisor | Execute scoped site tasks and approve inventory adjustments where enabled | No cross customer stock access; adjustments require separate approval |
| Device technician | Commission and service assigned devices | No customer finance, video browsing or receiver approval rights |
| Sustainability reviewer | Validate emission inputs, methods and customer reports | Cannot invent missing activity or label estimates as verified measurements |

Access must combine role with tenant, organization relationship, facility, assignment and validity dates. One person may hold more than one explicit role. A user who belongs to multiple organizations must select an authorized context; the server validates that context for every operation.

## 7 Business workflow and state rules

### 7.1 Normal delivery

1. Transport operations creates or imports an LR, related goods invoices and e-way bill references. It assigns a trip, stop, vehicle and driver.
2. Operations confirms the receiving site and eligible customer maintained receiver policy. Missing authority creates a task before delivery.
3. The driver records arrival, unloading milestones and draft evidence. Driver capture is visibly distinguished from customer confirmation.
4. The receiver opens an authenticated invitation, checks the LR, line quantities, evidence and acknowledgement wording, and records exceptions.
5. The server verifies current assignment, authority, payload version and a transaction bound OTP or approved login assurance. It seals the acceptance and writes an outbox event atomically.
6. A worker generates the evidence packet. The billing policy evaluates POD, GRN, documents and other configured conditions.
7. Finance sees ready or blocked status with reasons. It issues or links the freight invoice through the selected accounting process and submits the required packet.
8. The system records customer acknowledgement, acceptance or rejection, due date, payment allocations and any deduction dispute.

### 7.2 Separate state dimensions

| Dimension | States | Important guard |
| --- | --- | --- |
| Shipment | Draft, released, in transit, arrived, unloading, delivered, refused, return required, cancelled | Delivered is an operational event, not an invoice acceptance |
| POD | Not started, draft, awaiting receiver, accepted, accepted with exceptions, refused, correction pending, superseded | Final acceptance requires current customer authority |
| Billing readiness | Blocked, ready, held for review | Each blocker has an owner and resolution |
| Freight invoice | Draft, issued, submitted, acknowledged, accepted, rejected, voided or credited | Accounting identifiers remain authoritative |
| Settlement | Not due, due, partially paid, paid, short payment review, disputed, settled by agreement | Cash, tax credit and commercial adjustments are separate allocations |
| E-way compliance | Unknown, valid, expiring, extension pending, extension confirmed, expired, cancelled | Official status is distinct from local alerts |

No single status field may collapse these dimensions. A shipment accepted with damage can have a valid POD and a pending commercial dispute. A refused delivery may have no goods receipt but must retain refusal evidence. Cancellation after dispatch requires a reason and return disposition rather than deletion.

### 7.3 State transition controls

Accepted POD data is immutable. A correction creates a new version referencing the original, explains the reason and requires renewed authorization where the accepted substance changes. Existing invoice submissions remain linked to the version actually submitted. A late arriving event cannot regress an invoice from accepted to submitted or undo a finalized receipt silently.

Billing ready is calculated from a versioned customer policy. Suggested conditions are final authorized POD for every required stop or LR, required documents present and scanned, GRN if contractually needed, resolved mandatory discrepancies and a valid payer mapping. A provider outage or optional telematics gap must not block delivery acceptance unless the agreed policy explicitly requires it.

### 7.4 Fleet warehouse and asset workflows

Telemetry flows from a permitted device or vendor adapter into a validated event stream, through versioned alert rules and into a control room case. Cases progress through new, acknowledged, under review, action recorded, resolved and dismissed with reason. Alarm generation and delivery are separate milestones. Out of hours staffing and response ownership must be defined; this application is not an emergency service.

A warehouse receipt progresses through expected, arrived, counted, exception or quarantine, accepted into the authoritative WMS and put away. Picking and dispatch consume reserved stock through confirmed tasks. Local stock changes and ERP confirmation must not both post the same movement. Corrections use compensating transactions rather than editing the balance history.

A returnable rack or bin moves through issued, in transit, at customer, return due, returned, under repair, lost by approved decision and retired. A reusable asset can carry many shipments over its lifetime. Its asset identity persists while shipment or contents identity changes.

## 8 Functional requirements

Each requirement below uses shall as a mandatory behavior for its marked release. The release identifier is part of scope control. Business policy changes must be recorded with effective dates rather than silently changing historical decisions.

### 8.1 Tenants and master data

**FR001 M Tenant isolation.** The system shall provision separate transporter workspaces and enforce tenant scope on API operations, records, exports, documents, jobs and reports. A request from tenant A using any tenant B identifier shall be denied without disclosing the protected record.

**FR002 M Company and site records.** The system shall maintain transporter, consignor, consignee, freight payer, partner and facility records with addresses, state, PIN code, relevant GST or transporter identifiers and active dates. Consignee and payer shall be independent references.

**FR003 M Membership.** The system shall support invitations, verified contacts, role assignment, suspension and revocation. Removing a user shall end new access and pending approval authority while retaining historical attribution.

**FR004 M Receiver governance.** Only an authorized customer administrator shall approve or revoke that organization's receiving staff. Initial administrator enrollment shall require documented verification with a named business sponsor and be audited.

**FR005 M Customer policies.** Authorized administrators shall configure required documents, quantity tolerances, receiver scope, optional GRN, escalation timing, original paper requirements and billing rules. The system shall record policy version, approver and effective date.

**FR006 M Import validation.** CSV or spreadsheet imports shall provide a preview, row level errors and duplicate detection before committing valid records. Importing the same external batch twice shall not create duplicate LRs or invoices.

### 8.2 LR shipments and trips

**FR007 M LR identification.** The system shall assign or accept an LR number unique within the agreed tenant, issuing branch and financial year namespace. It shall retain the original external number and immutable internal identifier.

**FR008 M Consignment contents.** Each LR shall support goods invoice references, descriptions, SKU or customer item codes where available, packages, quantities, units, weight and declared goods value. Freight value shall be stored separately from goods value.

**FR009 M Document relationships.** The system shall support multiple LRs on one trip, multiple goods invoices and e-way bills linked to an LR, and multiple delivery stops. It shall support an LR allocation across delivery attempts without assuming one truck equals one invoice equals one POD.

**FR010 M Dispatch.** Operations shall assign vehicle, driver, transporter partner, origin, destination, planned route and contractual arrival time. Changes shall preserve previous assignments and notify affected users.

**FR011 M Operational milestones.** Assigned users shall record dispatch, gate arrival, unloading start and end, refusal and return events. Each event shall preserve capture source, occurrence time and server receipt time.

**FR012 M Cancellation and reattempt.** The system shall record cancellation, failed attempt, redelivery, transshipment and vehicle replacement with reasons. A reattempt shall retain previous evidence and produce a separate attempt record.

### 8.3 Designated receiver confirmation

**FR013 M Scoped authority.** A receiver grant shall identify organization, facility, allowed action, active period and the granting administrator. An optional shipment restriction shall narrow that grant. The server shall recheck authority at confirmation time.

**FR014 M Secure invitations.** An invitation shall be short lived and limited to the relevant shipment or stop. A forwarded link alone shall not allow final acceptance. Sensitive consignment information shall require authenticated, authorized access.

**FR015 M Transaction bound OTP.** The system shall issue an OTP only to a preapproved receiver contact and bind the challenge to the receiver, action, shipment or stop, POD version and canonical payload hash. Changing quantities or reservations shall invalidate the challenge.

**FR016 M OTP protection.** OTPs shall expire after five minutes by default, allow at most five verification attempts and have resend and rate limits. Store verification outcomes and provider references, never plaintext OTPs in logs or durable evidence. Resending shall invalidate earlier live challenges for the action.

**FR017 M Explicit consent.** Before confirming, the receiver shall see the material quantities, exception wording, sign-off meaning, authority declaration and privacy notice. No acceptance shall be inferred from opening a link or viewing a document.

**FR018 M Delegation and revocation.** Customer administrators shall appoint time limited alternates and revoke access. The transporter and driver shall not appoint an alternate receiver independently. Revocation before final submission shall cause a pending challenge to fail.

**FR019 M Authority exceptions.** If no authorized receiver is available, the system shall capture provisional delivery evidence and open an escalation. Such evidence shall remain distinct from customer authorized POD and shall block any policy requiring that POD.

**FR020 P2 Stronger signature assurance.** Where a contract requires it, the system shall integrate a selected CCA eSign or other approved signature provider and retain its signed document, validation result and transaction reference. Provider failure shall not be represented as completed signing.

### 8.4 Delivery and evidence

**FR021 M Quantity receipt.** The receiver shall record shipped, accepted, short, damaged and rejected quantities for the relevant lines and units. Short means not physically received; damaged and rejected are disjoint received dispositions unless a customer policy defines a separate damage observation. Double counting shall be prevented.

**FR022 M Reconciliation.** For every attempt line, expected quantity allocated to that stop and attempt shall equal accepted plus damaged plus rejected plus short, allowing explicit unit conversions and documented tolerances. Maintain cumulative receipt dispositions and outstanding quantities across attempts so the same units cannot be acknowledged twice. Reattempt allocation shall not automatically reuse the full original shipped quantity. Unexpected overdelivery shall be recorded separately.

**FR023 M Exception records.** Damage, shortage, seal mismatch, wet goods, package mismatch, refusal and other reasons shall support notes and evidence. Acceptance with reservations shall preserve the exact reservation rather than displaying a clean delivery label.

**FR024 M Uploads.** Authorized users shall upload photographs, stamped work copies and supporting PDF or image documents. Files shall be size and type checked, malware scanned and quarantined before sharing if unsafe or unverified.

**FR025 M Evidence provenance.** The system shall preserve original bytes, content hash, object version, uploader, capture time when available, server time and capture method. The acknowledged payload shall bind each reviewed attachment ID, immutable object version and hash. Mandatory attachments must be durably stored and scan clean before their applicable acceptance or billing gate passes. Later uploads shall be supplemental evidence or a correction and shall not alter the originally acknowledged set. Extracted image metadata shall be treated as untrusted.

**FR026 M Seal acceptance.** Final acceptance shall atomically persist the acknowledged payload, receiver grant snapshot, authentication outcome, policy version, POD version, timestamp and audit event. The exact accepted version shall remain retrievable.

**FR027 M Evidence packet.** The system shall generate a readable PDF and machine readable manifest containing LR, relevant invoice references, item receipt, reservations, sign-off identity, authority basis, timestamps and evidence hashes. A verification link shall reveal only authorized information.

**FR028 M Corrections.** The system shall prevent overwrite or deletion of finalized PODs through normal user functions. Corrections shall create linked versions, record who requested and approved them, and trigger reacceptance where required by policy. Material corrections shall hold affected ready but unsubmitted billings for reevaluation. Already submitted invoices shall keep their original evidence link and open a review task rather than silently changing their packet.

**FR029 M Partial and failed delivery.** The system shall support partial delivery, multiple stops, receiver refusal and returns. A completed stop shall not finalize undelivered quantities at another stop or release an aggregate invoice without the applicable policy check.

### 8.5 Driver and offline operation

**FR030 M Driver scope.** The driver interface shall expose only assigned active work and necessary contact information. Shared devices shall require explicit account switching and shall not expose the previous user's local drafts.

**FR031 M Offline drafts.** Supported devices shall retain an arrival or POD draft, photos and local event identifier during connectivity loss. The interface shall state saved on device and awaiting sync until the server confirms receipt.

**FR032 M Sync integrity.** Upload retries shall use stable operation identifiers and content checksums. Reconnection, application restart and duplicate sync shall not create duplicate attachments or receipt events. The server shall reject stale state changes for review.

**FR033 M Offline authority boundary.** Offline capture shall not be labeled a completed online OTP confirmation. A live server check shall be required for final customer authorization, or a separately designed and approved offline trust protocol shall be scoped in a later release.

**FR034 M Visible recovery.** The driver shall see pending, uploading, failed and synchronized items, with manual retry and escalation. Browser storage limits or failed persistence shall produce a visible error rather than a false saved message.

**FR035 M Native Android field application.** The system shall provide a supported React Native Android application for assigned work, camera evidence, QR or barcode lookup and an encrypted local draft queue. It shall resume uploads after restart and connectivity recovery, and display persistence failures. Background location remains P2 and must show permission or operating system gaps. The receiver shall retain a browser based confirmation option.

### 8.6 Billing and customer acceptance

**FR036 M Billing evaluation.** The system shall evaluate versioned customer billing rules after POD acceptance and each subsequent blocker resolution. It shall display ready or blocked status, every mandatory blocker, responsible owner and evaluation time.

**FR037 M Freight invoice record.** Finance shall create a draft billing record or link an externally issued freight invoice, capturing payer, number, issue date, charge lines, tax treatment reference, amounts and accounting source. The MVP shall not calculate authoritative GST liability.

**FR038 M Packet and submission.** Finance shall assemble the customer required packet, export it and record actual submission channel, timestamp and reference. Generated or downloaded shall remain distinct from submitted and acknowledged.

**FR039 M Approval and rejection.** Customer finance or an authorized integration shall acknowledge, accept or reject an invoice with reasons and supporting references. A rejection shall open a task without erasing its submission history.

**FR040 M Payment terms.** A payer policy shall identify the contractual trigger for due dates, including delivery, GRN, submission, acceptance or an agreed calendar rule. The system shall record the trigger used and allow an audited finance override.

**FR041 P2 Accounting connectors.** An approved connector shall exchange invoice records and customer responses using idempotency and external identifiers. An uncertain timeout shall trigger reconciliation before any retry capable of creating a second invoice.

**FR042 M Legal timing alerts.** Finance shall be able to configure review reminders for invoice issue deadlines and missing tax data. The software shall not state that POD acceptance grants legal permission to issue an invoice or that all transporters require IRN.

### 8.7 Payment deductions and disputes

**FR043 M Allocation ledger.** Finance shall allocate incoming money, statutory withholding, agreed credits, contractual retention and disputed deductions separately against freight invoices. Unallocated balances shall remain visible.

**FR044 M Deduction cases.** Every disputed deduction shall record amount, reason, customer reference, evidence, owner, next action and status. Quantity claims shall link to the relevant POD version and line items.

**FR045 M Reconciliation.** For each invoice the system shall reconcile billed amount with cash, verified tax credit or withholding, authorized adjustments and unresolved balance. Partial payments and payments spanning several invoices shall be supported.

**FR046 P2 Recovery reporting.** Reports shall distinguish claimed, recovered, waived, legally withheld and unresolved amounts. Only actual verified recoveries above the comparison baseline shall be counted as recovery benefit.

### 8.8 Alerts support and audit

**FR047 M Action queues.** Dashboards shall show awaiting receiver, missing documents, correction requests, billing blockers, rejected invoices and overdue amounts, each with an owner and aging.

**FR048 M Notifications.** The system shall send configured transactional messages through approved channels and retain provider message identifiers, delivery results and retry status. A delivered SMS shall not count as a customer approval.

**FR049 M Escalations.** Time based escalation shall respect site shifts, holidays and time zones where configured. Repeated reminders shall be deduplicated and shall stop when the underlying task is resolved or cancelled.

**FR050 M Audit.** Security and business relevant changes shall record actor, tenant, role, target, action, result, server timestamp and correlation identifier. Audit access and exports shall themselves be logged.

**FR051 M Support access.** Elevated support access shall be time limited, reason coded, approved by the designated tenant authority and logged. Support shall not sign PODs or silently change evidence.

**FR052 M Search and export.** Authorized users shall search by LR, shipment, vehicle, goods invoice, e-way bill and freight invoice. Exports shall apply the same scope as the screen and protect against formula injection in spreadsheet output.

### 8.9 External data and compliance tasks

**FR053 M E-way bill references.** The MVP shall capture e-way bill number, issuing source, linked goods documents, returned or manually recorded validity and verification provenance. Unknown or stale values shall be visibly labeled.

**FR054 M Expiry alerts.** The system shall independently track commercial ETA and e-way bill expiry. Alerts shall use authoritative returned validity when available, configured reminder offsets and an assigned compliance owner.

**FR055 M Extension workflow.** A driver delay report shall create a compliance task with reason, location and remaining distance. The MVP shall record the authorized official action and outcome; a local task completion shall not change the government validity automatically.

**FR056 P2 ULIP adapter.** Approved datasets shall be enabled by tenant and use case, with purpose checks, authorized identifiers, credential protection, usage metering, response provenance and configurable freshness. Restricted raw data shall not leak into general exports or analytics.

**FR057 P2 Government write adapter.** E-way bill generation, extension or other mutation shall be enabled only after explicit provider access, transporter authority, contract tests and approval. Pending, failed and officially confirmed outcomes shall remain distinct.

**FR058 P2 Provider resilience.** Adapters shall implement timeouts, rate limits, bounded retries, circuit breakers and reconciliation. Upstream outage shall show degraded status and preserve permitted manual fallback without claiming verification.

### 8.10 Later control tower and handling units

**FR059 P2 Observation provenance.** Each tracking observation shall include provider, observation time, ingest time, location accuracy or event type and freshness. Last known position shall not be displayed as a current position without qualification.

**FR060 P2 Control tower.** Authorized users shall view shipments, exceptions, customer sites, responsible partners and linked billing outcomes in a common dashboard. Cross company sharing shall require an explicit relationship and field level access policy.

**FR061 P2 Route and ETA.** Route deviation, dwell and ETA alerts shall identify the signal and rule used. Missing GPS or FASTag coverage shall produce unknown or stale status rather than a fabricated movement.

**FR062 P3 Handling unit identity.** Each tracked pallet, box or parcel shall have a unique identifier and link to shipment contents. GS1 SSCC may be used where partners adopt it; internal identifiers shall not be presented as certified GS1 identifiers. [S27]

**FR063 P3 Custody scans.** Dispatch, loading, transfer, unloading and receipt scans shall record handling unit, facility, actor, event time and outcome. Duplicate, missing and unexpected units shall create reason coded exceptions.

**FR064 P3 Aggregation.** The system shall record which boxes belong to a pallet over time, including repacking and disaggregation. A truck location event shall not constitute a box custody event or final unit receipt.

### 8.11 SaaS administration and portability

**FR065 M Configuration and entitlement.** The platform shall enforce per tenant feature access and limits without changing historical evidence. Commercial SaaS billing shall be separate from the transporter's customer freight invoicing.

**FR066 M Data portability.** Authorized tenant administrators shall export agreed master data, LR records, evidence, accepted payloads and audit manifests in documented formats. Export shall preserve relationships and object checksums.

**FR067 M Exit and retention.** Tenant closure shall stop new processing, provide an agreed export period and apply a documented deletion and retention schedule. Legal holds and regulated records shall not be erased by a general account delete action.

**FR068 P2 Enterprise identity.** The platform shall support customer SSO and scoped API service accounts where contracted. Human approvals shall retain a named human actor rather than attributing them only to a generic integration identity.

### 8.12 Fleet telemetry and control room

**FR069 M Scan and assisted extraction.** The Android application shall scan configured LR, consignment and invoice QR or barcodes and resolve the exact tenant scoped record. OCR may propose fields with source evidence and confidence; a user shall validate critical identifiers, quantities and amounts before saving. Scanning a label shall not itself confirm delivery.

**FR070 P2 Shared operational identifiers.** The platform shall maintain a controlled map between its vehicle, driver, trip, customer, site and consignment IDs and external provider or ERP IDs. It shall retain validity periods and source, and block ambiguous associations instead of silently linking the wrong truck, employee or stock record.

**FR071 P2 Device registry.** The system shall record each device, vendor, serial, vehicle or facility assignment, firmware, capability, applicable approval evidence, calibration and active period. Each device or vendor account shall have scoped credentials, revocation and audit. Reassignment shall preserve which vehicle or asset produced historical observations.

**FR072 P2 Telemetry ingestion.** Ingestion shall support the agreed vendor HTTPS interface or MQTT gateway, normalize event schema, retain event and ingest times, deduplicate identifiers, flag clock skew and reject unauthorized tenant or vehicle assertions. Late and out of order messages shall not overwrite newer position or health state.

**FR073 P2 GPS and trip visibility.** The dashboard shall display the last observed vehicle position, observation age, source and assigned trip. It shall distinguish missing signal, stopped vehicle and app or device offline. A location shall not imply receipt of a consignment or completion of a handling unit scan.

**FR074 P2 Operational alert rules.** Authorized administrators shall configure versioned geofences, dwell, idle, route deviation, signal loss and sensor thresholds by customer, site or vehicle class. Rules shall use duration, tolerance or hysteresis where needed to suppress location jitter and repeated flapping. Material changes shall be audited.

**FR075 P2 Control room cases.** Alerts shall have severity, owner, evidence, notification outcome, acknowledgement and action history. The system shall escalate unacknowledged cases according to a staffed service policy and distinguish delivered notification from human response. Dismissal shall require a reason and preserve the original event.

**FR076 P2 Customer tracking access.** Customer tracking pages and APIs shall reveal only contracted shipments and allowed fields for an agreed period. Links shall expire or be revocable; precise location, driver contacts and video shall not become public by default. A dedicated customer mobile app is optional and separately scoped.

**FR077 P2 ETA methods and confidence.** Initial ETA shall use a documented rule or licensed mapping service. Traffic, weather or historical models shall be enabled only with valid sources and validation against actual arrivals. Show method, update time and uncertainty, use a fallback when data is insufficient and measure median and P90 arrival error by lane.

### 8.13 Safety sensors and driver performance

**FR078 P2 Sensors.** The system shall ingest agreed door, cargo, fuel, temperature, humidity, tamper and other signals with units, calibration, sensor health and source. It shall distinguish a threshold breach from a faulty or disconnected sensor. Cold chain thresholds and actions shall be customer and cargo specific and approved before use.

**FR079 P2 Incident video.** The platform shall ingest incident metadata and selected event clips from an approved camera vendor, recording camera, vehicle, time, location and immutable evidence references. Access, download and retention shall be role restricted and audited. Continuous cloud video streaming or blanket retention is excluded from the default scope.

**FR080 P2 Driver monitoring review.** Fatigue, distraction, phone use, seatbelt and collision warnings shall retain provider category, confidence where supplied, clip and human review outcome. Unreviewed detections shall remain allegations or warnings. The system shall support correction, false positive review and appropriate driver coaching without automatic punitive decisions.

**FR081 P2 Breath test workflow.** A calibrated vendor device shall associate a pretrip test with the named driver, trip, device, timestamp, result unit and validity. Missing, failed, expired or tampered tests shall create a controlled dispatch hold and review task under the customer SOP. In-trip checks shall be requested only at a safe stationary location.

**FR082 P2 Vehicle control boundary.** The SaaS shall not send in-motion ignition disable commands. Any prestart interlock shall be a separately approved vendor engineered installation with vehicle suitability assessment, local safety logic, tamper handling and documented override. The software shall record its state and dispatch decisions; a cloud timeout shall not become an uncontrolled actuator command.

**FR083 P2 Driver score and incentives.** A versioned scoring policy shall explain contributing reviewed events, exposure such as distance or driving hours, exclusions and minimum data. No-data drivers shall not receive a fabricated zero safety score. Supervisors shall review corrections and incentive eligibility; payroll or disciplinary effects require a separate approved process.

**FR084 P2 Fuel and toll reconciliation.** Fuel anomalies and toll events shall link to trips and reconcile sensor units, refuels, receipts and permitted FASTag observations. Suspected theft shall be labeled for investigation, not proven from one sensor change. The dashboard shall separate measured consumption, estimates, toll events and accounting expenditure.

**FR085 P4 Maintenance intelligence.** Vehicle maintenance records may combine odometer, engine fault, TPMS and service data. Start with rule based due reminders; predictive failure estimates shall require validated outcomes and disclose confidence and data gaps. The application shall not certify roadworthiness or replace prescribed inspections.

### 8.14 Warehouse execution and returnable packaging

**FR086 P3 WMS source of truth.** Before enabling warehouse writes, Viskan shall choose the authoritative WMS per site and customer. An adapter shall exchange masters, expected receipts, stock movements and dispatch confirmations with reconciliation. Building a WMS foundation is an alternative scope; it shall not run as a second uncoordinated stock authority.

**FR087 P3 Inventory ledger.** The warehouse module shall track SKU, owner, facility, bin, unit, lot or serial where required, condition, quantity and reservation. Every change shall be a referenced inventory movement. Concurrent tasks shall not produce double allocation, unauthorized negative stock or movement across customer ownership without an approved transfer.

**FR088 P3 Inbound operations.** Handheld scans shall compare received goods with an ASN or expected receipt, capture shortages and damage, support quarantine and direct approved putaway. A receipt event shall distinguish physical arrival, accepted inventory and ERP posting so a gate scan cannot automatically confirm all stock as available.

**FR089 P3 Pick and dispatch.** Authorized tasks shall reserve stock, identify the correct SKU or serial and location, verify picked quantities and confirm loading against shipment allocations. Scan mismatches shall block completion or require a reason and supervisor approval. Dispatch shall update custody and the authoritative inventory ledger once.

**FR090 P3 Cycle counts.** The system shall assign count tasks, preserve expected versus observed values and support blind counts, recount and supervised adjustments. A count from a drone, fixed camera or handheld shall retain source and confidence. Automated observations shall not directly rewrite stock balances without the approved verification process.

**FR091 P3 Dock portal validation.** RFID or barcode portals shall correlate reads to a dock movement and expected units, infer direction only from tested signals, and suppress duplicate or stray reads. Missing, unexpected or ambiguous reads shall open reconciliation tasks; a passing RF read alone shall not establish accepted goods quantity.

**FR092 P3 Returnable asset ledger.** Serialized racks, bins, pallets and other returnables shall have owner, identifier, custodian, location, condition, issue and due dates, repairs and retirement. Track issue, handover, return and loss separately from the shipment carried. Partner disputes shall preserve custody evidence and agreed charge rules.

**FR093 P3 Line feeding and milk runs.** For agreed auto customer processes, the system shall model replenishment requests, required times, line-side locations, containers and completed deliveries. Milk run execution shall show unserved requirements and exceptions. Optimised scheduling belongs to P4; the system shall not promise JIT continuity from location data alone.

**FR094 P4 Automation task boundary.** Warehouse automation integrations shall send business missions through a selected vendor WCS or fleet manager and receive accepted, running, completed, failed and cancelled outcomes. Stable mission IDs shall prevent duplicate execution. Emergency stop, obstacle avoidance and machine safety shall remain in the specialist control system.

**FR095 P4 AMR AGV and drone pilots.** Each robotics or aerial count pilot shall define site, equipment, permissions, operator, safety owner, vendor support, manual fallback and measured baseline. Start with one or two approved routes or count zones. The SaaS shall consume mission or count results without taking over low level motion control.

**FR096 P4 Weight and vision stock observations.** Approved sensors may estimate bin quantities using calibrated tare, item weight or a validated vision model. Store the method, tolerance and confidence, flag mixed or uncertain contents and require the agreed review before replenishment or inventory adjustment. An estimate shall not be labeled a physical verified count.

**FR097 P4 Slotting and digital twin.** Slotting or simulation shall use versioned layout, item constraints, movement and handling data. Recommendations shall identify assumptions and be compared with actual travel or throughput. Changes to physical storage layout require supervisor approval; a visual model alone shall not be described as a validated digital twin.

### 8.15 Audit optimisation sustainability and AI

**FR098 P2 Freight audit and payment controls.** The system shall compare agreed rate cards, distance basis, vehicle class, POD, approved detention and surcharge evidence against invoice lines. Differences shall go to a review queue with rule version and tolerances. ERP payment export shall require maker checker approval; the SaaS shall not autonomously initiate bank payments.

**FR099 P4 Planning and return loads.** Route or load matching shall respect vehicle capacity, cargo compatibility, service times, customer windows and approved driver duty constraints. Show infeasible or unserved work. Planners shall release assignments. Begin with permitted private carrier data; public marketplace onboarding, settlement and liability require a separate scope.

**FR100 P4 Customs and document automation.** OCR or AI may propose customs and compliance data linked to original documents, but authorized staff shall validate and approve submissions. Filing connectors require specific authority, mappings and acknowledgement handling. No model shall create an official clearance, legal classification or government status without authoritative confirmation.

**FR101 P2 Emissions reporting baseline.** The system shall retain fuel or activity inputs, distance, load and empty-leg allocation where relevant, factor source and version, method, boundary and calculation evidence. Reports shall distinguish measured, modelled and default data and show units and intensity basis. A sustainability reviewer shall validate the named OEM format; estimates shall not be marketed as independently certified results.

**FR102 P4 Planner analytics and copilot.** The platform may answer scoped operational questions using authorised data and cite contributing records and freshness. It shall disclose missing information, record requested actions and require role appropriate approval for changes. It shall not bypass tenant permissions, finalize PODs, move money, command vehicles or alter stock from a generated answer.

**FR103 P2 SaaS module access.** The platform shall enable fleet, safety, finance, customer, warehouse and emissions modules by tenant contract and user permission. White label or client APIs shall enforce the same scope and data restrictions. Safety clips, employee records and customer freight rates shall not become shared control tower data by default.

**FR104 P2 Commissioning and investment gates.** Each device or automation rollout shall retain a signed commissioning checklist, capability test, support owner and acceptance result. Warehouse investments shall include incremental cost, measured savings and the Viskan target of payback within about 24 months, with explicit management exceptions. A passed ePOD pilot shall not approve hardware or warehouse capital automatically.

## 9 Proposed ePOD document and sign-off panel

The ePOD is a presentation of an accepted data version, not the only stored evidence. The same version must drive the user review screen, acknowledgement payload, PDF and manifest. An example blank form should be populated from the fields below during the customer workshop.

| Field group | Fields | Validation or policy |
| --- | --- | --- |
| Document identity | ePOD ID, version, LR number and date, internal shipment ID, delivery attempt | Immutable accepted version and unique references |
| Transporter | Legal name, partner ID, branch, contact and applicable identifiers | Source from master data snapshot |
| From | Consignor, pickup site, address, state and PIN code | Actual pickup versus billing address distinguished |
| To | Consignee, receiving site, address, state and PIN code | Receiver authority must match site |
| Commercial parties | Freight payer, buyer reference, PO and booking references | Payer need not equal consignee |
| Goods documents | Seller invoice numbers and dates, e-way bill references | Multiple linked documents allowed |
| Transport | Trip, vehicle, driver reference and planned lane | Personal details minimized in shared copy |
| Milestones | Dispatch, arrival, unloading complete, claimed occurrence and server acceptance time | Time zone displayed; manual time edits audited |
| Goods receipt | Description, SKU, unit, shipped, accepted, damaged, rejected, short | Reconciled with policy and unit conversions |
| Exceptions | Seal, condition, shortage, reason, remarks and photo references | Reservations remain visible |
| Work copy | Stamped LR or work copy and attachment list | Optional or mandatory per contract |
| Sign-off panel | Receiver name, organization, site, role, authority grant ID, authentication method and reference | No raw OTP or Aadhaar number |
| Declaration | Receipt meaning, reservations, authority and privacy notice version | Explicit confirmation required |
| Integrity | Accepted payload hash, packet hash, version, server timestamp and restricted verification link | Verification must not expose protected data |
| Finance status | Billing rule version, outstanding blockers, invoice references | Clearly separate from goods receipt |

Proposed declaration for legal and customer review: The goods recorded above have been received at the stated site in the quantities and condition shown, subject to the listed exceptions and any agreed inspection process. I am authorized by the receiving organization to record this receipt. This acknowledgement does not by itself approve freight charges or waive claims outside the agreed terms.

The system shall allow approved customer wording without allowing changes to an accepted declaration. A scanned stamp or drawn signature may be supporting evidence, but does not by itself establish that the signer was an authorized employee.

## 10 Data model and integrity rules

### 10.1 Core entities

| Entity | Key data and relationships |
| --- | --- |
| Tenant | Subscription workspace, configuration, geography and status |
| Organization and relationship | Transporter, consignor, consignee, payer and partner roles; explicit sharing permissions |
| Facility | Organization, addresses, site code, approved geofence and time zone |
| User and membership | Verified identity, tenant and organization roles, state and revocation |
| Receiver grant | User, customer organization, facility, action, validity, grantor and history |
| LR and consignment line | Number namespace, parties, items, units, goods and freight references |
| Goods document | Seller invoice or challan; links to relevant consignments |
| E-way bill reference | Number, linked goods documents, validity, source and last verification |
| Trip and stop | Vehicle, driver, ordered stops, assignments and milestones |
| Delivery attempt | Consignment stop allocation, events, result and return link |
| POD and POD version | Immutable accepted payload, quantities, declaration, grant snapshot and status |
| Auth challenge | Action and payload binding, expiry, attempt count and verification outcome |
| Evidence object | Private key, version, hash, MIME type, scan state and retention class |
| Billing policy and evaluation | Versioned conditions, evaluated result and blocker list |
| Freight invoice and submission | Accounting reference, amounts, status, packet version and customer response |
| Receipt allocation and dispute | Cash, withholding, adjustments, unresolved balance and deduction case |
| Audit event and outbox | Append only events, correlation ID, delivery state and retry metadata |
| Integration account and observation | Approved purpose, tenant binding, provider references, freshness and usage |
| Handling unit and custody event | P3 identifiers, parent child history, scan events and contents |
| Device and assignment history | Vendor, capabilities, calibration, credentials, vehicle or site and active interval |
| Telemetry observation and alert | Event time, ingest time, source, units, health, rule version and case history |
| Safety test and reviewed event | Driver, trip, test or clip reference, result and reviewer outcome |
| Score policy and score period | Exposure, reviewed contributions, exclusions, corrections and incentive approval |
| Warehouse item and inventory movement | Owner, SKU, bin, condition, lot or serial, units, task and immutable posting |
| Returnable asset and handover | Persistent asset ID, owner, custodian, shipment link, due date and condition |
| Automation mission | Vendor mission reference, state, command intent, acknowledgement and outcome |
| Emissions calculation | Inputs, source quality, boundary, allocation, factor version and reviewed report |

### 10.2 Relationship constraints

A tenant has many LRs and trips. A trip carries many consignment allocations; a consignment can move across trips following transfer. A delivery attempt belongs to an allocation and stop, and can produce multiple POD versions with one currently effective version. Goods documents and e-way bill references can link to multiple appropriate consignments; do not enforce a one to one truck mapping. Freight invoices may cover multiple eligible LRs through an explicit invoice line allocation table.

Every tenant owned foreign key shall prevent cross tenant references. External customer organizations may participate in multiple tenants through explicit memberships or grants, without merging confidential transporter ledgers. An approver's organization membership and consignment access must both be checked.

Money shall use fixed precision decimal and a currency code; quantities shall use decimal plus unit, not binary floating point. Preserve original units and conversion rules. Keep internal UUID identifiers separate from human LR and invoice numbers. Store timestamps in UTC and display the relevant site time zone, defaulting to Asia Kolkata for the initial market.

Accepted payloads shall use a deterministic canonical representation before hashing. A hash is integrity evidence, not a substitute for access control, signer identity or an independent timestamp. Audit tables and storage policies shall prevent normal administrators from rewriting history, with exceptional maintenance separately controlled.

### 10.3 Asset identity telemetry and accounting boundaries

SSCC identifies a logistics unit associated with goods movement. A reusable pallet, rack or bin also needs a persistent asset identity, for which a serial GRAI can be appropriate when GS1 identifiers are adopted. Link the returnable asset to the changing logistic unit or shipment; do not reuse one identifier as though asset ownership and shipment contents were identical. GS1 describes GRAI as suitable for reusable transport equipment and asset movements. [S27, S39]

High volume telemetry shall use partitioned storage and retention independent of the POD financial transaction tables. Raw positions and sensor observations can expire or downsample under policy, while selected incident evidence and derived business milestones follow their own retention class. Device assignment intervals determine which vehicle or person was associated with an event.

Inventory postings, stock reservations, automated missions and freight payment instructions shall each have an authoritative owner and idempotent reconciliation. Evidence of a gate or dock event does not by itself become a financial, warehouse or official government posting.

## 11 API and event contracts

### 11.1 Proposed application endpoints

These are proposed SaaS endpoints, not ULIP or NIC endpoint specifications. Publish the final schema through OpenAPI, including request validation, response shapes, permissions, idempotency and versioning.

| Endpoint | Purpose | Main control |
| --- | --- | --- |
| POST /v1/consignments | Create LR or consignment | Tenant scope and external reference deduplication |
| POST /v1/imports | Validate and execute import | Dry run, mapping version and row errors |
| POST /v1/trips | Plan trip and stops | Scoped parties and allocation validation |
| POST /v1/delivery-attempts/{id}/events | Capture milestones | Assigned actor and stable client event ID |
| POST /v1/evidence/uploads | Request private upload | Type, size, object scope and scan state |
| POST /v1/pods/{id}/drafts | Save receipt draft | Optimistic version checking |
| POST /v1/pods/{id}/challenges | Issue confirmation challenge | Current receiver grant and payload hash |
| POST /v1/pods/{id}/accept | Verify and seal acceptance | Atomic transaction and idempotency key |
| POST /v1/pods/{id}/corrections | Request linked correction | Reason, policy and reacceptance |
| GET /v1/billing/readiness | Query ready or blocked records | Finance role and customer scope |
| POST /v1/invoices/{id}/submissions | Record or initiate submission | Evidence version and external reference |
| POST /v1/receipts | Allocate payments | Decimal reconciliation and finance role |
| POST /v1/disputes | Open deduction case | Linked invoice and evidence scope |
| POST /v1/integrations/{provider}/webhooks | Receive provider events | Signature, replay checks and deduplication |
| GET /v1/evidence-packets/{id} | Authorized evidence download | Tenant, relationship and short lived access |
| POST /v1/device-events | Ingest an approved adapter observation | Device identity, assignment period, schema and deduplication |
| POST /v1/alerts/{id}/reviews | Acknowledge or review an alert | Safety or control room role and immutable original |
| POST /v1/warehouse/movements | Submit scoped stock movement | WMS authority, reservation and idempotency |
| POST /v1/assets/{id}/handovers | Record returnable custody | Site, partner and asset authority |
| POST /v1/emissions/runs | Calculate and review report | Method version, inputs and sustainability role |

Tenant context shall come from authenticated membership. Do not trust a posted tenant ID. Use pagination, bounded filters and export jobs for large datasets. Concurrent updates shall use an expected version or equivalent conditional request; return a conflict for stale drafts rather than overwriting silently.

### 11.2 Acceptance transaction and outbox

In a single database transaction, verify the grant and challenge, compare the payload hash and version, persist the accepted POD version, consume the challenge, append the audit record and insert a uniquely identified outbox event. If any step fails, none shall commit. Use row locking or conditional version updates for the POD and authority grant, atomic challenge consumption, and database uniqueness constraints to prevent concurrent duplicate acceptance. Authority revocation and finalization shall follow the same locking or version protocol. Return a stable acceptance identifier on safe retries.

Workers shall process the outbox to generate evidence packets, notify users and evaluate billing readiness. A worker crash after an external call shall not justify repeating a non idempotent invoice creation blindly. Store provider references, reconcile uncertain outcomes and support a dead letter queue with operator review. Idempotent jobs are an explicit design practice in BullMQ documentation. [S22]

### 11.3 Event envelope

An event shall contain event_id, event_type, schema_version, tenant_id, aggregate_id, aggregate_version, occurred_at, received_at, actor_reference, correlation_id and a minimal payload. Example event types are pod.accepted, pod.corrected, billing.ready, invoice.submitted, invoice.accepted, payment.allocated, telemetry.observed, safety.reviewed, inventory.posted, asset.handed_over, emissions.reviewed and integration.failed.

Webhooks shall be signed, include timestamp and replay protection, and be retried with bounded backoff. The receiver shall acknowledge only after durable ingestion. Consumers shall tolerate duplicate delivery and out of order events, using aggregate version and business transition guards. No claim of exactly once network delivery shall be made.

## 12 Technology options and architecture

### 12.1 Stack comparison

| Option | Stack | Best fit | Tradeoff |
| --- | --- | --- | --- |
| A Recommended | Next.js, React Native Android, TypeScript, NestJS, PostgreSQL, queue and private object storage | Product team sharing TypeScript across web, API and mobile | Requires explicit workflow, security and tenant design |
| B Python | React or Next.js, Django and DRF, PostgreSQL, task workers, object storage | Team strongest in Python with document processing needs | Web and backend use different main languages |
| C Microsoft | React, ASP.NET Core, PostgreSQL or approved SQL platform, managed queue and object storage | Enterprise customer and team already aligned with .NET or Azure | Enterprise alignment adds value only if it matches delivery skills |

These are engineering options, not ULIP requirements. Official documentation supports NestJS queues, Next.js PWA implementation, Django application structure and ASP.NET Core APIs. Select supported stable releases and security patches at implementation kickoff rather than freezing versions in this SRS. [S20, S21, S23, S24]

### 12.2 Recommended deployment

Use the Next.js portals and Android driver application calling a dedicated API. Deploy API and workers separately from the same modular backend codebase. Modules are identity and tenancy, parties and sites, shipments and trips, delivery and evidence, approval policies, billing, settlements, integrations, notifications and audit.

PostgreSQL is the authority for workflow and financial relationships. Store large photos and PDFs in private object storage, with metadata and hashes in the database. Use a durable managed queue or Redis backed BullMQ for asynchronous work. Redis cache or PubSub alone shall not hold the only copy of a billing event. Operate separate development, staging and production environments.

Use containers on managed application hosting with controlled outbound networking and static egress where a provider requires allowlisting. Keep services near the chosen database region. Use a secrets manager, encryption keys, centralized logs, tracing, metrics and budget alerts. Kubernetes, Kafka and independently deployed microservices are not required for the initial planning envelope.

### 12.3 PostgreSQL and Neon choice

PostgreSQL row level security can provide defense in depth alongside application authorization. Production runtime roles must not be superusers, table owners or carry BYPASSRLS, because these can bypass normal policies. Test with the actual runtime role. [S18]

With transaction pooling, set trusted tenant context transaction locally and perform every dependent query within that same transaction. Do not use a session SET and assume the pooled connection remains attached to one tenant. Test the ORM connection behavior and background worker paths. [S19, S35]

Neon is attractive for managed PostgreSQL and isolated development branches, but its reviewed region list has no India location and a project's region is fixed. Choose Neon only if customer and upstream terms allow that location and latency and recovery tests pass. If India residency is required, select an approved India region managed PostgreSQL configuration, such as RDS PostgreSQL, after checking service availability and terms. Do not infer universal India localization from DPDP alone. [S17, S36]

### 12.4 Android driver app and receiver browser

Viskan explicitly requests offline use and QR or barcode scanning. Recommend React Native Android in M for driver evidence capture and encrypted local drafts, with a supported device matrix, camera access, upload recovery and app distribution process. Keep receiver sign-off browser based to reduce customer installation friction. A customer tracking app or iOS driver client is a separate scope decision.

A PWA can remain a lightweight fallback for online tasks, but browser background sync and storage guarantees vary. Continuous fleet tracking should use approved installed telematics or an explicitly consented native location module in P2. Native location still depends on permissions and operating system behavior and can stop after termination; all clients must expose stale signal and gaps. [S20, S26, S30]

### 12.5 Evidence storage

Use private encrypted storage with object versioning, malware quarantine, content hashes and expiring authorized links. Consider WORM or object lock only after agreeing retention classes and legal holds. AWS describes governance and compliance retention modes; compliance mode has strong deletion restrictions that must be reconciled with privacy and exit policies before activation. Storage immutability does not establish signer authority or legal enforceability. [S25]

### 12.6 Telemetry and device integration

For P2, buy compatible GPS, camera, breath analyser and sensor devices from qualified vendors. Prefer existing vendor APIs for an initial fleet subset, or a managed MQTT service where devices support secure direct integration. AWS IoT guidance recommends scoped device identities, restricted topics and secure connections; equivalent controls are required with another gateway. Keep device identity separate from a driver login. [S38]

Deploy ingestion and alert evaluation separately from receipt and billing transactions so reconnect bursts do not block customer sign-off. A broker or queue feeds normalization, assignment validation, telemetry storage and rule evaluation. Publish selected business events to the core platform; do not synchronously write every sensor sample into the invoice path. Start with partitioned PostgreSQL or a suitable managed telemetry store and choose further streaming infrastructure from measured volume.

At 200 vehicles reporting once per minute continuously, the assumed volume is 288000 positions per day. At 1000 vehicles every 30 seconds, it is 2.88 million per day or about 86.4 million per 30 day month. These are sizing calculations, not Viskan fleet counts. Sensor channels, trip-only reporting and reconnect bursts change the load and retention cost.

Event clips should normally remain on vendor or edge storage until an authorised incident request or event upload. At an assumed 2 megabit per second bitrate, a 20 second clip is about 5 MB; 2000 such clips daily produce approximately 10 GB daily before copies. Continuous cloud video is a different cost and security model and requires separate approval.

### 12.7 Safety engineering and hardware procurement

AIS 140 applicability shall be assessed against the vehicle category, permit, cargo, manufacturing date and current relevant notifications. The reviewed MoRTH release concerns specified N2 and N3 vehicles carrying dangerous or hazardous goods; it does not certify every truck or every camera and breath device in this project. Obtain model specific test or approval evidence and any required state backend registration before procurement. [S37]

Camera detection, breath testing and vehicle interlock are separate assurance problems. Confirm calibration, operating conditions, vendor false positive handling, installation warranty, tamper behavior, local fallback, servicing and event ownership. An AIS 140 tracking approval does not automatically approve a driver monitoring algorithm or ignition modification. Vehicle actuation and warehouse machine safety must remain with qualified specialist systems.

### 12.8 Enterprise connectors optimisation and carbon

The preferred core remains TypeScript and PostgreSQL, with an India hosted managed database where contractually required. SAP integration requires the actual SAP product and version, modules, interface owner, supported API or middleware and customer approved mappings. Do not assume a general SAP connector can post GRN, POD, tax invoice and payment through one endpoint.

WMS and robotics should integrate through documented vendor interfaces. A later Python worker can run optimisation or approved analytical models without rewriting the core backend. OR-Tools supports capacity and time window models, but feasible and good solutions must not be advertised as guaranteed global optima. Routing also needs licensed travel data and the operational constraints agreed with Viskan. [S41]

For carbon reporting, agree the named OEM method and validation owner. Smart Freight Centre describes fuel and activity based logistics calculation under GLEC and ISO 14083 related methods. Implement a versioned calculation and evidence layer using the agreed framework and licensed factors; dashboard output alone does not establish independent approval or compliance with every OEM requirement. [S40]

## 13 Nonfunctional requirements

All values in this section are proposed engineering acceptance targets. NFR01 to NFR16 apply to M except where a later module is explicitly referenced. NFR17 to NFR22 apply to the stated expansion phases. Final sizing depends on actual shipment, device, attachment, receiver and scan volumes.

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR01 Capacity | Plan for 10 tenants, 100,000 shipments per month and 500 concurrent interactive users | Load test using agreed tenant and customer distribution |
| NFR02 Throughput | Sustain 30 API requests per second and a five minute burst of 100 per second | Mixed reads, writes, approvals and imports; report error rate |
| NFR03 API latency | P95 metadata reads under 500 ms and writes under 800 ms at target load | Server side measurement; separate media and external latency |
| NFR04 Workflow latency | P95 billing ready event within 60 seconds after the last mandatory condition succeeds | Timestamp comparison across transaction, outbox and evaluation |
| NFR05 Availability | Proposed core service target 99.9 percent per calendar month | Define health checks, maintenance and provider outage treatment in SLA |
| NFR06 Recovery | Database RPO at most 15 minutes and core RTO at most four hours | Restore database and evidence together in quarterly drills |
| NFR07 Offline | Android encrypted drafts persist at least 24 hours with capacity for 100 metadata drafts and 300 MB media on supported devices | Restart, low storage and reconnect tests; warn at 80 percent and block unsafe capture rather than silently dropping drafts |
| NFR08 Authorization | No cross tenant or cross customer access through any exposed path | Automated API, export, object link, cache and worker isolation tests |
| NFR09 Integrity | Accepted original remains retrievable; corrections create new versions | Hash verification and attempted overwrite tests |
| NFR10 Retry safety | Duplicate events cannot duplicate acceptance or external invoices | Crash, timeout, replay and out of order event tests |
| NFR11 Accessibility | Target WCAG 2.2 AA for critical web flows | Keyboard, screen reader, contrast and mobile touch review |
| NFR12 Compatibility | Android app OS versions and manufacturer models agreed from the fleet inventory; receiver web tested on agreed Chrome, Edge and Safari versions | Approved device and browser matrix tested before pilot |
| NFR13 Observability | Correlation trace from acceptance through packet and billing event | Operational drill from a selected LR and event |
| NFR14 Security | Zero unresolved critical or high findings in agreed preproduction assessment | Independent review, dependency scan and tracked remediation |
| NFR15 Time and logs | Synchronized clocks and India retained ICT logs for applicable minimum periods | Configuration and retrieval drill; incident exercise |
| NFR16 Portability | Export a tenant's agreed records and evidence with referential manifest | Reconcile counts, balances and checksums in a test export |
| NFR17 P2 telemetry | Validate 200 simulated vehicles at 60 second intervals, with a five minute 100 event per second reconnect burst | No acceptance path degradation or unexplained loss; duplicates and rejects separately counted |
| NFR18 P2 event latency | P95 normalized observation visible within five seconds after successful server ingestion | Measure source delay separately; late samples remain labeled late |
| NFR19 P2 alerts | P95 eligible online alert recorded and notification submitted within 30 seconds of ingest | Excludes provider delivery and human response; record both separately |
| NFR20 P2 device security | Device or adapter cannot publish another tenant's observations; revoked identity cannot add accepted events | Replay, reassignment, credential revocation and topic permission tests |
| NFR21 P3 stock integrity | Concurrent scans, reservations and retries cannot double post the same movement or cross customer stock | Stock reconciliation and controlled concurrency tests |
| NFR22 P2 reporting lineage | Every released driver score or emission report can be reproduced from retained inputs and policy or factor version | Golden dataset, corrections, no-data and permission tests |

Availability boundaries shall be explicit: measuring only the API process is insufficient if users cannot access the database or evidence. RPO and RTO are targets to be achieved through configuration and drills, not assumptions about a provider plan. A backup of the database without matching evidence objects is insufficient.

At 100,000 deliveries per month, three 1 MB photos plus a 0.5 MB PDF per delivery create about 350 GB of new evidence monthly. Thirty six months would produce about 12.6 TB before extra versions, replicas and backups. These illustrative sizes show why attachment limits, compression, lifecycle policy and egress charges require early design.

## 14 Security identity privacy and legal controls

### 14.1 Authentication and authority

An application SMS OTP shows control of a registered contact at that moment. It is not automatically Aadhaar authentication or CCA eSign. CCA eSign is a regulated signing service involving identity checks, consent, certificates and an audit process. An Aadhaar identity match also does not establish authority to accept goods for a company. [S08]

Direct Aadhaar access is not a generic open API. UIDAI describes requesting entity appointment, eligibility, agreements and infrastructure checks; approved routes and consent requirements must be assessed. The MVP should avoid collecting Aadhaar numbers and use customer enrolled named staff plus scoped authorization. A later identity verification or eSign module requires a separate legal and provider design. [S09]

Require MFA for SaaS, tenant and customer administrators and step-up authentication for receiver grant and contact changes. Suspected compromise, contact replacement or access revocation shall invalidate affected sessions and pending challenges. Protect login and OTP endpoints against abuse, rotate service credentials and prohibit raw credentials or OTPs in logs. Expiring signed object links must be issued only after authorization and must not become public evidence directories. Scan attachments, sanitize filenames and protect exports. Supported device testing must establish offline persistence; browser storage eviction shall never be represented as guaranteed durable storage.

### 14.2 Electronic evidence and contracts

Retain original documents, accepted payloads, authorization history, authentication results, object versions, hashes, timestamps and audit trails. Provide an evidence export usable by legal counsel preparing any required electronic record certificate. The software must not promise automatic admissibility or that a photograph conclusively proves identity or receipt.

Before pilot, the customer contract or approved SOP must address electronic receipt acceptance, named staff and delegation, receipt versus inspection, quantity reservations, original paper fallback, billing triggers, GRN, claims timing, evidence retention, access, dispute handling and applicable law. The customer finance team must participate, not only transport operations.

### 14.3 DPDP implementation timing

The 2025 commencement notification and final rules phase provisions in across publication, one year and eighteen months. As of 24 October 2026, most substantive duties in the main package are still forthcoming. Plan for the November 2026 and May 2027 milestones, with counsel confirming the precise Gazette publication based date and provisions relevant to the operator. Do not state that every DPDP duty is already in force. [S10, S11]

Design now for clear purpose notices, necessary data collection, recorded processing roles, processor agreements, user requests, lawful retention and breach response. Location access must be limited to the work purpose and needed period. Data subjects include drivers and receiver employees even when the customer is a business. Customer master data should not be reused to market unrelated services without an appropriate basis.

Maintain a retention matrix separating shipment evidence, financial records, security logs, integration raw data, local device drafts and backups. Define owner, purpose, minimum and maximum retention, deletion procedure and legal holds for each. Government source terms may restrict caching or redistribution more tightly than the SaaS default. Privacy deletion must account for lawful retention, and a legal hold must not become indefinite blanket storage.

### 14.4 Incident response and existing obligations

CERT-In directions cover listed entities and require reporting specified incidents within six hours of noticing or being informed, rolling 180 day ICT logs within India, and time synchronization. Applicability and reporting responsibility must be mapped before launch. These existing duties are independent of the later DPDP rollout. [S12]

Assign an incident lead and contact, preserve evidence, maintain a customer and regulator notification matrix, rehearse compromise and data exposure scenarios, and align supplier contracts with the shortest applicable deadline. Forthcoming DPDP security and breach processes must be added by their commencement dates rather than treating one reporting procedure as sufficient for every obligation. [S11]

### 14.5 Driver and warehouse monitoring

Vehicle location, cabin video, breath results and driver performance can identify employees or contractors. Establish a specific work purpose, notice, necessary access and retention for each. Capture event metadata and selected clips where sufficient; audio recording, face recognition, continuous live viewing and unrelated employee surveillance are outside this baseline. A customer freight viewer does not automatically receive cabin video access.

Reviewed event history shall be correctable without erasing the original detection. Scorecards must disclose data coverage and allow review before incentives or other consequential action. Breath readings and camera alerts require trained operational interpretation; device faults and missing signals must not be turned into fabricated negative results. Document vendor and cloud processing terms and incident responsibilities.

## 15 Integration specifications and release gates

| Integration | MVP behavior | Gate before automation |
| --- | --- | --- |
| ULIP | No assumed dependency; application supports manual provenance | Approved use case, datasets, customer rights, agreement, security and sandbox results |
| E-way bill read | Capture references and validity; verify through authorized route when available | Source contract, requester role, schema and status mapping |
| E-way bill write | Compliance task and recorded official result | Explicit transaction access, transporter authorization and current NIC validation tests |
| SMS OTP | Registered transaction messages and delivery outcomes | Provider contract, applicable Indian messaging registration and template approvals |
| Email or WhatsApp | Approved transactional templates where enabled | Consent and permitted channel use, templates, delivery callbacks and retry rules |
| ERP or accounting | Export packet and record references | System of record, payer mapping, tax ownership, idempotency and reconciliation |
| Customer GRN | Manual entry or evidence upload | Contract meaning, authoritative source, two way mapping and error handling |
| GPS or telematics | Deferred or optional provider adapter | Vehicle permission, coverage, sampling, freshness and location processing notice |
| eSign | Deferred unless required for pilot | Licensed provider route, signing meaning, costs, consent and validation |
| Pallet or box scans | P3 | Agreed identifiers, scanners, custody events and partner adoption |
| SAP or client ERP | P2 agreed interface | Actual version, module, middleware, identifier mappings, write permissions and reconciled test dataset |
| GPS cameras and sensors | P2 vendor pilot | Fleet eligibility, device model, approvals, calibration, secure provisioning and vendor support |
| Existing WMS | P3 foundation | Per site authority, stock owner, event mapping, opening balances and cutover reconciliation |
| Dock RFID | P3 pilot | Physical read zone, tag compatibility, duplicate and missed read tests |
| AMR AGV drone or WCS | P4 separately procured | Qualified vendor safety system, mission contract, site assessment and manual fallback |
| Emissions factors and OEM export | P2 baseline | Approved methodology, factor provenance or licence, allocation and review owner |

Each adapter needs a data contract specifying fields, sensitivity, source, owner, purpose, region, retention, rate limits, cost, timeouts, authentication, error handling and support. Secrets are server side. Provider availability must be visible separately from the core application health. Access revocation must disable future calls and trigger any required deletion or retention handling.

## 16 Screens and user experience

The transporter desktop portal needs an action dashboard, consignment list and details, LR creation or import, trip and stop plan, receiver readiness, POD review, billing blockers, invoice submissions, collection ledger, dispute cases, reports and settings. Every status should show the evidence or condition behind it and the next responsible person.

The driver mobile interface needs assigned work, navigation reference, gate and unloading milestones, photo capture, quantity or issue drafts, a pending sync queue and help. Keep primary actions large, language simple and network status persistent. English is the initial default; decide Hindi and regional language priority with actual drivers before final design. The supported Android application shall clearly separate locally saved drafts, server received evidence and final customer acceptance.

The receiver browser flow needs secure access, site and LR verification, readable item receipt, exception capture, attachments and explicit final confirmation. It should explain the meaning of acknowledgement and never force a clean delivery statement where a shortage exists. The customer administrator needs receiver enrollment, grant and alternate management, revocation and audit history.

Finance needs a ready and blocked queue, packet preview, issue and submission references, customer response, payment trigger, due date, allocations and deduction workflow. The platform administrator needs tenant operations, integration health, usage and time limited support access, with customer shipment browsing protected.

P2 adds a control room map and alert queue, device health and calibration, reviewed safety cases, limited clip access, driver score explanation, fuel or toll reconciliation and customer tracking pages. P3 adds expected receipts, scan tasks, stock and reservation views, counts, adjustments and the returnable asset ledger. P4 adds planner scenarios and vendor mission monitoring. Each screen is enabled through contracted modules and scoped roles.

## 17 Reporting and metric definitions

| Report | Required measures and safeguards |
| --- | --- |
| Delivery operations | Scheduled, in transit, arrived, partial, refused and completed by lane, site and partner |
| POD aging | Awaiting receiver by elapsed time, customer, site, grant readiness and escalation owner |
| Billing blockers | Count and freight value by missing POD, GRN, document, unresolved issue and payer mapping |
| Invoice pipeline | Issued, submitted, acknowledged, accepted, rejected and pending by payer |
| Collections | Due, overdue, cash received, withholding, retention, adjustments and disputed balance |
| Deductions | Reason, value, evidence, recovery, waiver and age; tax credit kept separate |
| Integration operations | Calls, success, rate limiting, response age, outage and usage cost where available |
| Adoption | Driver draft completion, receiver completion, manual fallback and offline sync outcomes |
| Fleet and safety | Signal coverage, idle and dwell, reviewed events, false positives and acknowledgement or response times |
| Driver scorecard | Policy version, exposure, reviewed events, no-data flags and approved incentives |
| Warehouse and assets | Stock variance, pick errors, dock reconciliation, returnable dwell, overdue returns and approved losses |
| Sustainability | Total kg CO2e, approved intensity denominator, input quality, factor version, boundary and reviewed customer export |

Operational times shall use actual milestone data. If unloading time is missing, report missing rather than replacing it silently with upload time. Cash performance shall be amount weighted where appropriate, with the date basis and population shown. Distinguish operational delivery to cash days from accounting DSO calculated using a period receivables and revenue methodology. Historical policy changes shall not rewrite previously reported billing trigger dates without an explicit restatement.

## 18 User acceptance tests and traceability

Every M requirement must be covered by automated or documented acceptance evidence. The scenarios below identify critical release tests; they supplement rather than replace complete feature testing.

| Test | Scenario and expected result | Requirements |
| --- | --- | --- |
| U01 | Tenant A requests tenant B LR, export and object link; all are denied | FR001 FR052 NFR08 |
| U02 | Repeat the same import; row counts and LR identifiers remain unchanged | FR006 FR007 |
| U03 | One truck carries three LRs and two stops; each receipt affects only allocated quantities | FR009 FR029 |
| U04 | Driver or transporter attempts customer sign-off; request fails and is audited | FR004 FR013 FR019 |
| U05 | Forwarded receiver link opens on an unauthorized account; final acceptance is denied | FR014 FR015 |
| U06 | Quantity changes after OTP issue; the previous challenge fails | FR015 FR017 |
| U07 | Five incorrect OTP attempts or expired OTP; no accepted POD is created | FR016 |
| U08 | Receiver grant is revoked before final submission; acceptance fails | FR013 FR018 |
| U09 | A line contains short and damaged quantities; reconciliation passes without double counting | FR021 FR022 FR023 |
| U10 | Driver stores photos offline, restarts and retries twice; one draft set syncs with clear state | FR031 FR032 FR034 |
| U11 | An offline draft exists; billing policy requiring customer acceptance remains blocked | FR033 FR036 |
| U12 | Worker crashes after POD acceptance; retry generates one effective packet and no duplicate invoice | FR026 FR027 FR041 NFR10 |
| U13 | A correction is accepted; original evidence remains retrievable and prior submission stays linked | FR028 |
| U14 | Customer requires GRN; final POD alone remains blocked until authoritative GRN recorded | FR005 FR036 |
| U15 | Invoice packet is generated but not sent; status remains distinct from submitted | FR038 FR039 |
| U16 | INR 100000 invoice receives INR 95000; remaining INR 5000 is classified and reconciled | FR043 FR044 FR045 |
| U17 | E-way bill extension task is marked done locally; official validity is unchanged until confirmed | FR054 FR055 FR057 |
| U18 | ULIP or GPS is down; app shows degraded verification and permitted delivery workflow continues | FR058 FR059 |
| U19 | Malicious file upload; attachment quarantined and unavailable to receiver | FR024 |
| U20 | Restore to a chosen recovery point; accepted PODs, evidence and financial balances reconcile | FR066 NFR06 |
| U21 | Duplicate or older integration webhook arrives; no status regression or duplicate accounting record | FR041 FR058 NFR10 |
| U22 | Tenant exits with a legal hold; authorized export works and retained objects follow policy | FR067 |
| U23 | Concurrent OTP replay and authority revocation race; only a permitted serialized outcome commits, with no duplicate final acceptance | FR013 FR015 FR026 |
| U24 | Partial delivery followed by reattempt; cumulative receipt cannot exceed the valid consignment allocation | FR009 FR022 FR029 |
| U25 M | Scan an LR offline, capture evidence, restart and reconnect; correct scoped draft is recovered with no duplicate receipt | FR035 FR069 |
| U26 P2 | Device reassigned to a new truck; old observations retain original association and replay cannot change current position | FR070 FR071 FR072 |
| U27 P2 | Loss of GPS or delayed provider callback; dashboard shows stale or unknown rather than stopped or delivered | FR073 FR077 |
| U28 P2 | Geofence jitter and repeated duplicate event; one governed alert case forms and escalation follows staffed policy | FR074 FR075 |
| U29 P2 | DMS false positive is reviewed and corrected; score lineage changes without erasing original event | FR080 FR083 |
| U30 P2 | Breath device is out of calibration; no valid pass is recorded, dispatch review applies and no in-motion disable is issued | FR081 FR082 |
| U31 P2 | Customer tracking token is revoked; protected location, driver and camera data are no longer available | FR076 FR079 FR103 |
| U32 P3 | Competing pick reservations and retry occur; stock is reserved and posted once with no cross owner leakage | FR087 FR089 |
| U33 P3 | RFID portal reads duplicate and stray tags; unexpected units require reconciliation before accepted stock posting | FR088 FR091 |
| U34 P3 | Reusable rack carries a new shipment; persistent asset identity and prior custody remain intact | FR092 |
| U35 P4 | Vendor mission request times out; reconciliation prevents duplicate movement and safety control remains local | FR094 FR095 |
| U36 P2 | Emission input or factor is missing or updated; report shows estimated or missing quality and reproducible versions | FR101 |
| U37 P4 | Copilot requests another customer's video or attempts a stock or vehicle action; permissions and approval gates prevent it | FR102 |
| U38 P2 | Freight audit finds surcharge mismatch; payment remains a reviewed ERP instruction, not an automatic bank debit | FR098 |

Business validation also requires the payer finance team to accept the generated packet for real invoices, demonstrate the agreed payment trigger, and document any continued paper requirement. Passing a screen demonstration without that acceptance is insufficient to validate the central business case.

## 19 Delivery plan effort and cost assumptions

### 19.1 Phased delivery

| Stage | Indicative duration | Exit evidence |
| --- | --- | --- |
| Discovery and contract alignment | 2 weeks | Exact demo review, SOP, sample documents, authority map, payer acceptance and agreed backlog |
| Workflow prototype | 2 to 3 weeks, overlapping detailed design | Driver and receiver flow tested with representative users |
| Controlled ePOD pilot build | 10 to 14 weeks after discovery | M scope including Android capture implemented, critical tests passed and participating sites trained |
| Operational pilot | 4 to 6 weeks | Baseline comparison, accepted invoice packets, support issues and adoption results |
| Production expansion | 4 to 6 additional engineering weeks, scope dependent | Hardening, agreed integrations, recovery drill and independent security findings resolved |
| P2 connected control tower | Separate estimate after provider and ERP assessment | Telemetry, safety review, emissions and named integrations accepted independently |
| P3 WMS and returnable assets | Separate site discovery and estimate | Source of truth, identifiers, scanner and custody process proven |
| P4 advanced automation | Separate vendor business cases | Mission interface, site safety and management investment approval |

Stages overlap where safe; these durations are not a fixed delivery commitment. A 60 to 100 day collection cycle requires longer follow up than the operational pilot to measure cash results. Government access and customer ERP approvals can extend the calendar independently of coding.

### 19.2 Team and budget model

A practical pilot team is two experienced full stack or backend and frontend engineers, QA with substantial involvement, and part time product analysis, design and DevOps. Customer operations and finance must provide named decision makers and weekly review time.

For the revised M scope including the Android driver application, an illustrative effort allowance is 10 to 14 person months. At an assumed blended fully loaded rate of INR 1.25 to 2 lakh per person month, the engineering allowance is INR 12.5 to 28 lakh. Adding 15 to 20 percent contingency gives approximately INR 14.4 to 33.6 lakh. This is an internal planning calculation, not a vendor quote or market price, and excludes taxes, legal work, third party fees, devices and major ERP customization. Discovery must validate whether the selected M scope fits that effort.

This allowance covers only M. It excludes vehicle hardware and installation, sensor or camera licences, robotics, RFID infrastructure, warehouse civil work, full SAP or WMS implementation, advanced optimisation and continuous video. Budget production hardening and subsequent integrations separately using a work breakdown and customer approved interfaces. A basic demonstration can cost less, but it will not satisfy the full isolation, recovery, authority, evidence and accounting requirements in this SRS.

Estimate operating cost from managed database and redundancy, API and worker compute, object storage and versions, evidence egress, backups, logs, messaging attempts, maps or tracking calls, eSign and ULIP charges. Do not use a free database plan as the commercial production cost baseline. At scale, retained images and outbound packets can dominate storage and transfer costs.

### 19.3 Warehouse investment and vendor gates

Respect the roadmap's warehouse priority order: first WMS and handheld scanning, then dock identification, followed by business case driven robotics, counting technology, bin sensors and layout simulation. A low complexity slotting analysis can be evaluated in parallel if data already exists; its roadmap rank does not require buying expensive equipment first. [C01 pages 1 and 2]

For each investment record hardware, installation, licences, software integration, training, servicing, connectivity, downtime and replacement costs. Deduct recurring operating cost from verified monthly benefit before calculating simple payback as initial investment divided by net monthly benefit. Apply Viskan's approximate 24 month threshold as a management decision, with a documented safety or service exception where justified. Do not combine speculative accident, fuel or labour savings into guaranteed ROI.

Device procurement shall include interface ownership, payload samples, source timestamp and buffering behavior, calibration or certification, support geography, spares, SIM or data costs, firmware support, data export and exit rights. No hardware purchase shall be implied by approval of the SaaS architecture alone.

### 19.4 Pilot launch gates

Use one transporter, two or three consenting customer sites and repeat lanes with approximately 200 to 500 eligible deliveries as an initial planning cohort. Include clean, partial, damaged, refused, offline and alternate receiver cases. Start measurement before launch. Finance acceptance of electronic evidence, authority enrollment, a workable paper fallback, privacy and retention decisions, and passed critical UATs are prerequisites for live use.

## 20 Decisions risks and next customer workshop

### 20.1 Decision register

| Decision | Recommended starting point | Owner before rollout |
| --- | --- | --- |
| Exact reference product | Obtain Appu video URL and SOP; identify application separately from ULIP | Product owner and Appu |
| Payer and receipt authority | Document consignee, freight payer, site administrator and finance approver | Customer operations and finance |
| Electronic contract acceptance | Signed approval of evidence, reservations, billing trigger and fallback | Customer commercial and legal |
| Hosting | Approved India region if required; otherwise compare latency and contractual constraints | Customer security and SaaS owner |
| Stack | Option A unless team skills or customer environment favor B or C | Technical lead |
| Field client | Receiver browser and supported native Android driver app; separate customer app only if justified | Operations and technical lead |
| Government integrations | Read only approved scope first; write operations separately approved | Integration and compliance owner |
| Accounting | External system remains authority for statutory invoice and tax treatment | Customer finance and CA |
| Retention | Separate POD, cabin video, breath data, location, stock, security and provider policies | Legal, security and finance |
| Safety devices | Buy qualified models; review dispatch SOP and independent interlock design | Fleet safety lead and hardware vendor |
| WMS authority | Integrate existing system or approve a foundation build per site | Warehouse and ERP owners |
| Driver incentives | Versioned policy, reviewed events, exposure and corrections | Fleet management and HR |
| OEM carbon reports | Agree method, data boundary, factors and export format | Customer sustainability owner |

### 20.2 Principal risks

| Risk | Consequence | Mitigation and release evidence |
| --- | --- | --- |
| Receiver finance rejects electronic POD | No improvement in billing or cash | Contract acceptance and real packet acceptance before expanding |
| Generic features already available | Weak reason to buy custom product | Matched scope incumbent demos and quantified customer need |
| Shared phone or false authority | Disputed receipt | Named grants, scoped challenge, revocation and audited exceptions |
| ULIP access or downstream rights unavailable | Missing enrichment or delayed launch | Independent MVP, written permission and tested adapters |
| Offline data loss or false final status | Missing evidence and billing error | Persisted drafts, clear sync state and restart tests |
| Incorrect document mapping | Wrong customer or quantity approval | Explicit many to many mapping and reconciliation |
| Duplicate accounting calls | Double invoicing | Outbox, idempotency and timeout reconciliation |
| 5 percent wrongly treated as leakage | Misstated value and ledger | Deduction classification and finance approval |
| Hosting or data term mismatch | Contract or compliance failure | Region and subprocessor review before provisioning |
| Overwide initial scope | Delayed ePOD launch | Separate phase contracts and controlled change requests |
| Unvalidated safety detection or control | Incorrect driver decisions or physical hazard | Human review, qualified vendor, local safety system and commissioning tests |
| Two WMS stock authorities | Duplicate or inconsistent balances | Per site system ownership and reconciled cutover |
| Poor RFID or sensor quality | False custody or inventory | Physical read pilot, calibration and exception review |
| Missing emissions data or wrong factors | Misleading OEM report | Provenance, data quality flags and sustainability approval |
| Hardware and video cost growth | Unviable SaaS margins | Separate bills of materials, licences, retention and measured traffic |

### 20.3 Questions and evidence for Appu and the transport manager

1. What is the exact video URL and application name, and which checkpoints in the SOP are mandatory?
2. Who receives the goods, who pays freight and who can approve quantity, quality, GRN and freight charges?
3. Which customer finance teams will accept this ePOD, and will they waive original stamped paper?
4. Which event starts the 60 day clock: delivery, POD receipt, GRN, invoice submission or acceptance?
5. What caused the last 20 delayed invoices, and how many days occurred at each step?
6. Provide redacted examples of an LR, goods invoice, e-way bill, clean POD, disputed POD, freight invoice and short payment advice.
7. What explains the actual 5 percent differences in ledgers, including tax withholding and contractual retention?
8. How many monthly LRs, trips, stops, sites, receiver users, invoices and photo attachments exist, including peak days?
9. Are operations mainly full truck load, part truck load, multi drop, transshipment or mixed?
10. How do drivers work today, which devices and languages are used, and how long are connectivity gaps?
11. Which accounting, GPS, customer portals and internal TMS systems are authoritative, and who controls access?
12. Who currently generates or extends e-way bills, under which credentials and transporter assignment?
13. What happens if the receiver refuses, is unavailable, changes shift, reports a shortage or signs before inspection?
14. What are the data region, retention, security, support and audit expectations?
15. What is the paid pilot budget, decision date and acceptable implementation scope?
16. Which GPS, camera, breath analyser and sensors are already installed, and who can provide model approvals, API access and sample messages?
17. Is any ignition interlock already professionally installed, and who owns the vehicle safety assessment and operating SOP?
18. Who staffs the control room, what response is expected by shift and severity, and how are driver disputes or incentives reviewed?
19. Which warehouses, WMS versions, SKU owners, handhelds and returnable racks or bins belong in the first site pilot?
20. Which OEM has requested carbon reporting, what method and period are required, and what fuel, distance, load and energy data exist?
21. What module boundaries, software IP rights, vendor licences, devices and 24 month payback assumptions should the commercial agreement use?

This research does not replace current integration certification or customer legal and CA review. The remaining decisions are concrete dependencies to resolve during discovery; they do not prevent prototyping the core receipt and billing workflow.

## 21 Source register

**C01 Viskan Technology Roadmap.** Customer supplied Word document received with this request, rendered and reviewed as three pages. Page 1 covers fleet safety and ePOD plus the beginning of warehouse priorities; page 2 continues warehouse priorities and common logistics technologies; page 3 covers returnables, optional cold chain, carbon, ULIP and analytics. The source is a strategic roadmap, not independent evidence of outcomes or a signed purchase scope.

**C02 Customer meeting notes.** Notes supplied in this conversation covering India truck operations, paper POD delays, designated receiver access, reported short payment, ULIP reference and the initial ePOD priority. Meeting date was not specified.

Research date is 24 October 2026. Government statements and vendor product descriptions are identified below. Public feature descriptions were not hands on product tests. Framework and cloud documentation informs technology choices; it does not guarantee this application's security, recovery or performance.

**S01 Government ULIP scale and operator July 2026.** PIB Ministry of Commerce and Industry release, 8 July 2026. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2282498&lang=1&reg=3

**S02 Published ULIP onboarding.** PIB release, 1 October 2022. Historical official sequence; obtain current terms. https://www.pib.gov.in/PressReleasePage.aspx?PRID=1864095

**S03 ULIP source system integration.** DPIIT Annual Report 2024 to 2025, section 4.4.3, printed page 44. https://www.dpiit.gov.in/static/uploads/2025/06/3d9c9c2daeefb97bb9ce964370938b71.pdf

**S04 E-way bill extension API.** NIC official validations and requester roles. https://docs.ewaybillgst.gov.in/apidocs/version1.03/extend-validity.html

**S05 E-way bill release notes.** NIC, including 30 July 2026 hold and 2025 validations. https://docs.ewaybillgst.gov.in/apidocs/release-notes.html

**S06 GTA consignment note and document role.** GST Council and CBEC explanatory flyer. Tax classification requires current customer review. https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Goods%20Transport%20Agency%20in%20GST_11%20September%202017.pdf

**S07 Invoice timing.** GST Council tax invoice explanatory material and CBIC Rule 47 repository. https://gstcouncil.gov.in/sites/default/files/e-version-gst-flyers/Tax_Invoice_and_other_new.pdf

**S08 eSign service.** Controller of Certifying Authorities. https://cca.gov.in/eSign.html

**S09 Aadhaar requesting entities.** UIDAI appointment and access framework. https://uidai.gov.in/en/authentication-requesting-agency

**S10 DPDP commencement.** MeitY notification GSR 843 E, November 2025. https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf

**S11 DPDP Rules 2025.** MeitY notification GSR 846 E, November 2025. https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

**S12 CERT-In directions.** Government of India, 28 April 2022. https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf

**S13 SuperProcure product tiers.** Vendor published proof of delivery scope. https://www.superprocure.com/pricing/proof-of-delivery/

**S14 Fleetx consignment management.** Vendor product description. https://www.fleetx.ai/consignment-management

**S15 Pando domestic transport management.** Vendor product description. https://pando.ai/product/multi-modal-transportation-management-system-tms-domestic

**S16 Shipsy last mile delivery.** Vendor product description. https://www.shipsy.ai/last-mile-delivery

**S17 Neon regions.** Current official supported region list and fixed project geography. https://neon.com/docs/introduction/regions

**S18 PostgreSQL row security.** Official behavior and bypass conditions. https://www.postgresql.org/docs/current/ddl-rowsecurity.html

**S19 Neon pooling.** Official transaction pooling behavior. https://neon.com/docs/connect/connection-pooling

**S20 Next.js PWA guide.** Official implementation documentation. https://nextjs.org/docs/app/guides/progressive-web-apps

**S21 NestJS queues.** Official queue integration documentation. https://docs.nestjs.com/techniques/queues

**S22 BullMQ idempotent jobs.** Official reliability guidance. https://docs.bullmq.io/patterns/idempotent-jobs

**S23 Django overview.** Official framework documentation. https://docs.djangoproject.com/en/6.1/intro/overview/

**S24 ASP.NET Core overview.** Microsoft documentation. https://learn.microsoft.com/en-us/aspnet/core/overview?view=aspnetcore-10.0

**S25 S3 Object Lock.** AWS retention and legal hold documentation. https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html

**S26 Background Sync API.** MDN browser implementation reference and limited availability. https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API

**S27 Logistic unit identification.** GS1 official support guidance. https://support.gs1.org/support/solutions/articles/43000734289-what-is-a-logistics-unit-and-how-is-it-identified-

**S28 GST e-invoice FAQ.** GSTN dated explanatory FAQ, including GTA exemption; validate current entity classification. https://www.gstn.org.in/assets/mainDashboard/Pdf/GST%20e-invoice%20System%20-%20FAQs.pdf

**S29 NIC API onboarding.** Separate official e-way bill access process. https://docs.ewaybillgst.gov.in/apidocs/on-boarding-process.html

**S30 Expo location.** Official mobile permission and background behavior guidance. https://docs.expo.dev/versions/latest/sdk/location/

**S31 Pando and Fleetx combination.** Vendor announcement August 2026. https://pando.ai/company/press-release/from-fleet-to-freight-pando-ai-and-fleetx-ai-join-forces-to-connect-the-transportation-lifecycle

**S32 ULIP tracking and verification.** PIB release 24 March 2023. https://www.pib.gov.in/PressReleasePage.aspx?PRID=1910298&lang=2&reg=3

**S33 Track Your Transport launch.** PIB release 25 September 2024. https://www.pib.gov.in/PressReleasePage.aspx?PRID=2058492

**S34 E-way bill validity and GTA documents.** CBIC CGST Rules compilation, Rules 138 and 54. Historical consolidated text read alongside current NIC notes. https://cbic-gst.gov.in/pdf/01062021-CGST-Rules-2017-Part-A-Rules.pdf

**S35 Transaction local configuration.** PostgreSQL SET documentation. https://www.postgresql.org/docs/current/sql-set.html

**S36 Managed PostgreSQL alternative.** AWS RDS PostgreSQL documentation. https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html


**S37 AIS 140 hazardous goods notification.** MoRTH release, 23 August 2022, summarising the specified N2 and N3 vehicle requirement. Exact current fleet applicability requires category and notification review. https://www.pib.gov.in/PressReleasePage.aspx?PRID=1853834

**S38 Secure IoT ingestion.** AWS IoT Core security guidance on device identity, connection and topic permissions. https://docs.aws.amazon.com/iot/latest/developerguide/security-best-practices.html

**S39 Returnable asset identifiers.** GS1 Denmark official GRAI guidance, updated January 2026. https://www.gs1.dk/en/vejledninger/global-returnable-asset-identifier-grai

**S40 Logistics emissions methods.** Smart Freight Centre official material describing fuel and transport activity calculation, factors and GLEC and ISO 14083 related reporting. This reference is not a certification of the proposed software. https://academy.smartfreightcentre.org/course/glec-iso-2026-2

**S41 Routing solver scope.** Google OR-Tools documentation on routing constraints and solver limitations. https://developers.google.com/optimization/routing

## 22 Consolidation and baseline control

Version 2.0 incorporates the Viskan roadmap into the earlier research and SRS. Core requirement IDs FR001 to FR068 are retained for continuity; FR069 to FR104 provide explicit new or expanded roadmap coverage. FR035 promotes the Android driver client into M. FR060 and FR061 move road control tower and route visibility into P2. Warehouse execution remains P3 and specialist automation is explicitly P4.

The final baseline contains 104 functional requirements, 22 nonfunctional targets and 38 critical acceptance scenarios. Phase labels control scope; they do not make every later module part of the first pilot. Changes to a requirement, phase, integration, device or customer policy shall identify the decision owner, effect on price and schedule, dependencies, acceptance evidence and version history.

Before authorising each phase, record sign-off from the product owner, Viskan operations, customer receiving and finance teams as applicable, technical and security leads, and the relevant warehouse, safety or sustainability owner. Open commercial, hardware and source access dependencies shall remain visible with owners and dates rather than being assumed complete.
