import { isDeepStrictEqual } from 'node:util';
import { randomUUID } from 'node:crypto';
import {pageBounds} from './pagination.js';
import type { Context, DatabasePort, Entity, EntityQuery, EntityPageQuery, MemberIdentity, OutboxEvent, Transaction } from './types.js';

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
      const matches=(value:unknown,where:unknown):boolean=>{if(where===null||typeof where!=='object')return value===where;if(Array.isArray(where))return Array.isArray(value)&&where.every(w=>value.some(v=>matches(v,w)));return !!value&&typeof value==='object'&&Object.entries(where).every(([k,v])=>matches((value as Record<string,unknown>)[k],v));};
      const find=<E extends Entity>(kind:string,query:EntityQuery={})=>{
        if(['audit','outbox'].includes(kind)||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind))throw new Error('find requires a business entity kind');
        const limit=query.limit??100,offset=query.offset??0;
        if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>100000)throw new Error('Invalid page bounds');
        if(query.before&&!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(query.before.field))throw new Error('Invalid filter field');
        return structuredClone([...table(kind).values()].filter(v=>matches(v,query.where??{})&&(!query.before||typeof v[query.before.field]==='string'&&String(v[query.before.field])<query.before.value)).slice(offset,offset+limit)) as E[];
      };
      const tx: Transaction = {
        lookupMember:async(userId,role)=>{const rows=[...table('members').values()].filter(row=>row.id===userId&&row.status==='active'&&(!role||row.role===role));return rows.length===1?structuredClone(rows[0]) as unknown as MemberIdentity:undefined;},
        page:async <E extends Entity>(kind:string,query:EntityPageQuery={})=>{const bounds=pageBounds(context.tenantId,kind,query);const values=[...table(kind).values()].filter(v=>matches(v,bounds.where)&&(!bounds.afterId||v.id>bounds.afterId)&&(!query.before||typeof v[query.before.field]==='string'&&String(v[query.before.field])<query.before.value)).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).slice(0,bounds.limit+1);const items=structuredClone(values.slice(0,bounds.limit)) as E[];return {items,...(values.length>bounds.limit?{nextCursor:bounds.cursor(items.at(-1)!.id)}:{})};},
        usage:async()=>[...snapshot.entries()].filter(([key])=>key.startsWith(`${context.tenantId}\u0000`)&&!['audit','outbox'].includes(key.split('\u0000')[1]!)).map(([key,rows])=>({kind:key.split('\u0000')[1]!,records:String(rows.size),metadataBytes:String([...rows.values()].reduce((sum,row)=>sum+Buffer.byteLength(JSON.stringify(row)),0)),objectBytes:String([...rows.values()].reduce((sum,row)=>sum+(['evidence','packets'].includes(key.split('\u0000')[1]!)&&Number.isSafeInteger(row.size)&&Number(row.size)>=0?BigInt(Number(row.size)):key.split('\u0000')[1]==='tenant_exports'&&Number.isSafeInteger(row.bytes)&&Number(row.bytes)>=0?BigInt(Number(row.bytes)):0n),0n))})).sort((a,b)=>a.kind.localeCompare(b.kind)),
        find:async <E extends Entity>(kind:string,query:EntityQuery={})=>find<E>(kind,query),
        count:async(kind:string,where:Record<string,unknown>={})=>{if(['audit','outbox'].includes(kind)||!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind))throw new Error('count requires a business entity kind');return [...table(kind).values()].filter(v=>matches(v,where)).length;},
        get: async <E extends Entity>(kind: string, id: string) => structuredClone(table(kind).get(id)) as E | undefined,
        list: async <E extends Entity>(kind: string) => structuredClone([...table(kind).values()]) as E[],
        put: async <E extends Entity>(kind: string, entity: E) => {
          if(context.exitSessionId)throw new Error('Exit access permits reads and audit only');
          if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind) || !entity.id || typeof entity.id !== 'string') throw new Error('Entity kind and id are required');
          if ('tenantId' in entity && entity.tenantId !== context.tenantId) throw new Error('Cross tenant payload is prohibited');
          if (table(kind).has(entity.id)&&['policies','observations','inventory_movements','asset_handovers','safety_tests','scorecards','emissions_runs','dock_reads','handling_unit_events','eta_estimates','maintenance_events','allocation_reversals','allocation_verifications','discrepancies','operational_rules','fuel_entries','toll_events','warehouse_task_events','quality_reviews','replenishment_events','recovery_verifications','advanced_approval_history','maintenance_signals','maintenance_rules','layout_versions','goods_documents','goods_document_links','transshipments','barcode_mappings','task_history','usage_warnings'].includes(kind))throw new Error('Historical record is append only; append a correction');
          if(kind==='evidence'&&table(kind).has(entity.id)){
            const old=table(kind).get(entity.id)!;const omitScan=(v:Entity)=>Object.fromEntries(Object.entries(v).filter(([k])=>!['scanStatus','scannerReference','scannedAt'].includes(k)));
            if(!isDeepStrictEqual(omitScan(old),omitScan(entity)))throw new Error('Original evidence provenance is immutable');
            const bound=[...table('pods').values()].some(p=>{const payload=p.acceptedPayload as {evidence?:{id:string}[]}|undefined;return payload?.evidence?.some(e=>e.id===entity.id);});
            if(bound&&!isDeepStrictEqual(old,entity))throw new Error('Sealed evidence provenance is immutable');
          }
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
          if(context.exitSessionId)throw new Error('Exit access permits reads and audit only');
          if (['audit', 'outbox'].includes(kind)) throw new Error('Append only record');
          if (['policies','observations','inventory_movements','asset_handovers','safety_tests','scorecards','emissions_runs','dock_reads','handling_unit_events','eta_estimates','maintenance_events','allocation_reversals','allocation_verifications','discrepancies','operational_rules','fuel_entries','toll_events','warehouse_task_events','quality_reviews','replenishment_events','recovery_verifications','advanced_approval_history','maintenance_signals','maintenance_rules','layout_versions','goods_documents','goods_document_links','transshipments','barcode_mappings','task_history','usage_warnings'].includes(kind))throw new Error('Historical record is append only');
          if(kind==='evidence'&&[...table('pods').values()].some(p=>(p.acceptedPayload as {evidence?:{id:string}[]}|undefined)?.evidence?.some(e=>e.id===id)))throw new Error('Sealed evidence provenance is immutable');
          if (kind === 'pods' && table(kind).get(id)?.acceptedPayload != null) throw new Error('Finalized POD versions are immutable; create a linked correction');
          table(kind).delete(id);
        },
        audit: async (action: string, target: string, details: unknown = {}) => {
          const id = randomUUID();
          table('audit').set(id, { id, tenantId: context.tenantId, actorId: context.userId, role: context.role, action, target, details: structuredClone(details), correlationId: context.correlationId ?? randomUUID(), createdAt: new Date().toISOString() });
        },
        emit: async (type: string, aggregateId: string, payload: unknown) => {
          if(context.exitSessionId)throw new Error('Exit access permits reads and audit only');
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
