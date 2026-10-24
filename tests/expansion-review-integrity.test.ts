import { describe, expect, it } from 'vitest';
import { MemoryDatabase, type Context } from '@cargoorbit/database';
import { ExpansionService } from '../apps/api/src/expansion/service';

const owner: Context = { tenantId: 'review-integrity', userId: 'maker', role: 'owner' };
const reviewer: Context = { ...owner, userId: 'reviewer' };
const now = '2026-10-24T10:00:00.000Z';
async function setup() {
  const db = new MemoryDatabase();
  const service = new ExpansionService(db, { now: () => new Date(now) });
  await db.transaction(owner, async tx => {
    await tx.put('configuration', { id: 'features', enabled: ['P2', 'P3', 'P4'] });
    await tx.put('trips', { id: 'trip', vehicleNumber: 'truck' });
    await tx.put('facilities', { id: 'site' });
  });
  return { db, run: (action: string, input: unknown, ctx = owner) => service.execute(ctx, action, input) as Promise<any> };
}

describe('expansion review source integrity', () => {
  it('rejects cost review after an in-period fuel or toll record arrives, and permits a regenerated review', async () => {
    const f = await setup();
    const period = { tripId: 'trip', from: '2026-10-24T08:00:00.000Z', to: now };
    const original = await f.run('reconcileTripCosts', period);
    await f.run('recordFuelEntry', { tripId: 'trip', kind: 'purchase_receipt', occurredAt: '2026-10-24T09:00:00Z', litres: '10', amount: '1000', sourceReference: 'late-bill', provider: 'accounting' });
    const review = { outcome: 'confirmed_exception', reference: 'review', reason: 'Accounting evidence checked' };
    await expect(f.run('reviewTripCosts', { ...review, reconciliationId: original.id }, reviewer)).rejects.toMatchObject({ code: 'STALE_RECONCILIATION' });
    const regenerated = await f.run('reconcileTripCosts', period);
    expect(regenerated.fuelExpenditure).toBe('1000.000000');
    await f.run('recordTollEvent', { tripId: 'trip', occurredAt: '2026-10-24T09:30:00Z', sourceType: 'accounting_receipt', provider: 'accounting', providerEventId: 'late-toll', plazaId: 'plaza', amount: '100', sourceReference: 'late-toll-receipt' });
    await expect(f.run('reviewTripCosts', { ...review, reconciliationId: regenerated.id }, reviewer)).rejects.toMatchObject({ code: 'STALE_RECONCILIATION' });
    const final = await f.run('reconcileTripCosts', period);
    expect((await f.run('reviewTripCosts', { ...review, reconciliationId: final.id }, reviewer)).status).toBe('confirmed_exception');
  });

  it('rechecks the layout data source at independent slotting approval', async () => {
    const f = await setup();
    const capability = { module: 'slotting', enabled: true, approvedSources: ['survey'], facilityIds: ['site'], scopeReference: 'scope', dataAssessmentReference: 'assessment', validationReference: 'validation', businessCaseReference: 'case', validUntil: '2027-01-01T00:00:00Z' };
    await f.run('configureAdvancedCapability', capability);
    const layout = await f.run('recordLayoutVersion', { facilityId: 'site', source: 'survey', sourceReference: 'survey-1', layoutReference: 'layout-1', bins: [{ id: 'A', capacityKg: '10', distanceFromDockM: 5, allowedCargoClasses: ['dry'] }] });
    const proposal = await f.run('proposeSlotting', { layoutId: layout.id, sourceReference: 'moves', items: [{ sku: 'item', weightKg: '1', moves: 5, cargoClass: 'dry' }] });
    await f.run('configureAdvancedCapability', { ...capability, approvedSources: ['replacement-survey'] });
    await expect(f.run('approveSlotting', { proposalId: proposal.id, reviewReference: 'independent review' }, reviewer)).rejects.toMatchObject({ code: 'SOURCE_NOT_APPROVED' });
    await f.run('configureAdvancedCapability', capability);
    expect((await f.run('approveSlotting', { proposalId: proposal.id, reviewReference: 'review after source approval' }, reviewer)).status).toBe('approved');
  });
});
