import { describe, expect, it } from 'vitest';
import { MemoryDatabase, type Context, type DatabasePort, type Entity, type Transaction } from '@cargoorbit/database';
import { WorkflowService } from '@cargoorbit/domain';

const owner: Context = { tenantId: 'search', userId: 'owner', role: 'owner' };
const driver: Context = { ...owner, userId: 'driver', role: 'driver' };
const customer: Context = { ...owner, userId: 'admin', role: 'customer_admin', organizationId: 'customer', facilityIds: ['site'] };
const receiver: Context = { ...customer, userId: 'receiver', role: 'receiver' };
const finance: Context = { ...customer, userId: 'finance', role: 'customer_finance' };
const shipment = (id: string, extra: Partial<Entity> = {}): Entity => ({
  id, lrNumber: `LR-${id}`, branch: 'BLR', financialYear: '2026-27', status: 'planned',
  consignorId: 'sender', consigneeId: 'customer', payerId: 'customer', originId: 'origin', destinationId: 'site',
  invoiceReferences: [], ewayBills: [], lines: [], goodsValue: '999', freightAmount: '888',
  paymentPolicySnapshot: { secret: 'financial terms' }, ...extra,
});
async function seed(db: MemoryDatabase, kind: string, records: Entity[], ctx = owner) {
  await db.transaction(ctx, async tx => { for (const record of records) await tx.put(kind, record); });
}
function fixture() { const db = new MemoryDatabase(); return { db, service: new WorkflowService(db) }; }

