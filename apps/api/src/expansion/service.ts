import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import type { Context, DatabasePort, Entity, Transaction } from '@cargoorbit/database';
import {executeLaunch,launchActions,launchPhase,launchResources} from './launch.js';
import type {LaunchContext} from './launch-kit.js';
import {operationalObservation,visibility} from './telemetry-launch.js';
import {recoveryReportView} from './finance-launch.js';
import {redactWarehouse} from './warehouse-launch.js';
import { canonical, choice, date, decimal, fail, formatted, number, object, text, type Phase, type RecordEntity } from './types.js';

const P2 = ['owner', 'operations', 'control_room'];
const FINANCE = ['owner', 'finance'];
const WAREHOUSE = ['owner', 'warehouse'];
const NOW = () => new Date();
const sha = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const immutableKinds = new Set(['observations', 'inventory_movements', 'asset_handovers', 'safety_tests', 'scorecards', 'emissions_runs', 'dock_reads', 'handling_unit_events', 'eta_estimates', 'maintenance_events']);

/** Phase-gated business workflows. Provider transport and machine safety remain independent adapters. */
export class ExpansionService {
  private now: () => Date;
  constructor(private db: DatabasePort, options: { now?: () => Date } = {}) { this.now = options.now ?? NOW; }

  async execute(ctx: Context, action: string, raw: unknown): Promise<unknown> {
    const input = object(raw);
    if (ctx.role === 'warehouse' && !ctx.organizationId) fail(403, 'OWNER_MEMBERSHIP_REQUIRED', 'Warehouse membership must specify the stock owner organization');
    return this.db.transaction(ctx, async tx => {
      if (action === 'setFeatures') {
        return fail(403, 'ENTITLEMENT_ADMINISTRATION_REQUIRED', 'Use the approved tenant entitlement configuration route');

      }
      const phase = launchActions.has(action) ? launchPhase(action) : this.phase(action);
      await this.entitled(tx, phase);
      if(launchActions.has(action)) return executeLaunch(this.launchContext(tx,ctx),action,input);
      switch (action) {
        case 'mapExternalIdentifier': return this.mapIdentifier(tx, ctx, input);
        case 'registerDevice': return this.registerDevice(tx, ctx, input);
        case 'assignDevice': return this.assignDevice(tx, ctx, input);
        case 'revokeDevice': return this.revokeDevice(tx, ctx, input);
        case 'ingestObservation': return this.ingest(tx, ctx, input);
        case 'configureAlertRule': return this.configureRule(tx, ctx, input);
        case 'reviewAlert': return this.reviewAlert(tx, ctx, input);
        case 'recordSafetyEvent': return this.safetyEvent(tx, ctx, input);
        case 'reviewSafetyEvent': return this.reviewSafetyEvent(tx, ctx, input);
        case 'recordBreathTest': return this.breathTest(tx, ctx, input);
        case 'recordScorePolicy': return this.scorePolicy(tx, ctx, input);
        case 'calculateScorecard': return this.scorecard(tx, ctx, input);
        case 'configureWarehouse': return this.configureWarehouse(tx, ctx, input);
        case 'recordInventoryReceipt': return this.inventoryReceipt(tx, ctx, input);
        case 'reserveStock': return this.reserve(tx, ctx, input);
        case 'confirmPick': return this.pick(tx, ctx, input);
        case 'recordCount': return this.count(tx, ctx, input);
        case 'approveCount': return this.approveCount(tx, ctx, input);
        case 'recordDockReads': return this.dockReads(tx, ctx, input);
        case 'registerAsset': return this.registerAsset(tx, ctx, input);
        case 'handoverAsset': return this.handoverAsset(tx, ctx, input);
        case 'recordEmissionFactor': return this.emissionFactor(tx, ctx, input);
        case 'calculateEmissions': return this.emissions(tx, ctx, input);
        case 'reviewEmissions': return this.reviewEmissions(tx, ctx, input);
        case 'recordRateCard': return this.rateCard(tx, ctx, input);
        case 'auditFreight': return this.freightAudit(tx, ctx, input);
        case 'approvePaymentExport': return this.approvePayment(tx, ctx, input);
        case 'recordCommissioning': return this.commissioning(tx, ctx, input);
        case 'evaluateInvestment': return this.investment(tx, ctx, input);
        case 'approveInvestment': return this.approveInvestment(tx, ctx, input);
        case 'planMission': return this.planMission(tx, ctx, input);
        case 'recordMissionOutcome': return this.missionOutcome(tx, ctx, input);
        case 'recordStockObservation': return this.stockObservation(tx, ctx, input);
        case 'recordMaintenance': return this.maintenance(tx, ctx, input);
        case 'completeMaintenance': return this.completeMaintenance(tx, ctx, input);
        case 'closeDeviceAssignment': return this.closeAssignment(tx, ctx, input);
        case 'registerHandlingUnit': return this.registerHandlingUnit(tx, ctx, input);
        case 'aggregateHandlingUnits': return this.aggregateHandlingUnits(tx, ctx, input);
        case 'scanHandlingUnit': return this.scanHandlingUnit(tx, ctx, input);
        case 'cancelReservation': return this.cancelReservation(tx, ctx, input);
        case 'calculateEta': return this.calculateEta(tx, ctx, input);
        case 'recordTransportPlan': return this.transportPlan(tx, ctx, input);
        case 'releaseTransportPlan': return this.releasePlan(tx, ctx, input);
        default: return fail(404, 'ACTION_NOT_FOUND', 'Unknown expansion action');
      }
    });
  }

