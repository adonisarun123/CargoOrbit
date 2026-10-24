import { randomUUID } from 'node:crypto';
import type { Context, DatabasePort, Entity, OutboxEvent, Transaction } from './types.js';

/** Test adapter only. It intentionally is not selected by the deployed API. */
export class MemoryDatabase implements DatabasePort {
  private records = new Map<string, Map<string, Entity>>();
  private queue: Promise<unknown> = Promise.resolve();

  transaction<T>(context: Context, callback: (tx: Transaction) => Promise<T>): Promise<T> {
    if (!context.tenantId || !context.userId || !context.role) return Promise.reject(new Error('Authenticated context is required'));
    const work = this.queue.then(async () => {
      // Copy-on-write snapshot provides rollback for all events and entities.
      const snapshot = structuredClone(this.records);
      const table = (kind: string): Map<string, Entity> => {
        const key = `${context.tenantId}\u0000${kind}`;
        let found = snapshot.get(key);
        if (!found) { found = new Map(); snapshot.set(key, found); }
        return found;
      };
      const tx: Transaction = {
        get: async <E extends Entity>(kind: string, id: string) => structuredClone(table(kind).get(id)) as E | undefined,
        list: async <E extends Entity>(kind: string) => structuredClone([...table(kind).values()]) as E[],
        put: async <E extends Entity>(kind: string, entity: E) => {
          if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind) || !entity.id || typeof entity.id !== 'string') throw new Error('Entity kind and id are required');
          if ('tenantId' in entity && entity.tenantId !== context.tenantId) throw new Error('Cross tenant payload is prohibited');
          if (kind === 'pods' && table(kind).get(entity.id)?.acceptedPayload != null) throw new Error('Finalized POD versions are immutable; create a linked correction');
          if (kind === 'audit') throw new Error('Audit events are append only');
          if (kind === 'outbox') {
            const old = table(kind).get(entity.id);
            if (!old) throw new Error('Use tx.emit to create an outbox event');
            for (const field of ['type', 'aggregateId', 'payload', 'tenantId', 'createdAt']) {
              if (JSON.stringify(old[field]) !== JSON.stringify(entity[field])) throw new Error(`Outbox ${field} is immutable`);
            }
            if (!['pending', 'processing', 'completed', 'failed', 'dead'].includes(String(entity.status)) || !Number.isInteger(entity.attempts) || Number(entity.attempts) < Number(old.attempts)) throw new Error('Invalid outbox lifecycle update');
          }
          table(kind).set(entity.id, structuredClone(entity));
        },
        delete: async (kind: string, id: string) => {
          if (['audit', 'outbox'].includes(kind)) throw new Error('Append only record');
          if (kind === 'pods' && table(kind).get(id)?.acceptedPayload != null) throw new Error('Finalized POD versions are immutable; create a linked correction');
          table(kind).delete(id);
        },
        audit: async (action: string, target: string, details: unknown = {}) => {
          const id = randomUUID();
          table('audit').set(id, { id, tenantId: context.tenantId, actorId: context.userId, role: context.role, action, target, details: structuredClone(details), correlationId: context.correlationId ?? randomUUID(), createdAt: new Date().toISOString() });
        },
        emit: async (type: string, aggregateId: string, payload: unknown) => {
          const id = randomUUID(); const now = new Date().toISOString();
          const event: OutboxEvent = { id, tenantId: context.tenantId, type, aggregateId, payload: structuredClone(payload), status: 'pending', attempts: 0, createdAt: now, availableAt: now };
          table('outbox').set(id, event);
        },
      };
      const result = await callback(tx);
      this.records = snapshot;
      return result;
    });
    this.queue = work.catch(() => undefined);
    return work;
  }

  async close(): Promise<void> { /* no external resources */ }
}