describe('Scoped shipment cross-reference search', () => {
  it('finds all six reference types, including inline and linked goods/e-way documents', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('shipment', { lrNumber: 'LR-Original', invoiceReferences: ['GOODS-inline'], ewayBills: [{ number: '123456789012' }] })]);
    await seed(db, 'trips', [{ id: 'trip', vehicleNumber: 'KA-01-AB-1234', driverId: 'driver' }]);
    await seed(db, 'attempts', [{ id: 'attempt', consignmentId: 'shipment', tripId: 'trip', assignedDriverId: 'driver', facilityId: 'site', status: 'planned' }]);
    await seed(db, 'goods_documents', [{ id: 'goods', kind: 'goods_invoice', number: 'GOODS-linked', amount: '777' }, { id: 'eway', kind: 'eway_bill', number: '987654321012' }]);
    await seed(db, 'goods_document_links', [{ id: 'link-goods', documentId: 'goods', consignmentId: 'shipment' }, { id: 'link-eway', documentId: 'eway', consignmentId: 'shipment' }]);
    await seed(db, 'invoices', [{ id: 'invoice', number: 'FREIGHT-42', payerId: 'customer', consignmentIds: ['shipment'], amount: '666' }]);
    for (const [type, q] of [['shipment', 'shipment'], ['lr', 'lr-original'], ['vehicle', 'ka-01-ab-1234'], ['goods_invoice', 'goods-inline'], ['goods_invoice', 'goods-linked'], ['eway_bill', '123456789012'], ['eway_bill', '987654321012'], ['freight_invoice', 'freight-42']] as const) {
      const result = await service.search(owner, { q, type, match: 'exact' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.id).toBe('shipment');
      expect(result.items[0]!.matches).toEqual([{ type, value: expect.any(String) }]);
      expect(result).not.toHaveProperty('total');
      expect(Object.keys(result.items[0]!).sort()).toEqual(['branch', 'destinationId', 'financialYear', 'id', 'lrNumber', 'matches', 'originId', 'status']);
      expect(JSON.stringify(result)).not.toMatch(/financial terms|999|888|777|666/);
    }
    expect((await service.search(owner, { q: ' goods-l ', type: 'goods_invoice' })).items.map(row => row.id)).toEqual(['shipment']);
  });

  it('treats SQL wildcard and quote characters literally and rejects unbounded or malformed queries', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('literal', { lrNumber: 'AB_%literal' }), shipment('other', { lrNumber: 'AB-ordinary' })]);
    expect((await service.search(owner, { q: 'ab_%', type: 'lr' })).items.map(row => row.id)).toEqual(['literal']);
    expect((await service.search(owner, { q: "' OR 1=1 --", type: 'all' })).items).toEqual([]);
    const searches = await db.transaction(owner, async tx => (await tx.list('audit')).filter(event => event.action === 'shipment.search'));
    expect(searches).toHaveLength(2);
    expect(searches[1]!.details).toEqual({ queryHash: expect.stringMatching(/^[a-f0-9]{64}$/), type: 'all', match: 'prefix', count: 0 });
    expect(JSON.stringify(searches)).not.toContain("' OR 1=1 --");
    for (const query of [{ q: '' }, { q: 'x' }, { q: 'x'.repeat(101) }, { q: 'LR', limit: 101 }, { q: 'LR', limit: 0 }, { q: 'LR', limit: 'NaN' }, { q: ['LR'] }, { q: 'LR', offset: 1 }, { q: 'LR\nsecret' }]) {
      await expect(service.search(owner, query)).rejects.toMatchObject({ code: 'SEARCH_VALIDATION' });
    }
  });

  it('pages more than 500 matches without duplicates or any domain-wide list reads', async () => {
    const { db } = fixture();
    await seed(db, 'consignments', Array.from({ length: 601 }, (_, n) => shipment(`shipment-${String(n).padStart(4, '0')}`)));
    const guarded: DatabasePort = { transaction: (ctx, callback) => db.transaction(ctx, tx => callback(new Proxy(tx, { get(target, key) { if (key === 'list' || key === 'find') return () => { throw new Error('Search must not materialize tenant lists'); }; return Reflect.get(target, key); } }) as Transaction)) };
    const service = new WorkflowService(guarded), ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.search(owner, { q: 'LR-', type: 'lr', limit: 100, cursor });
      expect(page.items.length).toBeLessThanOrEqual(100);
      ids.push(...page.items.map(row => row.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(601);
    expect(new Set(ids).size).toBe(601);
    expect(ids[0]).toBe('shipment-0000'); expect(ids.at(-1)).toBe('shipment-0600');
  });

  it('binds cursors to query and current tenant, user, membership and authorization scope', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('a'), shipment('b'), shipment('c')]);
    const ctx = { ...owner, membershipId: 'member', facilityIds: ['site-b', 'site-a'] };
    const query = { q: 'LR-', type: 'lr', match: 'prefix', limit: 1 };
    const first = await service.search(ctx, query); expect(first.nextCursor).toBeTruthy();
    const next = { ...query, cursor: first.nextCursor };
    expect((await service.search({ ...ctx, facilityIds: ['site-a', 'site-b'] }, next)).items[0]!.id).toBe('b');
    expect((await service.search(ctx, { ...next, limit: 2 })).items.map(row => row.id)).toEqual(['b', 'c']);
    for (const patch of [{ q: 'LR-a' }, { type: 'shipment' }, { match: 'exact' }, { cursor: 'invalid' }]) await expect(service.search(ctx, { ...next, ...patch })).rejects.toThrow();
    for (const patch of [{ tenantId: 'other' }, { userId: 'other' }, { membershipId: 'other' }, { role: 'finance' as const }, { organizationId: 'other' }, { facilityIds: ['site-a'] }, { assignedDriverId: 'other' }]) await expect(service.search({ ...ctx, ...patch }, next)).rejects.toThrow();
  });

  it('applies organization, site and driver authorization before limiting a shared-reference search', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', Array.from({ length: 601 }, (_, n) => shipment(`shipment-${String(n).padStart(4, '0')}`, { consigneeId: n === 600 ? 'customer' : 'other', payerId: n === 600 ? 'customer' : 'other' })));
    await seed(db, 'goods_documents', [{ id: 'shared', kind: 'goods_invoice', number: 'GOODS-shared' }]);
    await seed(db, 'goods_document_links', Array.from({ length: 601 }, (_, n) => ({ id: `link-${n}`, documentId: 'shared', consignmentId: `shipment-${String(n).padStart(4, '0')}` })));
    await seed(db, 'attempts', Array.from({ length: 601 }, (_, n) => ({ id: `attempt-${n}`, consignmentId: `shipment-${String(n).padStart(4, '0')}`, facilityId: n === 600 ? 'site' : 'other-site', assignedDriverId: n === 600 ? 'driver' : 'other-driver', status: 'planned' })));
    const query = { q: 'GOODS-shared', type: 'goods_invoice', match: 'exact', limit: 1 };
    for (const ctx of [customer, receiver, finance, driver]) {
      const result = await service.search(ctx, query);
      expect(result).toEqual({ items: [expect.objectContaining({ id: 'shipment-0600' })] });
    }
    await seed(db, 'consignments', [shipment('other-tenant', { invoiceReferences: ['GOODS-shared'] })], { ...owner, tenantId: 'other' });
    expect((await service.search({ ...owner, tenantId: 'other' }, query)).items.map(row => row.id)).toEqual(['other-tenant']);
    expect((await service.search({ ...customer, facilityIds: ['unrelated-site'] }, query)).items).toEqual([]);
  });

  it('only matches vehicle references from the current driver or site attempts, including reassignment', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('shared', { destinationId: 'other-site' }), shipment('cancelled', { assignedDriverId: 'driver' }), shipment('legacy', { assignedDriverId: 'driver' })]);
    await seed(db, 'trips', [{ id: 'visible-trip', vehicleNumber: 'KA-VISIBLE', driverId: 'driver' }, { id: 'hidden-trip', vehicleNumber: 'KA-HIDDEN', driverId: 'other-driver' }]);
    await seed(db, 'attempts', [
      { id: 'visible', consignmentId: 'shared', facilityId: 'site', assignedDriverId: 'driver', tripId: 'visible-trip', status: 'planned' },
      { id: 'hidden', consignmentId: 'shared', facilityId: 'other-site', assignedDriverId: 'other-driver', tripId: 'hidden-trip', status: 'planned' },
      { id: 'cancelled-attempt', consignmentId: 'cancelled', facilityId: 'site', assignedDriverId: 'driver', tripId: 'visible-trip', status: 'cancelled' },
    ]);
    for (const ctx of [driver, customer, receiver]) {
      expect((await service.search(ctx, { q: 'KA-HIDDEN', type: 'vehicle' })).items).toEqual([]);
      expect((await service.search(ctx, { q: 'KA-HIDDEN', type: 'all' })).items).toEqual([]);
      expect((await service.search(ctx, { q: 'KA-VISIBLE', type: 'vehicle' })).items.map(row => row.id)).toContain('shared');
    }
    expect((await service.search(driver, { q: 'LR-cancelled' })).items).toEqual([]);
    await seed(db, 'attempts', [{ id: 'cancelled-attempt', consignmentId: 'cancelled', facilityId: 'site', assignedDriverId: 'driver', tripId: 'visible-trip', status: 'transferred' }]);
    expect((await service.search(driver, { q: 'LR-cancelled' })).items).toEqual([]);
    expect((await service.search(driver, { q: 'LR-legacy' })).items.map(row => row.id)).toEqual(['legacy']);
    await seed(db, 'attempts', [{ id: 'visible', consignmentId: 'shared', facilityId: 'site', assignedDriverId: 'driver', tripId: 'visible-trip', status: 'accepted' }]);
    await seed(db, 'trips', [{ id: 'visible-trip', vehicleNumber: 'KA-REASSIGNED', driverId: 'new-driver' }]);
    expect((await service.search(driver, { q: 'LR-shared' })).items.map(row => row.id)).toEqual(['shared']);
    for (const type of ['vehicle', 'all']) expect((await service.search(driver, { q: 'KA-REASSIGNED', type })).items).toEqual([]);
    await seed(db, 'attempts', [{ id: 'visible', consignmentId: 'shared', facilityId: 'site', assignedDriverId: 'new-driver', tripId: 'visible-trip', status: 'planned' }]);
    expect((await service.search(driver, { q: 'LR-shared' })).items).toEqual([]);
    expect((await service.search({ ...driver, assignedDriverId: 'new-driver' }, { q: 'LR-shared' })).items.map(row => row.id)).toEqual(['shared']);
  });

  it('never exposes freight invoice matches to drivers or receiving roles and checks invoice payer separately', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('shipment', { assignedDriverId: 'driver' })]);
    await seed(db, 'invoices', [{ id: 'own-invoice', number: 'FREIGHT-own', payerId: 'customer', consignmentIds: ['shipment'], amount: '500' }, { id: 'other-invoice', number: 'FREIGHT-hidden', payerId: 'other', consignmentIds: ['shipment'], amount: '700' }]);
    for (const ctx of [driver, receiver, customer]) {
      await expect(service.search(ctx, { q: 'FREIGHT', type: 'freight_invoice' })).rejects.toMatchObject({ code: 'SEARCH_FORBIDDEN' });
      expect((await service.search(ctx, { q: 'FREIGHT', type: 'all' })).items).toEqual([]);
    }
    expect((await service.search(finance, { q: 'FREIGHT-own', type: 'freight_invoice' })).items.map(row => row.id)).toEqual(['shipment']);
    expect((await service.search(finance, { q: 'FREIGHT-hidden', type: 'freight_invoice' })).items).toEqual([]);
    expect((await service.search({ ...finance, organizationId: 'other' }, { q: 'FREIGHT-hidden', type: 'freight_invoice' })).items).toEqual([]);
    for (const role of ['warehouse', 'control_room', 'sustainability', 'platform_admin'] as const) await expect(service.search({ ...owner, role }, { q: 'LR' })).rejects.toMatchObject({ code: 'SEARCH_FORBIDDEN' });
  });

  it('bounds matched references per shipment and signals omitted matches without returning documents', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('shipment', { invoiceReferences: [...Array.from({ length: 30 }, (_, n) => `GOODS-${String(n).padStart(2, '0')}`), 'GOODS', 'goods'] })]);
    const result = await service.search(owner, { q: 'GOODS', type: 'goods_invoice' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.matches).toHaveLength(20);
    expect(result.items[0]!.matches[0]!.value.toLowerCase()).toBe('goods');
    expect(new Set(result.items[0]!.matches.map(reference => reference.value.toLowerCase())).size).toBe(20);
    expect(result.items[0]!.matchesTruncated).toBe(true);
    expect(result).not.toHaveProperty('nextCursor');
  });

  it('does not reveal hidden reference counts through match truncation', async () => {
    const { db, service } = fixture();
    await seed(db, 'consignments', [shipment('shipment', { invoiceReferences: ['COMMON-goods'] })]);
    await seed(db, 'attempts', [{ id: 'visible', consignmentId: 'shipment', facilityId: 'site', assignedDriverId: 'driver', status: 'planned' }, ...Array.from({ length: 30 }, (_, n) => ({ id: `hidden-${n}`, consignmentId: 'shipment', facilityId: 'other-site', assignedDriverId: 'other-driver', tripId: `trip-${n}`, status: 'planned' }))]);
    await seed(db, 'trips', Array.from({ length: 30 }, (_, n) => ({ id: `trip-${n}`, vehicleNumber: `COMMON-vehicle-${n}`, driverId: 'other-driver' })));
    await seed(db, 'invoices', Array.from({ length: 30 }, (_, n) => ({ id: `invoice-${n}`, number: `COMMON-freight-${n}`, payerId: 'customer', consignmentIds: ['shipment'] })));
    for (const ctx of [driver, customer, receiver]) {
      const result = await service.search(ctx, { q: 'COMMON' });
      expect(result.items[0]!.matches).toEqual([{ type: 'goods_invoice', value: 'COMMON-goods' }]);
      expect(result.items[0]).not.toHaveProperty('matchesTruncated');
    }
  });
});
