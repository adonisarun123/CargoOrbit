import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {Database,MemoryDatabase,type Context,type Entity,type ShipmentSearchQuery} from '@cargoorbit/database';
import {applyFixtureMigrations} from './database-fixture';
let pg:PGlite,db:Database,memory:MemoryDatabase;
const owner:Context={tenantId:'search',userId:'owner',role:'owner'};
const customer:Context={...owner,userId:'customer',role:'customer_admin',organizationId:'org',facilityIds:['site']};
const driver:Context={...owner,userId:'driver',role:'driver'};
const finance:Context={...customer,role:'customer_finance'};
const c=(id:string,extra:Record<string,unknown>={}):Entity=>({id,lrNumber:`LR-${id}`,consigneeId:'org',payerId:'org',destinationId:'site',originId:'origin',status:'released',branch:'BLR',financialYear:'2026-27',...extra});
beforeAll(async()=>{pg=new PGlite();await applyFixtureMigrations(pg);db=new Database();const query=async(sql:string,args?:unknown[])=>{const result=await pg.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows.length}};(db.pool as any).query=query;(db.pool as any).connect=async()=>({query,release(){}});});
beforeEach(async()=>{await pg.exec("RESET ROLE;TRUNCATE tenants,users CASCADE;INSERT INTO tenants(id,name) VALUES('search','Search'),('other','Other');SET ROLE cargoorbit_app");memory=new MemoryDatabase();});
afterAll(async()=>{await db.close();await pg.close()});
async function seed(kind:string,values:Entity[],ctx=owner){await db.transaction(ctx,async tx=>{for(const value of values)await tx.put(kind,value)});await memory.transaction(ctx,async tx=>{for(const value of values)await tx.put(kind,value)});}
async function search(query:ShipmentSearchQuery,ctx=owner){const actual=await db.transaction(ctx,tx=>tx.searchConsignments(query));const expected=await memory.transaction(ctx,tx=>tx.searchConsignments(query));expect(actual).toEqual(expected);return actual;}
describe('indexed shipment search SQL and memory parity',()=>{
 it('finds inline, linked, vehicle and freight references with literal wildcard characters',async()=>{
  await seed('consignments',[c('shipment-1',{invoiceReferences:['Goods-inline',"REF_%'\\literal"],ewayBills:[{number:'123456789012'}]})]);
  await seed('goods_documents',[{id:'doc',kind:'goods_invoice',number:'Goods-linked'}]);await seed('goods_document_links',[{id:'link',documentId:'doc',consignmentId:'shipment-1'}]);
  await seed('trips',[{id:'trip',vehicleNumber:'KA-01-AB'}]);await seed('attempts',[{id:'attempt',consignmentId:'shipment-1',tripId:'trip',assignedDriverId:'driver',facilityId:'site',status:'planned'}]);
  await seed('invoices',[{id:'invoice',number:'FREIGHT-001',payerId:'org',consignmentIds:['shipment-1']}]);
  for(const [q,type] of [['LR-', 'lr'],['SHIPMENT-','shipment'],['goods-','goods_invoice'],['12345','eway_bill'],['ka-01','vehicle'],['freight','freight_invoice'],["REF_%'\\",'all']] as const){const page=await search({q,type});expect(page.items.map(v=>v.id)).toEqual(['shipment-1']);}
  expect((await search({q:'Goods-inline',match:'exact'})).items[0]?.matches).toEqual([{type:'goods_invoice',value:'Goods-inline'}]);
  expect((await search({q:'Goods-in',match:'exact'})).items).toEqual([]);
 });
 it('authorizes all matching candidates before limit even after 600 inaccessible matches',async()=>{
  await seed('consignments',[...Array.from({length:601},(_,n)=>c(`a-${String(n).padStart(4,'0')}`,{consigneeId:'hidden',payerId:'hidden',invoiceReferences:['COMMON'],assignedDriverId:'other'})),c('z-visible',{invoiceReferences:['COMMON'],assignedDriverId:'driver'})]);
  await seed('goods_documents',[{id:'shared-document',kind:'goods_invoice',number:'LINKED-COMMON'}]);await seed('goods_document_links',[...Array.from({length:601},(_,n)=>({id:`link-${n}`,documentId:'shared-document',consignmentId:`a-${String(n).padStart(4,'0')}`})),{id:'link-visible',documentId:'shared-document',consignmentId:'z-visible'}]);
  for(const ctx of [customer,driver,finance])expect((await search({q:'LINKED-COMMON',limit:1},ctx)).items.map(v=>v.id)).toEqual(['z-visible']);
  for(const ctx of [customer,{...customer,role:'receiver'} as Context,driver,finance])expect((await search({q:'COMMON',limit:1},ctx)).items.map(v=>v.id)).toEqual(['z-visible']);
  let cursor:string|undefined;const ids:string[]=[];do{const page=await search({q:'COMMON',limit:100,cursor});ids.push(...page.items.map(v=>v.id));cursor=page.nextCursor;}while(cursor);expect(new Set(ids).size).toBe(602);expect(ids).toHaveLength(602);
 });
 it('correlates vehicle matches to authorized attempts and immediately reflects reassignment',async()=>{
  await seed('consignments',[c('shipment',{assignedDriverId:'driver'})]);await seed('trips',[{id:'hidden-trip',vehicleNumber:'HIDDEN-TRUCK'},{id:'visible-trip',driverId:'driver',vehicleNumber:'VISIBLE-TRUCK'}]);
  const a={id:'visible',tripId:'visible-trip',consignmentId:'shipment',assignedDriverId:'driver',facilityId:'site',status:'planned'};
  await seed('attempts',[{...a,id:'hidden',tripId:'hidden-trip',assignedDriverId:'other',facilityId:'hidden'},a]);
  for(const ctx of [customer,driver]){expect((await search({q:'HIDDEN'},ctx)).items).toEqual([]);expect((await search({q:'VISIBLE'},ctx)).items).toHaveLength(1);}
  await seed('attempts',[{...a,assignedDriverId:'other',facilityId:'hidden'}]);expect((await search({q:'VISIBLE'},driver)).items).toEqual([]);expect((await search({q:'VISIBLE'},customer)).items).toEqual([]);expect((await search({q:'LR-'},driver)).items).toEqual([]);
  await seed('attempts',[{...a,status:'accepted'}]);await seed('trips',[{id:'visible-trip',driverId:'new-driver',vehicleNumber:'REASSIGNED-TRUCK'}]);expect((await search({q:'REASSIGNED'},driver)).items).toEqual([]);expect((await search({q:'REASSIGNED',type:'vehicle'},driver)).items).toEqual([]);expect((await search({q:'LR-'},driver)).items).toHaveLength(1);
  await seed('attempts',[{...a,status:'transferred'}]);expect((await search({q:'VISIBLE'},driver)).items).toEqual([]);
 });
 it('never matches inaccessible invoice references or leaks their count, including payer mismatch',async()=>{
  await seed('consignments',[c('shipment',{invoiceReferences:['COMMON'],assignedDriverId:'driver'}),c('foreign',{payerId:'other'})]);
  await seed('invoices',[...Array.from({length:30},(_,n)=>({id:`invoice-${n}`,number:`COMMON-${n}`,payerId:'other',consignmentIds:['shipment']})),{id:'invoice-other-shipment',number:'FREIGHT-other',payerId:'org',consignmentIds:['foreign']}]);
  for(const ctx of [customer,driver,finance]){const page=await search({q:'COMMON'},ctx);expect(page.items[0]?.matches).toEqual([{type:'goods_invoice',value:'COMMON'}]);expect(page.items[0]?.matchesTruncated).toBe(false);expect((await search({q:'FREIGHT'},ctx)).items).toEqual([]);}
 });
 it('caps deduplicated matches at20 with exact matches first and reports truncation after scope',async()=>{
  await seed('consignments',[c('shipment',{invoiceReferences:[...Array.from({length:30},(_,n)=>`GOODS-${n}`),'Goods','GOODS']})]);
  const item=(await search({q:'goods',type:'goods_invoice'})).items[0]!;expect(item.matches).toHaveLength(20);expect(item.matches[0]).toEqual({type:'goods_invoice',value:'GOODS'});expect(item.matchesTruncated).toBe(true);
 });
 it('normalizes legacy surrounding whitespace consistently and indexes long references without oversized btree entries',async()=>{
  await seed('consignments',[c('shipment',{invoiceReferences:[' \tPADDED-Ref\u00a0','\uFEFFPADDED-ref  ','PREFIX-'+ '界'.repeat(1900)]})]);
  const exact=await search({q:'  padded-ref ',match:'exact'});expect(exact.items[0]?.matches).toEqual([{type:'goods_invoice',value:' \tPADDED-Ref\u00a0'}]);
  expect((await search({q:'padded-'})).items[0]?.matches).toHaveLength(1);expect((await search({q:'prefix-'})).items).toHaveLength(1);
 });
 it('binds cursors to the current scope and query, not to the requested page size',async()=>{
  await seed('consignments',[c('one'),c('two')]);const page=await search({q:'LR-',limit:1},customer);expect(page.nextCursor).toBeTruthy();expect((await search({q:'lr-',limit:100,cursor:page.nextCursor},customer)).items.map(v=>v.id)).toEqual(['two']);
  for(const ctx of [{...customer,tenantId:'other'},{...customer,userId:'different'},{...customer,membershipId:'different'},{...customer,role:'receiver'} as Context,{...customer,organizationId:'different'},{...customer,facilityIds:['different']},{...customer,assignedDriverId:'different'}])await expect(db.transaction(ctx,tx=>tx.searchConsignments({q:'LR-',cursor:page.nextCursor}))).rejects.toMatchObject({code:ctx.membershipId?'AUTHORIZATION_CHANGED':'SEARCH_CURSOR'});
  await expect(search({q:'OTHER',cursor:page.nextCursor},customer)).rejects.toMatchObject({code:'SEARCH_CURSOR'});
 });
 it('refreshes index entries on update/delete without changing tenant usage and denies direct writes',async()=>{
  await seed('consignments',[c('one')]);await seed('trips',[{id:'trip',vehicleNumber:'OLD-TRUCK'}]);await seed('attempts',[{id:'attempt',consignmentId:'one',tripId:'trip'}]);expect((await search({q:'OLD'})).items).toHaveLength(1);
  await seed('trips',[{id:'trip',vehicleNumber:'NEW-TRUCK'}]);expect((await search({q:'OLD'})).items).toEqual([]);expect((await search({q:'NEW'})).items).toHaveLength(1);
  await db.transaction(owner,tx=>tx.delete('trips','trip'));await memory.transaction(owner,tx=>tx.delete('trips','trip'));expect((await search({q:'NEW'})).items).toEqual([]);
  await db.transaction(owner,async tx=>{expect((await tx.usage()).find(row=>row.kind==='consignments')?.records).toBe('1');expect((await tx.usage()).some(row=>row.kind==='shipment_search_terms')).toBe(false);});
  await expect(pg.exec("INSERT INTO shipment_search_terms(tenant_id,source_kind,source_id,reference_type,value) VALUES('search','consignments','one','lr','FORGED')")).rejects.toThrow(/permission denied/);
 });
 it('applies FORCE RLS to derived terms and has usable prefix/relation indexes without extensions',async()=>{
  await seed('consignments',[c('one')]);await seed('consignments',[c('secret')],{...owner,tenantId:'other'});await pg.exec("SELECT set_config('app.tenant_id','search',false)");const rows=await pg.query<{value:string}>('SELECT value FROM shipment_search_terms');expect(rows.rows.every(v=>!v.value.includes('secret'))).toBe(true);
  await pg.exec('SET enable_seqscan=off');const plan=await pg.query<{"QUERY PLAN":string}>("EXPLAIN SELECT source_id FROM shipment_search_terms WHERE tenant_id='search' AND reference_type='lr' AND normalized_prefix LIKE 'lr-%'");expect(plan.rows.map(r=>r['QUERY PLAN']).join('\n')).toMatch(/shipment_search_prefix/);await pg.exec('RESET enable_seqscan');
  const flags=await pg.query<{forced:boolean;can_insert:boolean;can_update:boolean;can_delete:boolean;can_execute:boolean}>("SELECT c.relforcerowsecurity forced,has_table_privilege(current_user,c.oid,'INSERT') can_insert,has_table_privilege(current_user,c.oid,'UPDATE') can_update,has_table_privilege(current_user,c.oid,'DELETE') can_delete,has_function_privilege(current_user,'maintain_shipment_search_terms()','EXECUTE') can_execute FROM pg_class c WHERE c.relname='shipment_search_terms'");expect(flags.rows[0]).toEqual({forced:true,can_insert:false,can_update:false,can_delete:false,can_execute:false});
  const indexes=await pg.query<{indexname:string}>("SELECT indexname FROM pg_indexes WHERE indexname IN ('entities_goods_document_relation','entities_attempt_trip_relation')");expect(indexes.rows).toHaveLength(2);
 });
});

