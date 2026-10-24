import { describe, expect, it } from 'vitest';
import { MemoryDatabase } from '../src/memory.js';
import type { Context, Entity, OutboxEvent } from '../src/types.js';

const a: Context = { tenantId: 'tenant-a', userId: 'operator-a', role: 'operations' };
const b: Context = { tenantId: 'tenant-b', userId: 'operator-b', role: 'operations' };

describe('MemoryDatabase transaction contract', () => {
  it('does not disclose matching identifiers from another tenant', async () => {
    const db = new MemoryDatabase();
    await db.transaction(a, async tx => tx.put('consignments', { id: 'same-id', reference: 'A' }));
    await db.transaction(b, async tx => {
      expect(await tx.get('consignments', 'same-id')).toBeUndefined();
      expect(await tx.list('consignments')).toEqual([]);
      await tx.put('consignments', { id: 'same-id', reference: 'B' });
    });
    expect(await db.transaction(a, tx => tx.get('consignments', 'same-id'))).toMatchObject({ reference: 'A' });
  });

  it('rolls back business, audit and outbox together', async () => {
    const db = new MemoryDatabase();
    await expect(db.transaction(a, async tx => {
      await tx.put('pods', { id: 'pod-1', accepted: true });
      await tx.audit('pod.accepted', 'pod-1');
      await tx.emit('pod.accepted', 'pod-1', { podId: 'pod-1' });
      throw new Error('transaction failed');
    })).rejects.toThrow('transaction failed');
    await db.transaction(a, async tx => {
      expect(await tx.list('pods')).toEqual([]);
      expect(await tx.list('audit')).toEqual([]);
      expect(await tx.list('outbox')).toEqual([]);
    });
  });

  it('serializes competing read-modify-write transactions', async () => {
    const db = new MemoryDatabase();
    await db.transaction(a, tx => tx.put('counters', { id: 'one', count: 0 }));
    await Promise.all(Array.from({ length: 12 }, () => db.transaction(a, async tx => {
      const counter = await tx.get<Entity>('counters', 'one');
      await tx.put('counters', { id: 'one', count: Number(counter!.count) + 1 });
    })));
    expect(await db.transaction(a, tx => tx.get('counters', 'one'))).toMatchObject({ count: 12 });
  });

  it('cannot rewrite audit or outbox payload and permits retry metadata', async () => {
    const db = new MemoryDatabase();
    await db.transaction(a, async tx => {
      await tx.audit('pod.accepted', 'pod-1', { version: 1 });
      await tx.emit('pod.accepted', 'pod-1', { version: 1 });
    });
    await expect(db.transaction(a, async tx => {
      const event = (await tx.list<OutboxEvent>('outbox'))[0]!;
      await tx.put('outbox', { ...event, payload: { version: 2 } });
    })).rejects.toThrow('immutable');
    await expect(db.transaction(a, async tx => {
      const audit = (await tx.list('audit'))[0]!;
      await tx.put('audit', { ...audit, action: 'rewritten' });
    })).rejects.toThrow('append only');
    await db.transaction(a, async tx => {
      const event = (await tx.list<OutboxEvent>('outbox'))[0]!;
      await tx.put('outbox', { ...event, status: 'failed', attempts: 1, lastError: 'provider unavailable' });
    });
    expect(await db.transaction(a, tx => tx.list('outbox'))).toMatchObject([{ status: 'failed', attempts: 1 }]);
  });

  it('returned objects are snapshots and cannot mutate stored records', async () => {
    const db = new MemoryDatabase();
    await db.transaction(a, tx => tx.put('pods', { id: 'pod-1', quantities: { accepted: '2' } }));
    await db.transaction(a, async tx => {
      const record = (await tx.get('pods', 'pod-1'))!;
      (record.quantities as Record<string, string>).accepted = '999';
    });
    expect(await db.transaction(a, tx => tx.get('pods', 'pod-1'))).toMatchObject({ quantities: { accepted: '2' } });
  });
});