  async query(ctx: Context, resource: string, id?: string): Promise<unknown> {
    return this.db.transaction(ctx, async tx => {
      if (resource === 'capabilities') {
        const conf = await tx.get<RecordEntity>('configuration', 'features');
        return { enabled: conf?.enabled ?? [], integrations: [{ provider: 'ULIP', status: 'not_configured', officialVerification: false }, { provider: 'ERP', status: 'not_configured' }, { provider: 'WCS', status: 'not_configured' }], machineControlSupported: false };
      }
      if(resource==='visibility'){await this.entitled(tx,'P2');this.role(ctx,[...P2,'auditor']);return visibility(this.launchContext(tx,ctx));}
      const resources: Record<string, { kind: string; phase: Phase; roles: string[] }> = {
        ...launchResources,
        devices: { kind: 'devices', phase: 'P2', roles: [...P2, 'auditor'] },
        assignments: { kind: 'device_assignments', phase: 'P2', roles: [...P2, 'auditor'] },
        observations: { kind: 'observations', phase: 'P2', roles: ['owner', 'control_room', 'auditor'] },
        alerts: { kind: 'alerts', phase: 'P2', roles: [...P2, 'auditor'] },
        rules: { kind: 'alert_rules', phase: 'P2', roles: [...P2, 'auditor'] },
        safety: { kind: 'safety_events', phase: 'P2', roles: ['owner', 'control_room', 'auditor'] },
        breathTests: { kind: 'safety_tests', phase: 'P2', roles: ['owner', 'control_room', 'auditor'] },
        scorecards: { kind: 'scorecards', phase: 'P2', roles: ['owner', 'control_room', 'auditor'] },
        inventory: { kind: 'stock', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        movements: { kind: 'inventory_movements', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        reservations: { kind: 'reservations', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        counts: { kind: 'counts', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        dockReads: { kind: 'dock_reads', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        assets: { kind: 'returnable_assets', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        assetHandovers: { kind: 'asset_handovers', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        emissions: { kind: 'emissions_runs', phase: 'P2', roles: ['owner', 'sustainability', 'auditor'] },
        factors: { kind: 'emission_factors', phase: 'P2', roles: ['owner', 'sustainability', 'auditor'] },
        freightAudits: { kind: 'freight_audits', phase: 'P2', roles: [...FINANCE, 'auditor'] },
        investments: { kind: 'investments', phase: 'P2', roles: ['owner', 'finance', 'auditor'] },
        commissioning: { kind: 'commissioning', phase: 'P2', roles: [...P2, 'auditor'] },
        missions: { kind: 'automation_missions', phase: 'P4', roles: [...WAREHOUSE, 'auditor'] },
        stockObservations: { kind: 'stock_observations', phase: 'P4', roles: [...WAREHOUSE, 'auditor'] },
        maintenance: { kind: 'maintenance', phase: 'P4', roles: [...P2, 'auditor'] },
        maintenanceEvents: { kind: 'maintenance_events', phase: 'P4', roles: [...P2, 'auditor'] },
        handlingUnits: { kind: 'handling_units', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        handlingEvents: { kind: 'handling_unit_events', phase: 'P3', roles: [...WAREHOUSE, 'auditor'] },
        etaEstimates: { kind: 'eta_estimates', phase: 'P2', roles: [...P2, 'auditor'] },
        transportPlans: { kind: 'route_plans', phase: 'P4', roles: [...P2, 'auditor'] },
        emissionsReviews: { kind: 'emissions_reviews', phase: 'P2', roles: ['owner', 'sustainability', 'auditor'] },
      };
      if (resource === 'positions') {
        await this.entitled(tx, 'P2'); this.role(ctx, [...P2, 'auditor']);
        const values = await tx.list<RecordEntity>('positions');
        const now = this.now().getTime();
        return values.map(v => ({ ...v, ageSeconds: Math.max(0, Math.floor((now - Date.parse(String(v.occurredAt))) / 1000)), signalStatus: now - Date.parse(String(v.occurredAt)) > 300000 ? 'stale' : 'observed', receiptConfirmed: false }));
      }
      const definition = resources[resource];
      if (!definition) fail(404, 'RESOURCE_NOT_FOUND', 'Unknown expansion resource');
      await this.entitled(tx, definition.phase); this.role(ctx, definition.roles);
      const rows = id ? [await this.required(tx, definition.kind, id)] : await tx.list<RecordEntity>(definition.kind);
      const scopedRows = rows.filter(v => this.canSite(ctx, typeof v.facilityId === 'string' ? v.facilityId : undefined) && (ctx.role !== 'warehouse' || !!ctx.organizationId && v.ownerOrganizationId === ctx.organizationId));
      let allowed=await redactWarehouse(this.launchContext(tx,ctx),resource,scopedRows);if(resource==='recoveryReports')allowed=await Promise.all(allowed.map(r=>recoveryReportView(this.launchContext(tx,ctx),r)));
      if (id && !allowed.length) fail(404, 'NOT_FOUND', 'Record not found');
      if (resource === 'safety' || resource === 'breathTests') await tx.audit('restricted.safety.read', id ?? 'list', {});
      return id ? allowed[0] : allowed;
    });
  }

  private launchContext(tx:Transaction,ctx:Context):LaunchContext{return {tx,ctx,now:this.time(),hooks:{receipt:i=>this.inventoryReceipt(tx,ctx,i),count:i=>this.count(tx,ctx,i),approveCount:i=>this.approveCount(tx,ctx,i)}};}
  private time() { return this.now().toISOString(); }
  private role(ctx: Context, roles: string[]) { if (!roles.includes(ctx.role)) fail(403, 'ROLE_FORBIDDEN', 'Your role cannot perform this operation'); }
  private canSite(ctx: Context, facilityId?: string) { return ctx.role !== 'warehouse' || !!facilityId && !!ctx.facilityIds?.includes(facilityId); }
  private site(ctx: Context, facilityId: string) { if (!this.canSite(ctx, facilityId)) fail(404, 'NOT_FOUND', 'Facility not found'); }
  private phase(action: string): Phase {
    if (['configureWarehouse','recordInventoryReceipt','reserveStock','confirmPick','recordCount','approveCount','recordDockReads','registerAsset','handoverAsset','registerHandlingUnit','aggregateHandlingUnits','scanHandlingUnit','cancelReservation'].includes(action)) return 'P3';
    if (['planMission','recordMissionOutcome','recordStockObservation','recordMaintenance','completeMaintenance','recordTransportPlan','releaseTransportPlan'].includes(action)) return 'P4';
    return 'P2';
  }
  private async entitled(tx: Transaction, phase: Phase) {
    const conf = await tx.get<RecordEntity>('configuration', 'features');
    if (!Array.isArray(conf?.enabled) || !conf.enabled.includes(phase)) fail(403, 'PHASE_NOT_ENABLED', `${phase} is not enabled under this tenant's contract`);
  }
  private async required(tx: Transaction, kind: string, id: string) { const value = await tx.get<RecordEntity>(kind, id); if (!value) fail(404, 'NOT_FOUND', 'Record not found'); return value; }
  private async create(tx: Transaction, ctx: Context, kind: string, fields: Record<string, unknown>, id: string = randomUUID()) {
    if (await tx.get(kind, id)) fail(409, 'DUPLICATE', 'Record already exists');
    const value: RecordEntity = { id, ...fields, createdAt: this.time(), createdBy: ctx.userId };
    await tx.put(kind, value); await tx.audit(`${kind}.created`, id, {}); return value;
  }
  private async append(tx: Transaction, ctx: Context, kind: string, fields: Record<string, unknown>, id?: string) {
    if (!immutableKinds.has(kind)) fail(500, 'IMMUTABLE_KIND', 'Invalid append-only entity kind');
    return this.create(tx, ctx, kind, fields, id);
  }

  private async mapIdentifier(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2);
    const provider = text(i, 'provider'), externalId = text(i, 'externalId'), entityType = choice(i, 'entityType', ['vehicle','driver','trip','organization','facility','consignment']);
    const entityId = text(i, 'entityId'), validFrom = date(i, 'validFrom'), validTo = date(i, 'validTo', true) || null;
    if (validTo && validTo <= validFrom) fail(400, 'INVALID_INTERVAL', 'validTo must follow validFrom');
    const prior = await tx.list<RecordEntity>('external_identifiers');
    if (prior.some(v => v.provider === provider && v.externalId === externalId && v.entityType === entityType && String(v.validFrom) < (validTo ?? '9999') && String(v.validTo ?? '9999') > validFrom)) fail(409, 'AMBIGUOUS_MAPPING', 'An overlapping external identifier mapping exists');
    if (entityType === 'trip' || entityType === 'organization' || entityType === 'facility' || entityType === 'consignment') await this.required(tx, `${entityType === 'organization' ? 'organizations' : entityType === 'facility' ? 'facilities' : entityType === 'trip' ? 'trips' : 'consignments'}`, entityId);
    return this.create(tx, ctx, 'external_identifiers', { provider, externalId, entityType, entityId, validFrom, validTo, source: text(i, 'source') });
  }

  private async registerDevice(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2);
    const publicKey = text(i, 'publicKey');
    try { if (createPublicKey(publicKey).asymmetricKeyType !== 'ed25519') fail(400, 'INVALID_KEY', 'An Ed25519 public key is required'); } catch { fail(400, 'INVALID_KEY', 'A valid Ed25519 public key is required'); }
    const serial = text(i, 'serial'), vendor = text(i, 'vendor');
    if ((await tx.list<RecordEntity>('devices')).some(d => d.serial === serial && d.vendor === vendor && d.status === 'active')) fail(409, 'DEVICE_EXISTS', 'Vendor serial already registered');
    const capabilities = i.capabilities;
    if (!Array.isArray(capabilities) || !capabilities.length || capabilities.some(v => !['gps','temperature','door','fuel','breath','camera','humidity','tamper','connectivity'].includes(v))) fail(400, 'INVALID_CAPABILITIES', 'Select supported device capabilities');
    return this.create(tx, ctx, 'devices', { vendor, serial, publicKey, capabilities, firmware: text(i, 'firmware'), calibrationExpiresAt: date(i, 'calibrationExpiresAt', true) || null, approvalReference: text(i, 'approvalReference'), status: 'active' });
  }

  private async assignDevice(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2);
    const deviceId = text(i, 'deviceId'), device = await this.required(tx, 'devices', deviceId);
    if (device.status !== 'active') fail(409, 'DEVICE_REVOKED', 'Device is not active');
    const vehicleId = text(i, 'vehicleId', true) || null, facilityId = text(i, 'facilityId', true) || null;
    if ((!vehicleId && !facilityId) || (vehicleId && facilityId)) fail(400, 'ASSIGNMENT_TARGET', 'Specify exactly one vehicle or facility');
    if (facilityId) await this.required(tx, 'facilities', facilityId);
    const validFrom = date(i, 'validFrom'), validTo = date(i, 'validTo', true) || null;
    if (validTo && validTo <= validFrom) fail(400, 'INVALID_INTERVAL', 'validTo must follow validFrom');
    const existing = await tx.list<RecordEntity>('device_assignments');
    if (existing.some(v => v.deviceId === deviceId && String(v.validFrom) < (validTo ?? '9999') && String(v.validTo ?? '9999') > validFrom)) fail(409, 'OVERLAPPING_ASSIGNMENT', 'Device assignment intervals cannot overlap; close the previous interval first');
    return this.create(tx, ctx, 'device_assignments', { deviceId, vehicleId, facilityId, validFrom, validTo });
  }

  private async revokeDevice(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2); const d = await this.required(tx, 'devices', text(i, 'deviceId'));
    d.status = 'revoked'; d.revokedAt = this.time(); d.revocationReason = text(i, 'reason'); await tx.put('devices', d); await tx.audit('device.revoked', d.id, { reason: d.revocationReason }); return d;
  }

  private async ingest(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']);
    const envelope = object(i.envelope);
    if (envelope.tenantId !== ctx.tenantId) fail(403, 'TENANT_MISMATCH', 'Signed observation must bind the authenticated tenant');
    const deviceId = text(envelope, 'deviceId'), eventId = text(envelope, 'eventId');
    const device = await this.required(tx, 'devices', deviceId);
    if (device.status !== 'active') fail(403, 'DEVICE_REVOKED', 'Device credential is revoked');
    const signature = text(i, 'signature');
    let valid = false;
    try { valid = verify(null, Buffer.from(canonical(envelope)), String(device.publicKey), Buffer.from(signature, 'base64')); } catch { /* rejected below */ }
    if (!valid) fail(401, 'BAD_SIGNATURE', 'Device event signature is invalid');
    const id = sha({ deviceId, eventId }), digest = sha(envelope), prior = await tx.get<RecordEntity>('observations', id);
    if (prior) { if (prior.payloadHash !== digest) fail(409, 'EVENT_CONFLICT', 'Event identifier was already used with different content'); return { ...prior, duplicate: true }; }
    const occurredAt = date(envelope, 'occurredAt'), kind = choice(envelope, 'kind', ['gps','temperature','door','fuel','humidity','tamper','connectivity']);
    if (!Array.isArray(device.capabilities) || !device.capabilities.includes(kind)) fail(400, 'DEVICE_CAPABILITY', 'Device is not registered for this capability');
    const ingestTime = this.time();
    if (Date.parse(ingestTime) - Date.parse(occurredAt) > 31 * 86400000) fail(400, 'OBSERVATION_TOO_OLD', 'Observations older than 31 days require an archival import process');
    if (Date.parse(occurredAt) > Date.parse(ingestTime) + 300000) fail(400, 'CLOCK_SKEW', 'Observation time is too far in the future');
    const assignments = (await tx.list<RecordEntity>('device_assignments')).filter(a => a.deviceId === deviceId && String(a.validFrom) <= occurredAt && (!a.validTo || String(a.validTo) > occurredAt));
    if (assignments.length !== 1) fail(409, 'ASSIGNMENT_UNKNOWN', 'No unambiguous device assignment exists at observation time');
    const assignment = assignments[0]!, data = object(envelope.data);
    if (envelope.vehicleId && envelope.vehicleId !== assignment.vehicleId || envelope.facilityId && envelope.facilityId !== assignment.facilityId) fail(403, 'TARGET_MISMATCH', 'Event target does not match the device assignment');
    if (kind === 'gps') { number(data, 'latitude', -90, 90); number(data, 'longitude', -180, 180); number(data, 'accuracyMeters', 0, 100000); if(data.speedKmh!==undefined)number(data,'speedKmh',0,300);if(data.ignitionOn!==undefined&&typeof data.ignitionOn!=='boolean')fail(400,'IGNITION_STATE','Ignition state must be boolean'); }
    else if(kind==='connectivity'){if(typeof data.online!=='boolean')fail(400,'CONNECTIVITY_STATE','Connectivity must be an explicit signed boolean');}
    else { text(data, 'unit'); if (typeof data.value !== 'number' || !Number.isFinite(data.value)) fail(400, 'SENSOR_VALUE', 'Sensor value must be a finite number'); }
    const observation = await this.append(tx, ctx, 'observations', { deviceId, eventId, occurredAt, ingestedAt: ingestTime, kind, data, assignmentId: assignment.id, vehicleId: assignment.vehicleId, facilityId: assignment.facilityId, source: device.vendor, payloadHash: digest, late: Date.parse(ingestTime) - Date.parse(occurredAt) > 300000, sensorHealth: choice(envelope, 'sensorHealth', ['healthy','faulty','unknown']), calibrationValid: !['temperature','fuel','humidity'].includes(kind) || !!device.calibrationExpiresAt && String(device.calibrationExpiresAt) >= occurredAt }, id);
    if (kind === 'gps') {
      const positionId = String(assignment.vehicleId ?? assignment.facilityId), current = await tx.get<RecordEntity>('positions', positionId);
      if (!current || String(current.occurredAt) < occurredAt) await tx.put('positions', { id: positionId, observationId: id, deviceId, occurredAt, ingestedAt: ingestTime, data, source: device.vendor,sensorHealth:observation.sensorHealth, assignmentId: assignment.id, vehicleId: assignment.vehicleId, facilityId: assignment.facilityId });
    }
    if(kind==='gps'||kind==='connectivity'){const h=await tx.get<RecordEntity>('device_health',deviceId);if(!h||String(h.occurredAt)<occurredAt)await tx.put('device_health',{id:deviceId,vehicleId:assignment.vehicleId,facilityId:assignment.facilityId,occurredAt,observationId:id,online:kind==='gps'?true:data.online,sensorHealth:observation.sensorHealth});}
    await this.evaluateSensorRules(tx, ctx, observation);
    await operationalObservation(this.launchContext(tx,ctx),observation);
    await tx.emit('telemetry.observed', id, { deviceId, kind, vehicleId: assignment.vehicleId, facilityId: assignment.facilityId });
    return observation;
  }

  private async configureRule(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner', 'control_room']);
    const metric = choice(i, 'metric', ['temperature','fuel','humidity']), lower = number(i, 'lower', -1000, 100000), upper = number(i, 'upper', -1000, 100000);
    if (upper <= lower) fail(400, 'INVALID_BOUNDS', 'upper must exceed lower');
    await this.required(tx, 'devices', text(i, 'deviceId'));
    return this.create(tx, ctx, 'alert_rules', { metric, lower, upper, unit: text(i, 'unit'), hysteresis: number(i, 'hysteresis', 0, (upper - lower) / 2), durationSeconds: number(i, 'durationSeconds', 0, 86400), deviceId: text(i, 'deviceId'), ownerUserId: text(i, 'ownerUserId'), severity: choice(i, 'severity', ['low','medium','high','critical']), version: number(i, 'version', 1, 100000), active: true, sopReference: text(i, 'sopReference') });
  }

  private async evaluateSensorRules(tx: Transaction, ctx: Context, o: RecordEntity) {
    if (o.kind === 'gps' || o.kind==='connectivity' || o.sensorHealth !== 'healthy' || !o.calibrationValid || o.late) return;
    const data = object(o.data), rules = (await tx.list<RecordEntity>('alert_rules')).filter(r => r.deviceId === o.deviceId && r.metric === o.kind && r.active && r.unit === data.unit);
    for (const rule of rules) {
      const v = Number(data.value); if (!Number.isFinite(v)) continue;
      const stateId = `${rule.id}:${String(o.deviceId)}`, state = await tx.get<RecordEntity>('rule_states', stateId);
      if (state && String(state.lastOccurredAt) >= String(o.occurredAt)) continue;
      const breached = v < Number(rule.lower) || v > Number(rule.upper);
      const recovered = v >= Number(rule.lower) + Number(rule.hysteresis) && v <= Number(rule.upper) - Number(rule.hysteresis);
      const beganAt = breached ? state?.beganAt ?? o.occurredAt : recovered ? null : state?.beganAt;
      let alertId = state?.alertId ?? null;
      if (beganAt && !alertId && Date.parse(String(o.occurredAt)) - Date.parse(String(beganAt)) >= Number(rule.durationSeconds) * 1000) {
        const a = await this.create(tx, ctx, 'alerts', { observationId: o.id, ruleId: rule.id, ruleVersion: rule.version, severity: rule.severity, ownerUserId: rule.ownerUserId, status: 'new', evidence: { data, occurredAt: o.occurredAt }, notificationStatus: 'awaiting_approved_schedule', history: [] });
        alertId = a.id; await tx.emit('telemetry.alert.created', a.id, { alertId: a.id, ruleId: rule.id, ownerUserId: rule.ownerUserId });
      }
      if (recovered) alertId = null;
      await tx.put('rule_states', { id: stateId, beganAt, alertId, lastOccurredAt: o.occurredAt });
    }
  }

  private async reviewAlert(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']); const a = await this.required(tx, 'alerts', text(i, 'alertId'));
    const status = choice(i, 'status', ['acknowledged','under_review','action_recorded','resolved','dismissed']), reason = text(i, 'reason');
    if (['resolved','dismissed'].includes(String(a.status))) fail(409, 'ALERT_CLOSED', 'A closed case requires a new linked follow-up case');
    a.status = status; a.history = [...Array.isArray(a.history) ? a.history : [], { status, reason, actor: ctx.userId, at: this.time() }];
    await tx.put('alerts', a); await tx.audit('alert.reviewed', a.id, { status, reason }); return a;
  }

  private async safetyEvent(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']);
    const clipEvidenceId = text(i, 'clipEvidenceId', true) || null;
    if (clipEvidenceId) { const evidence = await this.required(tx, 'evidence', clipEvidenceId); if (!['clean','CLEAN'].includes(String(evidence.scanStatus ?? evidence.scanState))) fail(409, 'EVIDENCE_NOT_CLEAN', 'Incident clip evidence must be scan clean'); }
    const previous = (await tx.list<RecordEntity>('safety_events')).find(e => e.provider === i.provider && e.providerEventId === i.providerEventId);
    if (previous) fail(409, 'PROVIDER_EVENT_EXISTS', 'Provider event already exists; use the review workflow');
    return this.create(tx, ctx, 'safety_events', { driverId: text(i, 'driverId'), vehicleId: text(i, 'vehicleId'), provider: text(i, 'provider'), providerEventId: text(i, 'providerEventId'), occurredAt: date(i, 'occurredAt'), category: choice(i, 'category', ['fatigue','distraction','phone_use','seatbelt','collision_warning']), confidence: i.confidence === undefined ? null : number(i, 'confidence', 0, 1), clipEvidenceId, status: 'unreviewed', reviewHistory: [], allegation: true });
  }

  private async reviewSafetyEvent(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']); const e = await this.required(tx, 'safety_events', text(i, 'eventId'));
    const outcome = choice(i, 'outcome', ['confirmed','false_positive','inconclusive']), reason = text(i, 'reason');
    e.reviewHistory = [...Array.isArray(e.reviewHistory) ? e.reviewHistory : [], { previousStatus: e.status, outcome, reason, actor: ctx.userId, at: this.time() }];
    e.status = outcome; e.allegation = outcome !== 'confirmed'; e.reviewedAt = this.time();
    await tx.put('safety_events', e); await tx.audit('safety.reviewed', e.id, { outcome, reason }); return e;
  }

  private async breathTest(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']); const device = await this.required(tx, 'devices', text(i, 'deviceId'));
    const testedAt = date(i, 'testedAt'), expiresAt = date(i, 'expiresAt'), driverId = text(i, 'driverId'), tripId = text(i, 'tripId');
    const trip = await this.required(tx, 'trips', tripId);
    if (trip.driverId !== driverId) fail(403, 'DRIVER_TRIP_MISMATCH', 'Breath test driver does not match the assigned trip driver');
    if (expiresAt <= testedAt || Date.parse(testedAt) > this.now().getTime() + 60000) fail(400, 'INVALID_TEST_PERIOD', 'Breath test validity period is invalid');
    if (choice(i, 'context', ['pretrip','in_trip']) === 'in_trip' && i.stationaryConfirmed !== true) fail(409, 'SAFE_STOP_REQUIRED', 'In-trip tests require a confirmed safe stationary location');
    const result = choice(i, 'result', ['pass','fail','tampered','missing']);
    const calibrated = device.status === 'active' && Array.isArray(device.capabilities) && device.capabilities.includes('breath') && !!device.calibrationExpiresAt && String(device.calibrationExpiresAt) >= testedAt;
    const assigned = (await tx.list<RecordEntity>('device_assignments')).some(a => a.deviceId === device.id && (a.vehicleId === trip.vehicleId || a.vehicleId === trip.vehicleNumber) && String(a.validFrom) <= testedAt && (!a.validTo || String(a.validTo) > testedAt));
    const valid = calibrated && assigned && result === 'pass' && expiresAt > this.time();
    const value = await this.append(tx, ctx, 'safety_tests', { deviceId: device.id, driverId, tripId, testedAt, expiresAt, result, resultValue: text(i, 'resultValue'), resultUnit: text(i, 'resultUnit'), calibrated, assigned, valid, sourceReference: text(i, 'sourceReference'), dispatchDecision: valid ? 'eligible_for_sop_review' : 'hold', vehicleCommandIssued: false });
    const priorHold = await tx.get<RecordEntity>('dispatch_holds', tripId);
    if (priorHold?.testedAt && String(priorHold.testedAt) > testedAt) fail(409, 'STALE_BREATH_TEST', 'A newer test already controls the dispatch review');
    await tx.put('dispatch_holds', { id: tripId, testedAt, expiresAt, tripId, testId: value.id, held: !valid, reason: valid ? null : 'Missing, failed, expired, tampered or out-of-calibration breath test', reviewedBy: ctx.userId, updatedAt: this.time(), vehicleActuation: false });
    return value;
  }

  private async scorePolicy(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']); const weights = object(i.weights);
    for (const [key, value] of Object.entries(weights)) if (!['fatigue','distraction','phone_use','seatbelt','collision_warning'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) fail(400, 'INVALID_WEIGHT', 'Score weights must be supported event categories and finite nonnegative numbers');
    return this.create(tx, ctx, 'score_policies', { name: text(i, 'name'), version: number(i, 'version', 1), minimumDistanceKm: text(i, 'minimumDistanceKm'), weights, unit: 'reviewed_points_per_1000_km', approvedBy: ctx.userId });
  }

  private async scorecard(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','control_room']); const policy = await this.required(tx, 'score_policies', text(i, 'policyId'));
    const driverId = text(i, 'driverId'), from = date(i, 'from'), to = date(i, 'to');
    if (to <= from) fail(400, 'INVALID_PERIOD', 'to must follow from');
    const distance = decimal(i.distanceKm, 'distanceKm'), min = decimal(policy.minimumDistanceKm, 'minimumDistanceKm');
    const sourceReference = text(i, 'exposureSourceReference');
    const events = (await tx.list<RecordEntity>('safety_events')).filter(e => e.driverId === driverId && String(e.occurredAt) >= from && String(e.occurredAt) < to);
    const confirmed = events.filter(e => e.status === 'confirmed'), weights = object(policy.weights);
    const points = confirmed.reduce((total, e) => total + Number(weights[String(e.category)] ?? 0), 0);
    const dataSufficient = distance > 0n && distance >= min;
    return this.append(tx, ctx, 'scorecards', { driverId, from, to, policyId: policy.id, policyVersion: policy.version, distanceKm: formatted(distance), exposureSourceReference: sourceReference, dataSufficient, score: dataSufficient ? points * 1000 / (Number(distance) / 1000000) : null, scoreMeaning: 'reviewed weighted events per 1000 kilometres; lower is fewer reviewed events', contributingEventIds: confirmed.map(e => e.id), excludedEventIds: events.filter(e => e.status !== 'confirmed').map(e => e.id), sourceSnapshot: confirmed.map(e => ({ id: e.id, category: e.category, reviewedAt: e.reviewedAt, reviewHistory: e.reviewHistory })), incentiveStatus: 'requires_supervisor_review', payrollActionIssued: false });
  }

  private async configureWarehouse(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner']); const facilityId = text(i, 'facilityId'), ownerOrganizationId = text(i, 'ownerOrganizationId');
    await this.required(tx, 'facilities', facilityId); await this.required(tx, 'organizations', ownerOrganizationId);
    const authority = choice(i, 'authority', ['cargoorbit_foundation','external_wms']);
    const id = `${facilityId}:${ownerOrganizationId}`, previous = await tx.get<RecordEntity>('warehouse_config', id);
    if (previous && previous.authority !== authority && (await tx.list<RecordEntity>('stock')).some(s => s.facilityId === facilityId && s.ownerOrganizationId === ownerOrganizationId && decimal(s.quantity) > 0n)) fail(409, 'CUTOVER_REQUIRED', 'Changing stock authority requires reconciled cutover with no remaining local stock');
    const config = { id, facilityId, ownerOrganizationId, authority, approvedBy: ctx.userId, approvedAt: this.time(), sourceReference: text(i, 'sourceReference') };
    await tx.put('warehouse_config', config); await tx.audit('warehouse.authority.configured', id, { authority }); return config;
  }
  private async stockAuthority(tx: Transaction, ctx: Context, facilityId: string, ownerOrganizationId: string) {
    this.site(ctx, facilityId); this.stockOwner(ctx, ownerOrganizationId); const config = await this.required(tx, 'warehouse_config', `${facilityId}:${ownerOrganizationId}`);
    if (config.authority !== 'cargoorbit_foundation') fail(409, 'EXTERNAL_WMS_AUTHORITY', 'Warehouse writes require the approved external WMS adapter; no local posting is allowed');
  }
  private stockOwner(ctx: Context, ownerOrganizationId: string) { if (ctx.role === 'warehouse' && (!ctx.organizationId || ctx.organizationId !== ownerOrganizationId)) fail(404, 'NOT_FOUND', 'Stock owner is outside your membership'); }
  private stockId(i: Record<string, unknown>) { return sha({ facilityId: text(i, 'facilityId'), ownerOrganizationId: text(i, 'ownerOrganizationId'), sku: text(i, 'sku'), bin: text(i, 'bin'), unit: text(i, 'unit'), lot: text(i, 'lot', true), condition: choice(i, 'condition', ['available','quarantine','damaged']) }); }
  private async operation(tx: Transaction, id: string, payload: unknown) { const previous = await tx.get<RecordEntity>('expansion_operations', id); if (previous && previous.payloadHash !== sha(payload)) fail(409, 'IDEMPOTENCY_CONFLICT', 'Operation identifier was reused with a different payload'); return previous; }
  private async completed(tx: Transaction, id: string, payload: unknown, result: unknown) { await tx.put('expansion_operations', { id, payloadHash: sha(payload), result, completedAt: this.time() }); return result; }

  private async inventoryReceipt(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE);
    const facilityId = text(i, 'facilityId'), ownerOrganizationId = text(i, 'ownerOrganizationId'); await this.stockAuthority(tx, ctx, facilityId, ownerOrganizationId);
    const operationId = `receipt:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    const expected = decimal(i.expectedQuantity, 'expectedQuantity'), accepted = decimal(i.acceptedQuantity, 'acceptedQuantity'), damaged = decimal(i.damagedQuantity, 'damagedQuantity'), quarantine=decimal(i.quarantineQuantity??'0','quarantineQuantity'), short = decimal(i.shortQuantity, 'shortQuantity');
    if (accepted + damaged + quarantine + short !== expected || expected <= 0n) fail(400, 'QUANTITY_MISMATCH', 'Expected receipt must equal accepted, damaged, quarantine and short quantities');
    const sourceReference = text(i, 'sourceReference'), receivedAt = date(i, 'receivedAt'), movements: RecordEntity[] = [];
    for (const [condition, quantity] of [['available', accepted], ['damaged', damaged], ['quarantine',quarantine]] as const) {
      if (quantity === 0n) continue;
      const fields = { ...i, condition }, stockId = this.stockId(fields), existing = await tx.get<RecordEntity>('stock', stockId);
      const stock = existing ?? { id: stockId, facilityId, ownerOrganizationId, sku: text(i, 'sku'), bin: text(i, 'bin'), unit: text(i, 'unit'), lot: text(i, 'lot', true), condition, quantity: '0', reserved: '0' };
      stock.quantity = formatted(decimal(stock.quantity) + quantity); stock.updatedAt = this.time(); await tx.put('stock', stock);
      movements.push(await this.append(tx, ctx, 'inventory_movements', { operationId, stockId, facilityId, ownerOrganizationId, direction: 'in', quantity: formatted(quantity), reason: 'inbound_receipt', sourceReference, receivedAt, postedToErp: false }));
    }
    return this.completed(tx, operationId, i, { operationId, sourceReference, expected: formatted(expected), short: formatted(short), movements, inventoryAccepted: true, erpPostingStatus: 'not_requested' });
  }

  private async reserve(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE);
    const stock = await this.required(tx, 'stock', text(i, 'stockId')); await this.stockAuthority(tx, ctx, String(stock.facilityId), String(stock.ownerOrganizationId));
    const operationId = `reserve:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    if (stock.condition !== 'available') fail(409, 'STOCK_NOT_AVAILABLE', 'Quarantined or damaged stock cannot be reserved');
    const quantity = decimal(i.quantity), available = decimal(stock.quantity) - decimal(stock.reserved);
    if (quantity <= 0n || quantity > available) fail(409, 'INSUFFICIENT_STOCK', 'Insufficient unreserved stock');
    const consignmentId = text(i, 'consignmentId'); const shipment = await this.required(tx, 'consignments', consignmentId);
    if (shipment.consignorId !== stock.ownerOrganizationId && shipment.stockOwnerOrganizationId !== stock.ownerOrganizationId) fail(403, 'STOCK_OWNER_MISMATCH', 'Stock may only be reserved for its owner shipment');
    if (shipment.originId && shipment.originId !== stock.facilityId) fail(403, 'STOCK_SITE_MISMATCH', 'Shipment pickup site must match stock location');
    stock.reserved = formatted(decimal(stock.reserved) + quantity); stock.updatedAt = this.time(); await tx.put('stock', stock);
    const result = await this.create(tx, ctx, 'reservations', { stockId: stock.id, facilityId: stock.facilityId, ownerOrganizationId: stock.ownerOrganizationId, quantity: formatted(quantity), consignmentId, status: 'reserved', operationId });
    return this.completed(tx, operationId, i, result);
  }

  private async pick(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE);
    const reservation = await this.required(tx, 'reservations', text(i, 'reservationId')), stock = await this.required(tx, 'stock', String(reservation.stockId));
    await this.stockAuthority(tx, ctx, String(stock.facilityId), String(stock.ownerOrganizationId));
    const operationId = `pick:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    if (reservation.status !== 'reserved') fail(409, 'RESERVATION_NOT_OPEN', 'Reservation was already consumed or cancelled');
    if (text(i, 'scannedSku') !== stock.sku || text(i, 'scannedBin') !== stock.bin || text(i, 'scannedUnit') !== stock.unit) fail(409, 'SCAN_MISMATCH', 'Scanned SKU, bin or unit does not match the reservation');
    const quantity = decimal(reservation.quantity);
    if (decimal(stock.quantity) < quantity || decimal(stock.reserved) < quantity) fail(409, 'STOCK_CONFLICT', 'Stock no longer reconciles to this reservation');
    stock.quantity = formatted(decimal(stock.quantity) - quantity); stock.reserved = formatted(decimal(stock.reserved) - quantity); stock.updatedAt = this.time(); await tx.put('stock', stock);
    reservation.status = 'dispatched'; reservation.dispatchedAt = this.time(); await tx.put('reservations', reservation);
    const movement = await this.append(tx, ctx, 'inventory_movements', { facilityId: stock.facilityId, ownerOrganizationId: stock.ownerOrganizationId, stockId: stock.id, reservationId: reservation.id, consignmentId: reservation.consignmentId, direction: 'out', quantity: formatted(quantity), reason: 'confirmed_pick_dispatch', operationId, sourceReference: text(i, 'sourceReference'), postedToErp: false });
    return this.completed(tx, operationId, i, movement);
  }

  private async count(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const stock = await this.required(tx, 'stock', text(i, 'stockId')); this.site(ctx, String(stock.facilityId)); this.stockOwner(ctx, String(stock.ownerOrganizationId));
    const observedQuantity = formatted(decimal(i.observedQuantity, 'observedQuantity'));
    const result=await this.create(tx, ctx, 'counts', { stockId: stock.id, facilityId: stock.facilityId, ownerOrganizationId: stock.ownerOrganizationId, expectedSnapshot: stock.quantity, observedQuantity, source: choice(i, 'source', ['handheld','camera','drone','manual']), sourceReference: text(i, 'sourceReference'), confidence: i.confidence === undefined ? null : number(i, 'confidence', 0, 1), status: 'awaiting_review', stockUpdatedAt: stock.updatedAt });if(ctx.role==='warehouse'){const {expectedSnapshot,stockUpdatedAt,...visible}=result;return visible;}return result;
  }

  private async approveCount(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner']); const count = await this.required(tx, 'counts', text(i, 'countId'));
    if (count.status !== 'awaiting_review') fail(409, 'COUNT_CLOSED', 'Count already reviewed');
    if (count.createdBy === ctx.userId) fail(403, 'MAKER_CHECKER', 'A different supervisor must approve a count adjustment');
    const stock = await this.required(tx, 'stock', String(count.stockId)); await this.stockAuthority(tx, ctx, String(stock.facilityId), String(stock.ownerOrganizationId));
    if (stock.updatedAt !== count.stockUpdatedAt || stock.quantity !== count.expectedSnapshot) fail(409, 'RECOUNT_REQUIRED', 'Stock changed after the count; perform a fresh count');
    const quantity = decimal(count.observedQuantity); if (quantity < decimal(stock.reserved)) fail(409, 'RESERVATIONS_EXCEED_COUNT', 'Resolve reservations before reducing stock below the reserved balance');
    const difference = quantity - decimal(stock.quantity), reason = text(i, 'reason');
    stock.quantity = formatted(quantity); stock.updatedAt = this.time(); await tx.put('stock', stock);
    const movement = await this.append(tx, ctx, 'inventory_movements', { facilityId: stock.facilityId, ownerOrganizationId: stock.ownerOrganizationId, stockId: stock.id, countId: count.id, direction: difference < 0 ? 'out' : 'in', quantity: formatted(difference < 0 ? -difference : difference), reason: 'approved_count_adjustment', reviewReason: reason, sourceReference: count.sourceReference });
    count.status = 'approved'; count.approvedBy = ctx.userId; count.approvedAt = this.time(); count.movementId = movement.id; await tx.put('counts', count); await tx.audit('count.approved', count.id, { reason }); return count;
  }

  private async dockReads(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE);
    const facilityId = text(i, 'facilityId'), ownerOrganizationId = text(i, 'ownerOrganizationId'); this.site(ctx, facilityId); this.stockOwner(ctx, ownerOrganizationId); await this.required(tx, 'facilities', facilityId); await this.required(tx, 'organizations', ownerOrganizationId);
    const operationId = `dock:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    const expected = i.expectedIds, reads = i.readIds;
    if (!Array.isArray(expected) || !Array.isArray(reads) || expected.length > 10000 || reads.length > 10000 || [...expected,...reads].some(v => typeof v !== 'string' || v.length > 200)) fail(400, 'INVALID_READS', 'expectedIds and readIds must be bounded arrays of identifiers');
    const unique = [...new Set(reads as string[])], expectedIds = [...new Set(expected as string[])], missing = expectedIds.filter(v => !unique.includes(v)), unexpected = unique.filter(v => !expectedIds.includes(v));
    const value = await this.append(tx, ctx, 'dock_reads', { facilityId, ownerOrganizationId, dockId: text(i, 'dockId'), expectedIds, readIds: unique, duplicateCount: reads.length - unique.length, missing, unexpected, direction: choice(i, 'direction', ['in','out','ambiguous']), sourceReference: text(i, 'sourceReference'), reconciliationRequired: missing.length > 0 || unexpected.length > 0 || reads.length>unique.length || i.direction === 'ambiguous', stockPosted: false, receiptConfirmed: false });
    for(const [reasonCode,identifiers] of [['missing',missing],['unexpected',unexpected],['duplicate',unique.filter(id=>(reads as string[]).filter(v=>v===id).length>1)],['ambiguous_direction',i.direction==='ambiguous'?['direction']:[]]] as const){if(identifiers.length)await this.create(tx,ctx,'handling_exceptions',{dockReadId:value.id,movementId:null,facilityId,ownerOrganizationId,ownerUserId:ctx.userId,reasonCode,identifiers,status:'open',sourceReference:value.sourceReference,receiptConfirmed:false});}
    return this.completed(tx, operationId, i, value);
  }

  private async registerAsset(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const serial = text(i, 'serial'), facilityId = text(i, 'facilityId'), ownerOrganizationId = text(i, 'ownerOrganizationId');
    this.site(ctx, facilityId); this.stockOwner(ctx, ownerOrganizationId); await this.required(tx, 'facilities', facilityId); await this.required(tx, 'organizations', ownerOrganizationId);
    if ((await tx.list<RecordEntity>('returnable_assets')).some(v => v.serial === serial && v.ownerOrganizationId === ownerOrganizationId)) fail(409, 'ASSET_EXISTS', 'An asset with this owner and serial already exists');
    return this.create(tx, ctx, 'returnable_assets', { serial, ownerOrganizationId, facilityId, assetType: choice(i, 'assetType', ['rack','bin','pallet','other']), identifierStandard: choice(i, 'identifierStandard', ['internal','grai']), custodianOrganizationId: ownerOrganizationId, status: 'returned', condition: 'serviceable', currentShipmentId: null });
  }

  private async handoverAsset(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE);
    const asset = await this.required(tx, 'returnable_assets', text(i, 'assetId')); this.site(ctx, String(asset.facilityId)); this.stockOwner(ctx, String(asset.ownerOrganizationId));
    const status = choice(i, 'status', ['issued','in_transit','at_customer','return_due','returned','under_repair','lost','retired']);
    if (['lost','retired'].includes(status)) this.role(ctx, ['owner']);
    const operationId = `asset:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    const transitions: Record<string,string[]> = { returned: ['issued','under_repair','retired'], issued: ['in_transit','returned','lost'], in_transit: ['at_customer','returned','lost'], at_customer: ['return_due','in_transit','returned','lost'], return_due: ['in_transit','returned','lost'], under_repair: ['returned','retired'], lost: ['returned','retired'], retired: [] };
    if (!transitions[String(asset.status)]?.includes(status)) fail(409, 'ASSET_TRANSITION', 'Invalid asset custody transition');
    if (['lost','retired'].includes(status)) this.role(ctx, ['owner']);
    const custodianOrganizationId = text(i, 'custodianOrganizationId'), facilityId = text(i, 'facilityId'); await this.required(tx, 'organizations', custodianOrganizationId); await this.required(tx, 'facilities', facilityId); this.site(ctx, facilityId);
    const shipmentId = text(i, 'shipmentId', true) || null; if (shipmentId) await this.required(tx, 'consignments', shipmentId);
    const handover = await this.append(tx, ctx, 'asset_handovers', { assetId: asset.id, facilityId, ownerOrganizationId: asset.ownerOrganizationId, priorStatus: asset.status, priorCustodianOrganizationId: asset.custodianOrganizationId, custodianOrganizationId, status, shipmentId, dueAt: date(i, 'dueAt', true) || null, condition: text(i, 'condition'), evidenceReference: text(i, 'evidenceReference'), reason: text(i, 'reason') });
    Object.assign(asset, { status, facilityId, custodianOrganizationId, currentShipmentId: status === 'returned' ? null : shipmentId, condition: i.condition, dueAt: handover.dueAt, updatedAt: this.time() }); await tx.put('returnable_assets', asset);
    return this.completed(tx, operationId, i, { asset, handover });
  }
  private async emissionFactor(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,['owner','sustainability']);return this.create(tx,ctx,'emission_factors',{name:text(i,'name'),source:text(i,'source'),version:text(i,'version'),unit:text(i,'unit'),kgCO2ePerUnit:formatted(decimal(i.kgCO2ePerUnit)),boundary:text(i,'boundary')});}
  private async emissions(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,['owner','sustainability']);const factor=await this.required(tx,'emission_factors',text(i,'factorId'));const activity=decimal(i.activity),distance=decimal(i.distanceKm),tonnes=decimal(i.tonnes);const total=activity*decimal(factor.kgCO2ePerUnit)/1000000n;return this.append(tx,ctx,'emissions_runs',{factorSnapshot:factor,activity:formatted(activity),distanceKm:formatted(distance),tonnes:formatted(tonnes),kgCO2e:formatted(total),kgPerTonneKm:distance&&tonnes?formatted(total*1000000000000n/(distance*tonnes)):null,quality:choice(i,'quality',['measured','modelled','default']),source:text(i,'source'),method:text(i,'method'),boundary:text(i,'boundary'),status:'pending_review',certified:false});}
  private async reviewEmissions(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,['owner','sustainability']);await this.required(tx,'emissions_runs',text(i,'runId'));return this.create(tx,ctx,'emissions_reviews',{runId:i.runId,outcome:choice(i,'outcome',['approved','rejected']),reference:text(i,'reference'),reason:text(i,'reason')});}
  private async rateCard(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,FINANCE);return this.create(tx,ctx,'rate_cards',{payerId:text(i,'payerId'),ratePerKm:formatted(decimal(i.ratePerKm)),fixedCharge:formatted(decimal(i.fixedCharge)),version:text(i,'version'),source:text(i,'source')});}
  private async freightAudit(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,FINANCE);const rate=await this.required(tx,'rate_cards',text(i,'rateCardId')),invoice=await this.required(tx,'invoices',text(i,'invoiceId'));if(rate.payerId!==invoice.payerId)fail(400,'PAYER_MISMATCH','Rate card does not match invoice payer');const expected=decimal(rate.fixedCharge)+decimal(rate.ratePerKm)*decimal(i.distanceKm)/1000000n;return this.create(tx,ctx,'freight_audits',{invoiceId:invoice.id,rateSnapshot:rate,distanceKm:i.distanceKm,expected:formatted(expected),actual:invoice.amount,difference:formatted(decimal(invoice.amount)-expected),status:'pending_review',source:text(i,'source')});}
  private async approvePayment(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,FINANCE);const audit=await this.required(tx,'freight_audits',text(i,'auditId'));if(audit.createdBy===ctx.userId)fail(403,'MAKER_CHECKER','A different finance reviewer must approve');if(audit.status==='approved')return audit;audit.status='approved';audit.approvedBy=ctx.userId;audit.reference=text(i,'reference');await tx.put('freight_audits',audit);await tx.audit('payment_export.approved',audit.id,{bankPaymentInitiated:false});return audit;}
  private async commissioning(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,P2);return this.create(tx,ctx,'commissioning',{deviceId:text(i,'deviceId'),signedChecklist:text(i,'signedChecklist'),capabilityTest:text(i,'capabilityTest'),supportOwner:text(i,'supportOwner'),outcome:choice(i,'outcome',['passed','failed']),reference:text(i,'reference')});}
  private async investment(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,FINANCE);const cost=decimal(i.initialCost),benefit=decimal(i.monthlyBenefit),operating=decimal(i.monthlyOperatingCost),net=benefit-operating;return this.create(tx,ctx,'investments',{name:text(i,'name'),initialCost:formatted(cost),monthlyBenefit:formatted(benefit),monthlyOperatingCost:formatted(operating),netMonthlyBenefit:formatted(net),paybackMonths:net>0?Number(cost)/Number(net):null,meetsTarget:net>0&&cost<=net*24n,baselineEvidence:text(i,'baselineEvidence'),status:'pending_review'});}
  private async approveInvestment(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,['owner']);const value=await this.required(tx,'investments',text(i,'investmentId'));if(!value.meetsTarget)value.exceptionReason=text(i,'exceptionReason');value.status='approved';value.approvedBy=ctx.userId;value.reference=text(i,'reference');await tx.put('investments',value);await tx.audit('investment.approved',value.id,{});return value;}
  private async planMission(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,WAREHOUSE);const facilityId=text(i,'facilityId');this.site(ctx,facilityId);await this.required(tx,'facilities',facilityId);return this.create(tx,ctx,'automation_missions',{facilityId,ownerOrganizationId:ctx.organizationId||text(i,'ownerOrganizationId',true)||null,vendor:text(i,'vendor'),missionType:choice(i,'missionType',['move','count']),route:text(i,'route'),safetyApproval:text(i,'safetyApproval'),status:'planned',dispatchedToHardware:false});}
  private async missionOutcome(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,WAREHOUSE);const value=await this.required(tx,'automation_missions',text(i,'missionId'));this.site(ctx,String(value.facilityId));this.stockOwner(ctx,String(value.ownerOrganizationId));if(['completed','failed','cancelled'].includes(String(value.status)))fail(409,'TERMINAL_MISSION','Mission is already terminal');const status=choice(i,'status',['accepted','running','completed','failed','cancelled']);const transitions:Record<string,string[]>={planned:['accepted','cancelled'],accepted:['running','failed','cancelled'],running:['completed','failed','cancelled']};if(!transitions[String(value.status)]?.includes(status))fail(409,'REGRESSION','Mission outcome is out of sequence');value.status=status;value.vendorReference=text(i,'vendorReference');await tx.put('automation_missions',value);await tx.audit('mission.outcome',value.id,{status});return value;}
  private async stockObservation(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,WAREHOUSE);const facilityId=text(i,'facilityId');this.site(ctx,facilityId);await this.required(tx,'facilities',facilityId);return this.create(tx,ctx,'stock_observations',{facilityId,ownerOrganizationId:ctx.organizationId||text(i,'ownerOrganizationId',true)||null,sku:text(i,'sku'),estimatedQuantity:formatted(decimal(i.estimatedQuantity)),method:choice(i,'method',['weight','vision','drone']),confidence:number(i,'confidence',0,1),source:text(i,'source'),status:'requires_physical_review',stockAdjusted:false});}
  private async maintenance(tx:Transaction,ctx:Context,i:Record<string,unknown>){this.role(ctx,P2);return this.create(tx,ctx,'maintenance',{vehicleId:text(i,'vehicleId'),serviceType:text(i,'serviceType'),dueAt:date(i,'dueAt'),source:text(i,'source'),status:'due',predictive:false});}
  private async closeAssignment(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2); const a = await this.required(tx, 'device_assignments', text(i, 'assignmentId'));
    const validTo = date(i, 'validTo'); if (validTo <= String(a.validFrom) || validTo > this.time()) fail(400, 'INVALID_INTERVAL', 'Assignment close must follow start and cannot be future dated');
    if (a.validTo) fail(409, 'ASSIGNMENT_CLOSED', 'Assignment already closed');
    const observations = (await tx.list<RecordEntity>('observations')).filter(o => o.assignmentId === a.id);
    if (observations.some(o => String(o.occurredAt) >= validTo)) fail(409, 'HISTORICAL_ASSIGNMENT', 'Closing would invalidate retained observations; use a reviewed correction');
    a.validTo = validTo; a.closedBy = ctx.userId; a.reason = text(i, 'reason'); await tx.put('device_assignments', a); await tx.audit('device.assignment.closed', a.id, { validTo }); return a;
  }

  private async cancelReservation(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const r = await this.required(tx, 'reservations', text(i, 'reservationId'));
    const stock = await this.required(tx, 'stock', String(r.stockId)); await this.stockAuthority(tx, ctx, String(stock.facilityId), String(stock.ownerOrganizationId));
    if (r.status !== 'reserved') fail(409, 'RESERVATION_NOT_OPEN', 'Only an unconsumed reservation may be cancelled');
    if (decimal(stock.reserved) < decimal(r.quantity)) fail(409, 'STOCK_CONFLICT', 'Reserved balance is inconsistent');
    stock.reserved = formatted(decimal(stock.reserved) - decimal(r.quantity)); stock.updatedAt = this.time();
    r.status = 'cancelled'; r.cancelledAt = this.time(); r.reason = text(i, 'reason'); await tx.put('stock', stock); await tx.put('reservations', r); await tx.audit('reservation.cancelled', r.id, { reason: r.reason }); return r;
  }

  private async registerHandlingUnit(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const facilityId = text(i, 'facilityId'), ownerOrganizationId = text(i, 'ownerOrganizationId');
    this.site(ctx, facilityId); this.stockOwner(ctx, ownerOrganizationId); await this.required(tx, 'facilities', facilityId); await this.required(tx, 'organizations', ownerOrganizationId);
    const identifier = text(i, 'identifier'), consignmentId = text(i, 'consignmentId'), standard = choice(i, 'identifierStandard', ['internal','sscc']);
    if (standard === 'sscc') {
      if (!/^\d{18}$/.test(identifier)) fail(400, 'SSCC_FORMAT', 'SSCC must be exactly 18 digits');
      const sum = [...identifier.slice(0, 17)].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
      if ((10 - sum % 10) % 10 !== Number(identifier[17])) fail(400, 'SSCC_CHECK_DIGIT', 'SSCC check digit is invalid');
      text(i, 'gs1AllocationReference');
    }
    if ((await tx.list<RecordEntity>('handling_units')).some(u => u.identifier === identifier)) fail(409, 'HANDLING_ID_EXISTS', 'Handling unit identifier already exists');
    const shipment = await this.required(tx, 'consignments', consignmentId);
    if (shipment.consignorId !== ownerOrganizationId && shipment.stockOwnerOrganizationId !== ownerOrganizationId) fail(403, 'STOCK_OWNER_MISMATCH', 'Handling unit owner must match shipment goods owner');
    const raw = i.contents; if (!Array.isArray(raw) || raw.length > 500) fail(400, 'CONTENTS_REQUIRED', 'contents must be a bounded array of line allocations');
    const contents = raw.map(v => { const entry = object(v); return { lineId: text(entry, 'lineId'), quantity: formatted(decimal(entry.quantity)) }; });
    if (new Set(contents.map(c => c.lineId)).size !== contents.length) fail(400, 'DUPLICATE_LINE', 'Each line may occur once within a handling unit');
    const units = (await tx.list<RecordEntity>('handling_units')).filter(u => u.consignmentId === consignmentId && u.status !== 'retired');
    for (const c of contents) {
      const line = (shipment.lines as Record<string, unknown>[] | undefined)?.find(l => l.id === c.lineId);
      if (!line || decimal(c.quantity) <= 0n) fail(400, 'LINE_ALLOCATION', 'Allocate positive quantities from the shipment lines');
      const prior = units.flatMap(u => Array.isArray(u.contents) ? u.contents as Record<string, unknown>[] : []).filter(l => l.lineId === c.lineId).reduce((sum, l) => sum + decimal(l.quantity), 0n);
      if (prior + decimal(c.quantity) > decimal(line.quantity)) fail(409, 'HANDLING_OVERALLOCATION', 'Handling unit allocations exceed shipment quantity');
    }
    const unit = await this.create(tx, ctx, 'handling_units', { identifier, identifierStandard: standard, gs1AllocationReference: text(i, 'gs1AllocationReference', true) || null, ownerOrganizationId, facilityId, consignmentId, unitType: choice(i, 'unitType', ['pallet','box','parcel']), contents, childIds: [], parentId: null, status: 'at_facility', revision: 1 });
    await this.append(tx, ctx, 'handling_unit_events', { unitId: unit.id, facilityId, ownerOrganizationId, event: 'registered', snapshot: unit, receiptConfirmed: false }); return unit;
  }

  private async aggregateHandlingUnits(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const parent = await this.required(tx, 'handling_units', text(i, 'parentId'));
    this.site(ctx, String(parent.facilityId)); this.stockOwner(ctx, String(parent.ownerOrganizationId));
    if (parent.status !== 'at_facility' || parent.parentId || parent.unitType !== 'pallet' || (parent.contents as unknown[]).length) fail(409, 'AGGREGATION_STATE', 'Use an uncontained stationary pallet with no directly allocated contents');
    const ids = i.childIds; if (!Array.isArray(ids) || ids.length > 500 || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail(400, 'INVALID_CHILDREN', 'childIds must be unique handling-unit IDs');
    if (parent.revision !== number(i, 'expectedRevision', 1)) fail(409, 'STALE_AGGREGATION', 'Pallet was changed; reload before repacking');
    const oldIds = Array.isArray(parent.childIds) ? parent.childIds as string[] : [];
    for (const id of ids as string[]) {
      const child = await this.required(tx, 'handling_units', id);
      if (id === parent.id || child.unitType === 'pallet' || child.parentId && child.parentId !== parent.id || child.facilityId !== parent.facilityId || child.ownerOrganizationId !== parent.ownerOrganizationId || child.consignmentId !== parent.consignmentId || child.status !== 'at_facility') fail(409, 'CHILD_SCOPE', 'Each child must be an available uncontained box/parcel for the same owner, shipment and facility');
      child.parentId = parent.id; child.revision = Number(child.revision) + 1; await tx.put('handling_units', child);
    }
    for (const id of oldIds.filter(id => !ids.includes(id))) { const child = await this.required(tx, 'handling_units', id); child.parentId = null; child.revision = Number(child.revision) + 1; await tx.put('handling_units', child); }
    const before = [...oldIds]; parent.childIds = ids; parent.revision = Number(parent.revision) + 1; await tx.put('handling_units', parent);
    await this.append(tx, ctx, 'handling_unit_events', { unitId: parent.id, facilityId: parent.facilityId, ownerOrganizationId: parent.ownerOrganizationId, event: 'repacked', beforeChildIds: before, afterChildIds: ids, reason: text(i, 'reason'), revision: parent.revision, receiptConfirmed: false }); return parent;
  }

  private async scanHandlingUnit(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, WAREHOUSE); const unit = await this.required(tx, 'handling_units', text(i, 'unitId'));
    this.site(ctx, String(unit.facilityId)); this.stockOwner(ctx, String(unit.ownerOrganizationId));
    const operationId = `handling:${text(i, 'operationId')}`, prior = await this.operation(tx, operationId, i); if (prior) return prior.result;
    if (unit.parentId) fail(409, 'SCAN_PARENT', 'Scan the containing pallet or disaggregate it before individual custody scans');
    if (unit.revision !== number(i, 'expectedRevision', 1)) fail(409, 'STALE_HANDLING_UNIT', 'Handling unit changed before this scan');
    const event = choice(i, 'event', ['loaded','dispatched','transferred','unloaded','received']), facilityId = text(i, 'facilityId');
    const transitions: Record<string, string[]> = { at_facility: ['loaded','received'], loaded: ['dispatched','unloaded'], dispatched: ['transferred','unloaded'], transferred: ['transferred','unloaded'], unloaded: ['received','loaded'], received: ['loaded'] };
    if (!transitions[String(unit.status)]?.includes(event)) fail(409, 'CUSTODY_SEQUENCE', 'Custody scan is out of sequence');
    this.site(ctx, facilityId); await this.required(tx, 'facilities', facilityId);
    if (!['transferred','unloaded'].includes(event) && facilityId !== unit.facilityId) fail(409, 'CUSTODY_LOCATION', 'Only a transfer or unloading scan can change facility custody');
    const occurredAt = date(i, 'occurredAt');
    if (occurredAt > this.time() || unit.lastScanAt && occurredAt < String(unit.lastScanAt)) fail(409, 'SCAN_TIME', 'Late or future custody scans require review');
    const childIds = Array.isArray(unit.childIds) ? unit.childIds as string[] : [];
    const affected = [unit, ...await Promise.all(childIds.map(id => this.required(tx, 'handling_units', id)))];
    for (const u of affected) { if (u.facilityId !== unit.facilityId || u.ownerOrganizationId !== unit.ownerOrganizationId) fail(409, 'CUSTODY_CONFLICT', 'Aggregated unit custody does not reconcile'); }
    const snapshots = affected.map(u => ({ id: u.id, identifier: u.identifier, contents: u.contents, parentId: u.parentId, revision: u.revision }));
    for (const u of affected) { u.status = event; u.facilityId = facilityId; u.lastScanAt = occurredAt; u.revision = Number(u.revision) + 1; await tx.put('handling_units', u); }
    const record = await this.append(tx, ctx, 'handling_unit_events', { unitId: unit.id, facilityId, ownerOrganizationId: unit.ownerOrganizationId, event, occurredAt, sourceReference: text(i, 'sourceReference'), affectedUnits: snapshots, operationId, receiptConfirmed: false });
    return this.completed(tx, operationId, i, record);
  }

  private async calculateEta(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2); const trip = await this.required(tx, 'trips', text(i, 'tripId'));
    const position = await tx.get<RecordEntity>('positions', text(i, 'vehicleId'));
    if (trip.vehicleNumber !== i.vehicleId && trip.vehicleId !== i.vehicleId) fail(400, 'VEHICLE_TRIP_MISMATCH', 'ETA vehicle does not match the selected trip');
    const ageSeconds = position ? Math.max(0, (this.now().getTime() - Date.parse(String(position.occurredAt))) / 1000) : null;
    const fresh = ageSeconds !== null && ageSeconds <= number(i, 'maximumSignalAgeSeconds', 30, 3600);
    const remainingKm = number(i, 'remainingKm', 0, 10000), assumedSpeedKmh = number(i, 'assumedSpeedKmh', 1, 100), serviceMinutes = number(i, 'serviceMinutes', 0, 1440), uncertaintyMinutes = number(i, 'uncertaintyMinutes', 1, 1440);
    const estimate = fresh ? new Date(this.now().getTime() + (remainingKm / assumedSpeedKmh * 60 + serviceMinutes) * 60000).toISOString() : null;
    return this.append(tx, ctx, 'eta_estimates', { tripId: trip.id, vehicleId: i.vehicleId, positionId: position?.observationId || null, observationTime: position?.occurredAt || null, signalAgeSeconds: ageSeconds, method: 'operator_distance_and_speed_rule_v1', inputs: { remainingKm, assumedSpeedKmh, serviceMinutes, uncertaintyMinutes }, inputSource: text(i, 'inputSource'), estimate, earliest: estimate ? new Date(Date.parse(estimate) - uncertaintyMinutes * 60000).toISOString() : null, latest: estimate ? new Date(Date.parse(estimate) + uncertaintyMinutes * 60000).toISOString() : null, status: fresh ? 'estimated' : 'unknown_stale_or_missing_signal', trafficModelUsed: false, receiptConfirmed: false });
  }

  private async completeMaintenance(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2); const record = await this.required(tx, 'maintenance', text(i, 'maintenanceId'));
    if (record.status !== 'due') fail(409, 'MAINTENANCE_CLOSED', 'Maintenance reminder was already completed');
    const completedAt = date(i, 'completedAt'); if (completedAt > this.time()) fail(400, 'FUTURE_COMPLETION', 'Service completion cannot be future dated');
    const event = await this.append(tx, ctx, 'maintenance_events', { maintenanceId: record.id, vehicleId: record.vehicleId, completedAt, serviceReference: text(i, 'serviceReference'), notes: text(i, 'notes'), certifiesRoadworthiness: false });
    record.status = 'completed'; record.completionEventId = event.id; await tx.put('maintenance', record); return record;
  }

  private async transportPlan(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, P2); const vehicleId = text(i, 'vehicleId'), capacityKg = decimal(i.capacityKg), availableAt = date(i, 'availableAt'), dutyEnd = date(i, 'dutyEnd');
    if (dutyEnd <= availableAt || capacityKg <= 0n) fail(400, 'PLANNING_BOUNDS', 'Provide positive capacity and an available duty window');
    const raw = i.stops; if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100) fail(400, 'PLANNING_STOPS', 'Provide one to 100 proposed delivery stops');
    const seen = new Set<string>(), stops: Record<string, unknown>[] = [];
    for (const value of raw) {
      const stop = object(value), consignmentId = text(stop, 'consignmentId'), consignment = await this.required(tx, 'consignments', consignmentId);
      if (seen.has(consignmentId)) fail(400, 'DUPLICATE_STOP', 'A consignment can occur once in this delivery-only plan'); seen.add(consignmentId);
      if (['cancelled','delivered'].includes(String(consignment.status))) fail(409, 'SHIPMENT_NOT_OPEN', 'Plan contains completed or cancelled work');
      const windowStart = date(stop, 'windowStart'), windowEnd = date(stop, 'windowEnd'); if (windowEnd < windowStart) fail(400, 'WINDOW_INVALID', 'Delivery window must not be reversed');
      stops.push({ consignmentId, destinationId: consignment.destinationId, weightKg: formatted(decimal(stop.weightKg)), cargoClass: text(stop, 'cargoClass'), windowStart, windowEnd, serviceMinutes: number(stop, 'serviceMinutes', 0, 1440), shipmentUpdatedAt: consignment.updatedAt || null });
    }
    const classes = i.allowedCargoClasses; if (!Array.isArray(classes) || classes.length < 1 || classes.some(v => typeof v !== 'string')) fail(400, 'CARGO_CLASSES', 'List the vehicle permitted cargo classes');
    const travel = object(i.travelMinutes), source = text(i, 'travelDataSource');
    let time = Date.parse(availableAt), location = 'origin', load = 0n; const assigned: Record<string, unknown>[] = [], unserved: Record<string, unknown>[] = [];
    // Deterministic earliest-window heuristic, not a global optimum or traffic predictor.
    for (const stop of stops.sort((a, b) => String(a.windowEnd).localeCompare(String(b.windowEnd)) || String(a.consignmentId).localeCompare(String(b.consignmentId)))) {
      const weight = decimal(stop.weightKg), key = `${location}->${String(stop.consignmentId)}`, minutes = travel[key];
      let reason: string | null = null;
      if (!classes.includes(stop.cargoClass)) reason = 'cargo_not_compatible';
      else if (load + weight > capacityKg) reason = 'vehicle_capacity';
      else if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0 || minutes > 14400) reason = 'missing_travel_time';
      const arrival = Math.max(time + Number(minutes || 0) * 60000, Date.parse(String(stop.windowStart))), departure = arrival + Number(stop.serviceMinutes) * 60000;
      if (!reason && arrival > Date.parse(String(stop.windowEnd))) reason = 'delivery_window';
      if (!reason && departure > Date.parse(dutyEnd)) reason = 'driver_duty_window';
      if (reason) { unserved.push({ ...stop, reason }); continue; }
      assigned.push({ ...stop, travelMinutes: minutes, arrival: new Date(arrival).toISOString(), departure: new Date(departure).toISOString() }); time = departure; location = String(stop.consignmentId); load += weight;
    }
    return this.create(tx, ctx, 'route_plans', { vehicleId, driverId: text(i, 'driverId'), capacityKg: formatted(capacityKg), totalLoadedKg: formatted(load), availableAt, dutyEnd, allowedCargoClasses: classes, assigned, unserved, source, travelMinutes: travel, method: 'earliest_window_delivery_heuristic_v1', status: 'proposed', releaseRequired: true, globallyOptimal: false, assumptions: 'Delivery-only route with all cargo loaded at origin; operator-provided travel times; no automatic trip assignment.' });
  }

  private async releasePlan(tx: Transaction, ctx: Context, i: Record<string, unknown>) {
    this.role(ctx, ['owner','operations']); const plan = await this.required(tx, 'route_plans', text(i, 'planId'));
    if (plan.status !== 'proposed') fail(409, 'PLAN_ALREADY_RELEASED', 'Plan was already reviewed');
    const assigned = plan.assigned as Record<string, unknown>[]; if (!assigned.length) fail(409, 'NO_FEASIBLE_WORK', 'Cannot release an empty route');
    if ((plan.unserved as unknown[]).length && i.acknowledgeUnserved !== true) fail(400, 'UNSERVED_REVIEW', 'Explicitly acknowledge unserved work before release');
    for (const stop of assigned) { const c = await this.required(tx, 'consignments', String(stop.consignmentId)); if ((c.updatedAt || null) !== stop.shipmentUpdatedAt || ['cancelled','delivered'].includes(String(c.status))) fail(409, 'STALE_PLAN', 'Shipment changed after planning; generate a fresh plan'); }
    plan.status = 'released'; plan.releasedAt = this.time(); plan.releasedBy = ctx.userId; plan.reviewReference = text(i, 'reviewReference'); await tx.put('route_plans', plan); await tx.audit('transport_plan.released', plan.id, { assigned: assigned.length, unserved: (plan.unserved as unknown[]).length }); return plan;
  }
}