describe('search migration upgrade',()=>{
 it('backfills existing references using managed-owner privileges and cascades derived source deletion',async()=>{
  const upgrade=new PGlite();try{const root=new URL('../packages/database/src/',import.meta.url);for(const file of (await readdir(root)).filter(name=>/^00[1-4]_.*\.sql$/.test(name)).sort())await upgrade.exec(await readFile(new URL(file,root),'utf8'));
   await upgrade.exec("CREATE ROLE managed_migrator LOGIN CREATEROLE;GRANT cargoorbit_operator TO managed_migrator;GRANT CREATE ON SCHEMA public TO managed_migrator;ALTER TABLE entities OWNER TO managed_migrator;INSERT INTO tenants(id,name) VALUES('before','Before');INSERT INTO entities(tenant_id,kind,id,data) VALUES('before','consignments','old','{\"id\":\"old\",\"lrNumber\":\"LR-existing\",\"invoiceReferences\":[\"GOODS-existing\"]}');GRANT SELECT ON tenants TO managed_migrator;SET ROLE managed_migrator");
   await upgrade.exec(await readFile(new URL('005_shipment_search.sql',root),'utf8'));
   const refs=await upgrade.query<{value:string}>('SELECT value FROM shipment_search_terms ORDER BY value');expect(refs.rows.map(v=>v.value)).toEqual(['GOODS-existing','LR-existing','old']);
   await upgrade.exec("DELETE FROM entities WHERE tenant_id='before'");expect((await upgrade.query('SELECT * FROM shipment_search_terms')).rows).toHaveLength(0);
  }finally{await upgrade.close();}
 });
});

