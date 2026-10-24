import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { AuditEvent, Context, DatabasePort, Entity, OutboxEvent, Transaction } from './types.js';
export * from './types.js';
export { MemoryDatabase } from './memory.js';

const reservedKinds = new Set(['audit', 'outbox']);

function validateContext(ctx: Context): void {
  if (!ctx.tenantId || !ctx.userId || !ctx.role) throw new Error('Authenticated tenant context is required');
}

function validateEntity(kind: string, entity: Entity): void {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind)) throw new Error('Invalid entity kind');
  if (typeof entity.id !== 'string' || !entity.id || entity.id.length > 200) throw new Error('Invalid entity identifier');
  if (JSON.stringify(entity).length > 4 * 1024 * 1024) throw new Error('Entity metadata exceeds four MiB; store evidence separately');
}

/** Tenant transactions deliberately serialize tenant writes in this first release.
 * This favors integrity over throughput. Capacity must be measured before scaling.
 */
export class Database implements DatabasePort {
  readonly pool: Pool;
  private runtimeCheck: Promise<void> | undefined;

  constructor(connection?: string | Pool | PoolConfig) {
    this.pool = connection instanceof Pool ? connection : new Pool(
      typeof connection === 'string' ? { connectionString: connection, max: 15 } :
      connection ?? { connectionString: process.env.DATABASE_URL, max: 15 },
    );
    this.pool.on('error', (error: Error) => {
      // Do not log connection strings, SQL parameters, payloads, or credentials.
      console.error('PostgreSQL idle connection failed:', error.name);
    });
  }

  /** Reject superusers, BYPASSRLS and table owners even if a URL was misconfigured. */
  assertRuntimeRole(): Promise<void> {
    this.runtimeCheck ??= this.pool.query<{ unsafe: boolean }>(`
      SELECT (r.rolsuper OR r.rolbypassrls OR EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('entities','audit_events','outbox_events')
          AND pg_has_role(current_user,c.relowner,'MEMBER')
      )) AS unsafe FROM pg_roles r WHERE r.rolname=current_user
    `).then(({ rows }) => {
      if (!rows[0] || rows[0].unsafe) {
        throw new Error('Unsafe runtime database role: use a non-owner login without SUPERUSER or BYPASSRLS');
      }
    }).catch((error: unknown) => {
      this.runtimeCheck = undefined;
      throw error;
    });
    return this.runtimeCheck;
  }

  async transaction<T>(context: Context, callback: (tx: Transaction) => Promise<T>): Promise<T> {
    validateContext(context);
    await this.assertRuntimeRole();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.actor_id',$2,true)", [context.tenantId, context.userId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`cargoorbit:${context.tenantId}`]);
      const tenant = await client.query<{ status: string }>('SELECT status FROM tenants WHERE id=$1', [context.tenantId]);
      if (!tenant.rows[0] || tenant.rows[0].status === 'closed') throw new Error('Tenant is unavailable');
      const tx = new PostgresTransaction(client, context, tenant.rows[0].status !== 'active');
      const result = await callback(tx);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> { await this.pool.end(); }
}

class PostgresTransaction implements Transaction {
  constructor(private readonly client: PoolClient, private readonly ctx: Context, private readonly readOnly: boolean) {}

  private writable(): void {
    if (this.readOnly) throw new Error('Tenant is closing; only retention and authorized export reads are available');
  }

