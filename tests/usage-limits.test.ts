import { describe, expect, it } from 'vitest';
import { MemoryDatabase, type Context } from '@cargoorbit/database';
import { ContractUsageService, WorkflowService, contractUsageCeilingSchema } from '@cargoorbit/domain';

const owner: Context = { tenantId: 'usage-contract', userId: 'owner', role: 'owner' };
const auditor: Context = { ...owner, userId: 'auditor', role: 'auditor' };
async function fixture() {
  const db = new MemoryDatabase();
  let at = new Date('2026-10-24T10:00:00Z');
  const workflow = new WorkflowService(db, { now: () => at });
  const usage = new ContractUsageService(db, () => at);
  const execute = (action: string, input: unknown) => workflow.execute(owner, action, input);
  for (const [id, roles] of [['sender', ['consignor']], ['customer', ['consignee', 'payer']]]) await execute('createOrganization', { id, name: id, roles });
  for (const [id, organizationId] of [['origin', 'sender'], ['destination', 'customer']]) await execute('createFacility', { id, organizationId, name: id, address: 'Road', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001' });
  const shipmentInput = (id: string) => ({ id, lrNumber: id, consignorId: 'sender', consigneeId: 'customer', payerId: 'customer', originId: 'origin', destinationId: 'destination', freightAmount: '100', lines: [{ id: 'line', description: 'Goods', quantity: '1', unit: 'pcs' }] });
  const provision = (limits: Record<string, number>, validUntil = '2027-01-01T00:00:00Z') => db.transaction(owner, tx => tx.put('configuration', contractUsageCeilingSchema.parse({ limits, contractReference: 'SIGNED-CONTRACT-01', validFrom: '2026-01-01T00:00:00Z', validUntil })));
  return { db, usage, execute, shipmentInput, provision, shipment: (id: string) => execute('createConsignment', shipmentInput(id)), advance: (next: string) => { at = new Date(next); } };
}

describe('contract-specific creation quotas', () => {
  it('requires approved ceilings and owner authority without inventing tenant allowances', async () => {
    const f = await fixture();
    expect(await f.usage.status(owner)).toMatchObject({ configured: false, active: false, subscriptionBilling: 'not_configured' });
    await expect(f.usage.configure(owner, { limits: { organizations: 10 }, reason: 'New limit' })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_NOT_CONFIGURED' });
    await f.provision({ organizations: 5, facilities: 5 });
    await expect(f.usage.configure({ ...owner, role: 'operations' }, { limits: {}, reason: 'Change' })).rejects.toMatchObject({ status: 403 });
    await expect(f.usage.status({ ...owner, role: 'operations' })).rejects.toMatchObject({ status: 403 });
    await expect(f.usage.configure(owner, { limits: { organizations: 6 }, reason: 'Increase' })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_CEILING' });
    await expect(f.usage.configure(owner, { limits: { consignmentsPerMonth: 1 }, reason: 'Unapproved entitlement' })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_CEILING' });
    expect((await f.usage.status({ ...owner, tenantId: 'another-tenant' })).configured).toBe(false);
    const status = await f.usage.configure(owner, { limits: { organizations: 3 }, reason: 'Budget control' });
    expect(status.usage.find(row => row.resource === 'organizations')).toMatchObject({ used: 2, limit: 3, operatorCeiling: 5 });
    expect((await f.usage.status(auditor)).configuredBy).toBe('owner');
  });

  it('counts existing records, enforces concurrent creates atomically and records threshold warnings once', async () => {
    const f = await fixture();
    await f.shipment('legacy');
    await f.provision({ consignmentsPerMonth: 2, organizations: 2, facilities: 2 });
    const result = await Promise.allSettled([f.shipment('new-a'), f.shipment('new-b')]);
    expect(result.filter(value => value.status === 'fulfilled')).toHaveLength(1);
    expect((result.find(value => value.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'CONTRACT_USAGE_LIMIT', status: 429 });
    await expect(f.execute('createOrganization', { id: 'extra-org', name: 'Extra', roles: ['partner'] })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    await expect(f.execute('createFacility', { organizationId: 'sender', name: 'Extra', address: 'Road', city: 'Bengaluru', state: 'Karnataka', pinCode: '560001' })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    const state = await f.usage.status(owner);
    expect(state.usage.find(row => row.resource === 'consignmentsPerMonth')).toMatchObject({ used: 2, remaining: 0, warning: true });
    expect(state.warnings).toHaveLength(1);
    expect(await f.db.transaction(owner, tx => tx.list('consignments'))).toHaveLength(2);
    expect((await f.db.transaction(owner, tx => tx.list('audit'))).filter(row => row.action === 'contractUsage.warning')).toHaveLength(1);
  });

  it('rolls back an over-quota import including counters and warnings', async () => {
    const f = await fixture();
    await f.provision({ consignmentsPerMonth: 1 });
    const preview = await f.execute('importPreview', { batchId: 'batch', rows: [f.shipmentInput('first'), f.shipmentInput('second')] });
    expect(preview.validRows).toHaveLength(2);
    await expect(f.execute('importCommit', { batchId: 'batch', previewHash: preview.previewHash })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    expect(await f.db.transaction(owner, tx => tx.list('consignments'))).toHaveLength(0);
    expect(await f.db.transaction(owner, tx => tx.list('usage_counters'))).toHaveLength(0);
    expect(await f.db.transaction(owner, tx => tx.list('usage_warnings'))).toHaveLength(0);
    await f.shipment('after-rollback');
    expect((await f.usage.status(owner)).usage.find(row => row.resource === 'consignmentsPerMonth')?.used).toBe(1);
  });

  it('resets monthly allowance in UTC without resetting lifetime master quotas or counting duplicate replays', async () => {
    const f = await fixture();
    await f.provision({ consignmentsPerMonth: 1, organizations: 3 });
    await f.shipment('october');
    await expect(f.shipment('october')).rejects.toMatchObject({ code: 'DUPLICATE_LR' });
    f.advance('2026-11-01T00:00:00Z');
    await f.shipment('november');
    await f.execute('createOrganization', { id: 'third', name: 'Third', roles: ['partner'] });
    f.advance('2026-12-01T00:00:00Z');
    await expect(f.execute('createOrganization', { id: 'fourth', name: 'Fourth', roles: ['partner'] })).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    const counters = await f.db.transaction(owner, tx => tx.list('usage_counters'));
    expect(counters.find(row => row.id === 'consignmentsPerMonth:2026-10')?.used).toBe(1);
    expect(counters.find(row => row.id === 'consignmentsPerMonth:2026-11')?.used).toBe(1);
  });

  it('allows receipt drafts and original evidence after limits are reduced below existing usage or expire', async () => {
    const f = await fixture();
    await f.shipment('existing');
    await f.provision({ consignmentsPerMonth: 10 });
    const state = await f.usage.configure(owner, { limits: { consignmentsPerMonth: 0 }, reason: 'Pause new consignments' });
    expect(state.usage.find(row => row.resource === 'consignmentsPerMonth')).toMatchObject({ used: 1, limit: 0, remaining: 0 });
    await expect(f.shipment('blocked')).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    f.advance('2027-01-01T00:00:00Z');
    await expect(f.shipment('expired')).rejects.toMatchObject({ code: 'CONTRACT_USAGE_APPROVAL_EXPIRED' });
    const draft = await f.execute('saveDraft', { consignmentId: 'existing', expectedVersion: 0, clientEventId: 'draft', lines: [{ lineId: 'line', accepted: '1', damaged: '0', rejected: '0', short: '0' }] });
    expect(draft.status).toBe('draft');
    const evidence = await f.execute('recordEvidence', { consignmentId: 'existing', filename: 'proof.pdf', mimeType: 'application/pdf', size: 10, sha256: 'a'.repeat(64), objectKey: 'proof/original', objectVersion: 'v1', captureMethod: 'upload', documentType: 'other' });
    expect(evidence.consignmentId).toBe('existing');
  });

  it('cannot elevate a lowered operator entitlement by retaining an older owner preference', async () => {
    const f = await fixture();
    await f.provision({ consignmentsPerMonth: 5 });
    await f.usage.configure(owner, { limits: { consignmentsPerMonth: 4 }, reason: 'Selected budget' });
    await f.provision({ consignmentsPerMonth: 1 });
    await f.shipment('first');
    await expect(f.shipment('second')).rejects.toMatchObject({ code: 'CONTRACT_USAGE_LIMIT' });
    expect((await f.usage.status(owner)).usage.find(row => row.resource === 'consignmentsPerMonth')?.limit).toBe(1);
    await f.db.transaction(owner, tx => tx.put('configuration', { id: 'contract_usage_ceiling', limits: { consignmentsPerMonth: 'unlimited' } }));
    await expect(f.shipment('malformed')).rejects.toMatchObject({ code: 'CONTRACT_USAGE_CONFIGURATION' });
  });
});