const runtimeUrl=process.env.TEST_DATABASE_URL,adminUrl=process.env.MIGRATION_DATABASE_URL;
(runtimeUrl&&adminUrl?describe:describe.skip)('real PostgreSQL shipment search',()=>{
 let real:Database,admin:Pool,ctx:Context;
 beforeAll(async()=>{if(!/test/i.test(new URL(runtimeUrl!).pathname))throw new Error('Requires an explicitly named test database');admin=new Pool({connectionString:adminUrl});real=new Database(runtimeUrl);ctx={tenantId:`search-${randomUUID()}`,userId:'fixture',role:'owner'};await admin.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[ctx.tenantId,'Disposable shipment search fixture']);});
 afterAll(async()=>{await real?.close();await admin?.end()});
 it('searches indexed shared documents beyond600 inaccessible candidates and reevaluates assignments',async()=>{
  await real.transaction(ctx,async tx=>{await tx.put('goods_documents',{id:'shared',kind:'goods_invoice',number:'COMMON-REFERENCE'});for(let n=0;n<602;n++){const id=String(n).padStart(4,'0');await tx.put('consignments',c(id,{consigneeId:n===601?'org':'hidden'}));await tx.put('goods_document_links',{id:`link-${id}`,documentId:'shared',consignmentId:id});}await tx.put('trips',{id:'trip',driverId:'driver',vehicleNumber:'VEHICLE-OLD'});await tx.put('attempts',{id:'attempt',consignmentId:'0601',tripId:'trip',assignedDriverId:'driver',status:'accepted'});});
  const customerContext:Context={...ctx,role:'customer_admin',organizationId:'org'};expect((await real.transaction(customerContext,tx=>tx.searchConsignments({q:'COMMON-',limit:1}))).items.map(v=>v.id)).toEqual(['0601']);
  const driverContext:Context={...ctx,role:'driver',userId:'driver'};expect((await real.transaction(driverContext,tx=>tx.searchConsignments({q:'VEHICLE'}))).items).toHaveLength(1);
  await real.transaction(ctx,tx=>tx.put('trips',{id:'trip',driverId:'new-driver',vehicleNumber:'VEHICLE-NEW'}));expect((await real.transaction(driverContext,tx=>tx.searchConsignments({q:'VEHICLE'}))).items).toEqual([]);
 });
});