  async get<T extends Entity>(kind: string, id: string): Promise<T | undefined> {
    if (kind === 'audit') {
      const result = await this.client.query('SELECT * FROM audit_events WHERE tenant_id=$1 AND id=$2', [this.ctx.tenantId, id]);
      return result.rows[0] ? auditFromRow(result.rows[0]) as unknown as T : undefined;
    }
    if (kind === 'outbox') {
      const result = await this.client.query('SELECT * FROM outbox_events WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [this.ctx.tenantId, id]);
      return result.rows[0] ? outboxFromRow(result.rows[0]) as unknown as T : undefined;
    }
    const result = await this.client.query<{ data: T }>('SELECT data FROM entities WHERE tenant_id=$1 AND kind=$2 AND id=$3 FOR UPDATE', [this.ctx.tenantId, kind, id]);
    return result.rows[0]?.data;
  }

  async list<T extends Entity>(kind: string): Promise<T[]> {
    if (kind === 'audit') {
      const result = await this.client.query('SELECT * FROM audit_events WHERE tenant_id=$1 ORDER BY created_at,id', [this.ctx.tenantId]);
      return result.rows.map(auditFromRow) as unknown as T[];
    }
    if (kind === 'outbox') {
      const result = await this.client.query('SELECT * FROM outbox_events WHERE tenant_id=$1 ORDER BY created_at,id', [this.ctx.tenantId]);
      return result.rows.map(outboxFromRow) as unknown as T[];
    }
    const result = await this.client.query<{ data: T }>('SELECT data FROM entities WHERE tenant_id=$1 AND kind=$2 ORDER BY created_at,id', [this.ctx.tenantId, kind]);
    return result.rows.map(row => row.data);
  }

  async put<T extends Entity>(kind: string, entity: T): Promise<void> {
    this.writable();
    validateEntity(kind, entity);
    if ('tenantId' in entity && entity.tenantId !== this.ctx.tenantId) throw new Error('Cross tenant payload is prohibited');
    if (kind === 'audit') throw new Error('Audit events are append only; use tx.audit');
    if (kind === 'outbox') {
      const old = await this.get<OutboxEvent>('outbox', entity.id);
      if (!old) throw new Error('Use tx.emit to create an outbox event');
      for (const field of ['type', 'aggregateId', 'payload', 'tenantId', 'createdAt']) {
        if (JSON.stringify(old[field]) !== JSON.stringify(entity[field])) throw new Error(`Outbox ${field} is immutable`);
      }
      const allowed = new Set(['pending', 'processing', 'completed', 'failed', 'dead']);
      if (!allowed.has(String(entity.status)) || !Number.isInteger(entity.attempts) || Number(entity.attempts) < Number(old.attempts)) {
        throw new Error('Invalid outbox lifecycle update');
      }
      await this.client.query(`UPDATE outbox_events SET status=$3,attempts=$4,available_at=$5,completed_at=$6,last_error=$7
        WHERE tenant_id=$1 AND id=$2`, [this.ctx.tenantId, entity.id, entity.status, entity.attempts, entity.availableAt, entity.completedAt ?? null, entity.lastError ?? null]);
      return;
    }
    await this.client.query(`INSERT INTO entities (tenant_id,kind,id,data) VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (tenant_id,kind,id) DO UPDATE SET data=excluded.data,revision=entities.revision+1,updated_at=now()`,
      [this.ctx.tenantId, kind, entity.id, JSON.stringify(entity)]);
  }

  async delete(kind: string, id: string): Promise<void> {
    this.writable();
    if (reservedKinds.has(kind)) throw new Error('Audit and outbox records cannot be deleted through normal operations');
    await this.client.query('DELETE FROM entities WHERE tenant_id=$1 AND kind=$2 AND id=$3', [this.ctx.tenantId, kind, id]);
  }

  async audit(action: string, target: string, details: unknown = {}): Promise<void> {
    // Audit reads/exports are permitted while closing so attribution remains available.
    await this.client.query(`INSERT INTO audit_events (tenant_id,id,actor_id,role,action,target,details,correlation_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [this.ctx.tenantId, randomUUID(), this.ctx.userId, this.ctx.role, action, target, JSON.stringify(details), this.ctx.correlationId ?? randomUUID()]);
  }

  async emit(type: string, aggregateId: string, payload: unknown): Promise<void> {
    this.writable();
    await this.client.query('INSERT INTO outbox_events(tenant_id,id,type,aggregate_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)',
      [this.ctx.tenantId, randomUUID(), type, aggregateId, JSON.stringify(payload)]);
  }
}

function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : String(value); }

function auditFromRow(row: Record<string, unknown>): AuditEvent {
  return { id: String(row.id), tenantId: String(row.tenant_id), actorId: String(row.actor_id), role: row.role as Context['role'], action: String(row.action), target: String(row.target), details: row.details, correlationId: String(row.correlation_id), createdAt: iso(row.created_at) };
}

function outboxFromRow(row: Record<string, unknown>): OutboxEvent {
  return { id: String(row.id), tenantId: String(row.tenant_id), type: String(row.type), aggregateId: String(row.aggregate_id), payload: row.payload, status: row.status as OutboxEvent['status'], attempts: Number(row.attempts), availableAt: iso(row.available_at), createdAt: iso(row.created_at), ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}), ...(row.last_error ? { lastError: String(row.last_error) } : {}) };
}
