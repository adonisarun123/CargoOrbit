import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { AuditEvent, Context, DatabasePort, Entity, EntityQuery, EntityPageQuery, EntityPage, TenantUsage, MemberIdentity, Role, OutboxEvent, Transaction } from './types.js';
import {pageBounds} from './pagination.js';
import {searchBounds,searchProjection,shipmentSearchSql} from './search.js';
import type {ShipmentSearchItem,ShipmentSearchQuery} from './types.js';
export * from './types.js';
export { MemoryDatabase } from './memory.js';

const reservedKinds = new Set(['audit', 'outbox']);
const boundedSetting=(name:string,fallback:number,min:number,max:number)=>{const value=Number(process.env[name]??fallback);if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);return value;};

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
  private readonly activeTransactions = new WeakSet<Transaction>();

  constructor(connection?: string | Pool | PoolConfig) {
    this.pool = connection instanceof Pool ? connection : new Pool(
      typeof connection === 'string' ? { connectionString: connection, max: 15, connectionTimeoutMillis: 15000 } :
      connection ?? { connectionString: process.env.DATABASE_URL, max: boundedSetting('DB_POOL_SIZE',15,1,100), connectionTimeoutMillis: 15000 },
    );
    this.pool.on('error', (error: Error) => {
      // Do not log connection strings, SQL parameters, payloads, or credentials.
      console.error('PostgreSQL idle connection failed:', error.name);
    });
  }

  /** Reject superusers, BYPASSRLS and table owners even if a URL was misconfigured. */
  assertRuntimeRole(): Promise<void> {
    this.runtimeCheck ??= this.pool.query<{ unsafe: boolean }>(`
      SELECT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR pg_has_role(current_user,'cargoorbit_operator','MEMBER') OR has_schema_privilege(current_user,'public','CREATE') OR EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('entities','audit_events','outbox_events','shipment_search_terms')
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
    if(context.exitSessionId)return this.exitTransaction(context,callback);
    return this.transactionWithAuthorization(context,context,callback,false);
  }

  /** Closing-workspace handover only; independent MFA-backed owner session and no business writes. */
  async exitTransaction<T>(context:Context,callback:(tx:Transaction)=>Promise<T>):Promise<T> {
    if(context.role!=='owner'||!context.membershipId||!context.exitSessionId||!context.exitExportReceiptId||context.sessionId||!Number.isInteger(context.sessionVersion)||!Number.isInteger(context.userSessionVersion))throw Object.assign(new Error('Owner exit identity required'),{status:403,code:'EXIT_IDENTITY_REQUIRED'});
    return this.transactionWithAuthorization(context,context,callback,true,true);
  }

  /** Approved support tooling only. Keeps the real home-workspace identity; business writes are denied. */
  async supportTransaction<T>(source:Context,targetTenantId:string,callback:(tx:Transaction)=>Promise<T>):Promise<T> {
    if(source.exitSessionId||source.role!=='platform_admin'||!source.membershipId||!source.sessionId||!Number.isInteger(source.sessionVersion)||!Number.isInteger(source.userSessionVersion))throw Object.assign(new Error('Authenticated platform support identity required'),{status:403,code:'SUPPORT_IDENTITY_REQUIRED'});
    if(!targetTenantId||targetTenantId.length>200)throw new Error('Invalid support target');
    return this.transactionWithAuthorization({...source,tenantId:targetTenantId},source,callback,true);
  }

  /** Public capabilities are independently verified by the callback and cannot change business records. */
  async capabilityTransaction<T>(context:Context,callback:(tx:Transaction)=>Promise<T>):Promise<T> {
    if(context.exitSessionId||context.role!=='auditor'||! /^(tracking|machine):[^:]+$/.test(context.userId)||context.membershipId||context.sessionId||context.sessionVersion!==undefined||context.userSessionVersion!==undefined)throw Object.assign(new Error('Read-only capability context required'),{status:403,code:'CAPABILITY_IDENTITY_REQUIRED'});
    return this.transactionWithAuthorization(context,context,callback,true);
  }

  private async transactionWithAuthorization<T>(context:Context,authorization:Context,callback:(tx:Transaction)=>Promise<T>,supportReadOnly:boolean,exitMode=false):Promise<T> {
    validateContext(context);
    await this.assertRuntimeRole();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path=pg_catalog,public');
      await client.query("SELECT set_config('statement_timeout',$1,true), set_config('lock_timeout',$2,true), set_config('idle_in_transaction_session_timeout',$3,true)",[String(boundedSetting('DB_STATEMENT_TIMEOUT_MS',30000,1000,300000)),String(boundedSetting('DB_LOCK_TIMEOUT_MS',10000,1000,60000)),'60000']);
      await client.query("SELECT set_config('app.tenant_id',$1,true), set_config('app.actor_id',$2,true)", [context.tenantId, context.userId]);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`cargoorbit:${context.tenantId}`]);
      if(exitMode)await this.validateExitAuthorization(client,authorization);else await this.validateAuthorization(client,authorization,supportReadOnly);
      const tenant = await client.query<{ status: string }>('SELECT status FROM tenants WHERE id=$1', [context.tenantId]);
      if (!tenant.rows[0] || tenant.rows[0].status === 'closed'||exitMode&&tenant.rows[0].status!=='closing'||supportReadOnly&&!exitMode&&tenant.rows[0].status!=='active') throw new Error('Tenant is unavailable');
      const tx = new PostgresTransaction(client, context, supportReadOnly||tenant.rows[0].status !== 'active');
      this.activeTransactions.add(tx);
      let result:T;
      try { result = await callback(tx); } finally { this.activeTransactions.delete(tx); }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async validateExitAuthorization(client:PoolClient,ctx:Context):Promise<void> {
    const denied=()=>Object.assign(new Error('Exit access is unavailable or expired'),{status:403,code:'EXIT_AUTHORIZATION_CHANGED'});
    const result=await client.query(`SELECT m.organization_id,m.facility_ids,m.assigned_driver_id,s.version,u.session_version,t.features->>'exitExportUntil' exit_export_until,t.features->>'exitExportReceiptId' exit_export_receipt_id
      FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenants t ON t.id=m.tenant_id
      JOIN exit_sessions s ON s.user_id=u.id AND s.membership_id=m.id
      WHERE m.id=$1 AND s.id=$2 AND u.id=$3 AND m.tenant_id=$4 AND m.role='owner'
        AND m.status='active' AND u.status='active' AND u.mfa_enabled=true AND t.status='closing'
        AND s.revoked_at IS NULL AND s.expires_at>now() AND s.user_session_version=u.session_version
      FOR SHARE OF m,u,s,t`,[ctx.membershipId,ctx.exitSessionId,ctx.userId,ctx.tenantId]);
    const row=result.rows[0],facilities=(ids:unknown)=>JSON.stringify([...new Set(Array.isArray(ids)?ids:[])].sort());
    if(!row||row.exit_export_receipt_id!==ctx.exitExportReceiptId||!Number.isFinite(Date.parse(row.exit_export_until))||Date.parse(row.exit_export_until)<=Date.now()||Number(row.version)!==ctx.sessionVersion||Number(row.session_version)!==ctx.userSessionVersion||
      (row.organization_id||undefined)!==ctx.organizationId||(row.assigned_driver_id||undefined)!==ctx.assignedDriverId||facilities(row.facility_ids)!==facilities(ctx.facilityIds))throw denied();
  }

  private async validateAuthorization(client:PoolClient,ctx:Context,requireMfa=false):Promise<void> {
    if(!ctx.membershipId&&!ctx.sessionId)return;
    const changed=()=>Object.assign(new Error('Authorization changed; sign in again before retrying'),{status:403,code:'AUTHORIZATION_CHANGED'});
    if(!ctx.membershipId||!ctx.sessionId)throw changed();
    const result=await client.query(`SELECT m.role,m.organization_id,m.facility_ids,m.assigned_driver_id,u.mfa_enabled,
      s.version,u.session_version FROM memberships m JOIN users u ON u.id=m.user_id
      JOIN tenants t ON t.id=m.tenant_id JOIN auth_sessions s ON s.user_id=u.id AND s.membership_id=m.id
      WHERE m.id=$1 AND s.id=$2 AND u.id=$3 AND m.tenant_id=$4 AND m.status='active'
        AND u.status='active' AND t.status='active' AND s.revoked_at IS NULL AND s.expires_at>now()
        AND s.user_session_version=u.session_version FOR SHARE OF m,u,s,t`,[ctx.membershipId,ctx.sessionId,ctx.userId,ctx.tenantId]);
    const row=result.rows[0],facilities=(ids:unknown)=>JSON.stringify([...new Set(Array.isArray(ids)?ids:[])].sort());
    if(!row||requireMfa&&row.mfa_enabled!==true||row.role!==ctx.role||(row.organization_id||undefined)!==ctx.organizationId||
      (row.assigned_driver_id||undefined)!==ctx.assignedDriverId||facilities(row.facility_ids)!==facilities(ctx.facilityIds)||
      ctx.sessionVersion!==undefined&&Number(row.version)!==ctx.sessionVersion||
      ctx.userSessionVersion!==undefined&&Number(row.session_version)!==ctx.userSessionVersion)throw changed();
  }

  /** Verify receiver identity on the transaction connection; locks prevent concurrent contact changes. */
  async verifyReceiver(tx:Transaction,userId:string,organizationId:string):Promise<ReceiverIdentity|undefined> {
    if(!(tx instanceof PostgresTransaction)||!this.activeTransactions.has(tx))throw new Error('Receiver verification requires an active transaction from this database');
    return tx.lookupReceiver(userId,organizationId);
  }

  /** Claim without scanning every historical event. Lease token fences stale workers. */
  async claimOutbox(context:Context, leaseMs=120000,options:{excludeTypes?:string[]}={}):Promise<OutboxEvent|undefined> {
    const excludeTypes=options.excludeTypes??[];if(excludeTypes.length>1||excludeTypes.some(type=>type!=='tenant.export_requested'))throw new Error('Invalid excluded outbox types');
    if(!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>900000)throw new Error('Invalid worker lease duration');
    return this.outboxTransaction(context,async client=>{
      const result=await client.query(`WITH candidate AS (
        SELECT id FROM outbox_events WHERE tenant_id=$1 AND status IN ('pending','failed','processing') AND available_at<=now() AND NOT(type=ANY($4::text[]))
        ORDER BY available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE outbox_events e SET status='processing',attempts=e.attempts+1,lease_token=$2,
        available_at=now()+($3::bigint * interval '1 millisecond')
        FROM candidate c WHERE e.tenant_id=$1 AND e.id=c.id RETURNING e.*`,[context.tenantId,randomUUID(),leaseMs,excludeTypes]);
      return result.rows[0]?outboxFromRow(result.rows[0]):undefined;
    });
  }
  async renewOutbox(context:Context,eventId:string,leaseToken:string,leaseMs=120000):Promise<boolean> {
    if(!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>900000)throw new Error('Invalid worker lease duration');
    return this.outboxTransaction(context,async client=>{const result=await client.query("UPDATE outbox_events SET available_at=now()+($4::bigint*interval '1 millisecond') WHERE tenant_id=$1 AND id=$2 AND status='processing' AND lease_token=$3 AND available_at>now()",[context.tenantId,eventId,leaseToken,leaseMs]);return result.rowCount===1;});
  }
  async completeOutbox(context:Context,eventId:string,leaseToken:string):Promise<boolean> {
    return this.outboxTransaction(context,async client=>{
      const result=await client.query("UPDATE outbox_events SET status='completed',completed_at=now(),last_error=NULL,lease_token=NULL WHERE tenant_id=$1 AND id=$2 AND status='processing' AND lease_token=$3",[context.tenantId,eventId,leaseToken]);
      return result.rowCount===1;
    });
  }
  async failOutbox(context:Context,eventId:string,leaseToken:string,errorCode:string,maxAttempts=8):Promise<boolean> {
    if(!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>100)throw new Error('Invalid retry limit');
    return this.outboxTransaction(context,async client=>{
      const result=await client.query(`UPDATE outbox_events SET status=CASE WHEN attempts>=$5 THEN 'dead' ELSE 'failed' END,
        available_at=now()+(LEAST(3600000,power(2,LEAST(attempts,12))*1000)::bigint * interval '1 millisecond'),last_error=$4,lease_token=NULL
        WHERE tenant_id=$1 AND id=$2 AND status='processing' AND lease_token=$3`,[context.tenantId,eventId,leaseToken,errorCode.slice(0,240),maxAttempts]);
      return result.rowCount===1;
    });
  }
  private async outboxTransaction<T>(context:Context,run:(client:PoolClient)=>Promise<T>):Promise<T>{
    validateContext(context);await this.assertRuntimeRole();
    const client=await this.pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL search_path=pg_catalog,public');await client.query("SET LOCAL statement_timeout='30s'");await client.query("SELECT set_config('app.tenant_id',$1,true)",[context.tenantId]);
      const tenant=await client.query("SELECT id FROM tenants WHERE id=$1 AND status='active'",[context.tenantId]);if(!tenant.rowCount)throw new Error('Tenant is not active');
      const value=await run(client);await client.query('COMMIT');return value;
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }
  async close(): Promise<void> { await this.pool.end(); }
}

export interface ReceiverIdentity {email:string;verified_contact:string|null;contact_verified_at:Date|null;facility_ids:string[]}

class PostgresTransaction implements Transaction {
  constructor(private readonly client: PoolClient, private readonly ctx: Context, private readonly readOnly: boolean) {}

  async searchConsignments(query:ShipmentSearchQuery):Promise<EntityPage<ShipmentSearchItem>> {
    const bounds=searchBounds(this.ctx,query);
    const result=await this.client.query<{id:string;data:Entity;matches:ShipmentSearchItem['matches']}>(shipmentSearchSql,[this.ctx.tenantId,bounds.type,bounds.like,bounds.match==='exact',bounds.q,bounds.afterId??null,this.ctx.role,this.ctx.organizationId??null,this.ctx.facilityIds??[],this.ctx.assignedDriverId??this.ctx.userId,bounds.limit+1]);
    const rows=result.rows.slice(0,bounds.limit);return {items:rows.map(row=>searchProjection(row.data,row.matches)),...(result.rows.length>bounds.limit?{nextCursor:bounds.cursor(rows.at(-1)!.id)}:{})};
  }

  async lookupMember(userId:string,role?:Role):Promise<MemberIdentity|undefined> {
    const result=await this.client.query(`SELECT u.id,u.name,u.email,u.verified_contact,u.contact_verified_at,m.id membership_id,m.role,m.organization_id,m.facility_ids
      FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.tenant_id=$2 AND u.status='active' AND m.status='active'
      AND ($3::text IS NULL OR m.role=$3) ORDER BY m.id LIMIT 2 FOR SHARE OF u,m`,[userId,this.ctx.tenantId,role??null]);
    if(result.rows.length!==1)return undefined;const row=result.rows[0];return {id:row.id,membershipId:row.membership_id,name:row.name,email:row.email,...(row.contact_verified_at?{verifiedContact:row.verified_contact||row.email}:{}),role:row.role,organizationId:row.organization_id||undefined,facilityIds:row.facility_ids||[],status:'active'};
  }

  async lookupReceiver(userId:string,organizationId:string):Promise<ReceiverIdentity|undefined> {
    const result=await this.client.query<ReceiverIdentity>(`SELECT u.email,u.verified_contact,u.contact_verified_at,m.facility_ids
      FROM users u JOIN memberships m ON m.user_id=u.id
      WHERE u.id=$1 AND m.tenant_id=$2 AND m.organization_id=$3 AND m.role='receiver'
        AND m.status='active' AND u.status='active' FOR SHARE OF u,m`,[userId,this.ctx.tenantId,organizationId]);
    return result.rows[0];
  }

  private writable(): void {
    if (this.readOnly) throw new Error('This transaction permits authorized reads and audit records only');
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

  async find<T extends Entity>(kind:string,query:EntityQuery={}):Promise<T[]> {
    if(reservedKinds.has(kind)||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind))throw new Error('find requires a business entity kind');
    const limit=query.limit??100,offset=query.offset??0;
    if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('Invalid page bounds');
    if(query.before&&!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(query.before.field))throw new Error('Invalid filter field');
    const result=await this.client.query<{data:T}>(`SELECT data FROM entities WHERE tenant_id=$1 AND kind=$2 AND data @> $3::jsonb
      ${query.before?"AND (data ->> $6::text) < $7::text":''} ORDER BY created_at,id LIMIT $4 OFFSET $5`,
      [this.ctx.tenantId,kind,JSON.stringify(query.where??{}),limit,offset,...(query.before?[query.before.field,query.before.value]:[])]);
    return result.rows.map(r=>r.data);
  }
  async page<T extends Entity>(kind:string,query:EntityPageQuery={}):Promise<EntityPage<T>> {
    const bounds=pageBounds(this.ctx.tenantId,kind,query);
    const result=await this.client.query<{id:string;data:T}>(`SELECT id,data FROM entities WHERE tenant_id=$1 AND kind=$2 AND data @> $3::jsonb
      AND ($4::text IS NULL OR id>$4) ${query.before?"AND (data ->> $6::text) < $7::text":''} ORDER BY id LIMIT $5`,
      [this.ctx.tenantId,kind,JSON.stringify(bounds.where),bounds.afterId??null,bounds.limit+1,...(query.before?[query.before.field,query.before.value]:[])]);
    const rows=result.rows.slice(0,bounds.limit);return {items:rows.map(row=>row.data),...(result.rows.length>bounds.limit?{nextCursor:bounds.cursor(rows.at(-1)!.id)}:{})};
  }
  async usage():Promise<TenantUsage[]> {
    const result=await this.client.query<{kind:string;records:string;metadataBytes:string;objectBytes:string}>('SELECT kind,record_count::text records,metadata_bytes::text "metadataBytes",object_bytes::text "objectBytes" FROM tenant_usage WHERE tenant_id=$1 ORDER BY kind',[this.ctx.tenantId]);return result.rows;
  }

  async count(kind:string,where:Record<string,unknown>={}):Promise<number>{
    if(reservedKinds.has(kind)||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind))throw new Error('count requires a business entity kind');
    const result=await this.client.query<{count:string}>('SELECT count(*)::text FROM entities WHERE tenant_id=$1 AND kind=$2 AND data @> $3::jsonb',[this.ctx.tenantId,kind,JSON.stringify(where)]);
    return Number(result.rows[0]?.count??0);
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
  return { id: String(row.id), tenantId: String(row.tenant_id), type: String(row.type), aggregateId: String(row.aggregate_id), payload: row.payload, status: row.status as OutboxEvent['status'], attempts: Number(row.attempts), availableAt: iso(row.available_at), createdAt: iso(row.created_at), ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}), ...(row.last_error ? { lastError: String(row.last_error) } : {}), ...(row.lease_token ? {leaseToken:String(row.lease_token)} : {}) };
}
