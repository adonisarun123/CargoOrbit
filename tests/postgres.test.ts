import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
let pg:PGlite;
beforeAll(async()=>{pg=new PGlite();await pg.exec(await readFile(new URL('../packages/database/src/001_initial.sql',import.meta.url),'utf8'));await pg.exec("INSERT INTO tenants(id,name) VALUES('a','A'),('b','B');SET ROLE cargoorbit_app;");});
afterAll(async()=>{await pg.close()});
async function context(tenant:string){await pg.query("SELECT set_config('app.tenant_id',$1,false)",[tenant])}
describe('PostgreSQL migration enforcement (PGlite PostgreSQL engine)',()=>{
 it('restricts reads and writes with forced RLS',async()=>{await context('a');await pg.query("INSERT INTO entities(tenant_id,kind,id,data) VALUES('a','test','x',$1)",[JSON.stringify({id:'x'})]);await context('b');expect((await pg.query("SELECT * FROM entities WHERE id='x'")).rows).toHaveLength(0);await expect(pg.query("INSERT INTO entities(tenant_id,kind,id,data) VALUES('a','test','bad',$1)",[JSON.stringify({id:'bad'})])).rejects.toThrow(/row-level security/)});
 it('denies reads when tenant context is empty',async()=>{await context('');expect((await pg.query('SELECT * FROM entities')).rows).toHaveLength(0)});
 it('makes accepted POD immutable at the SQL boundary',async()=>{await context('a');await pg.query("INSERT INTO entities(tenant_id,kind,id,data) VALUES('a','pods','p',$1)",[JSON.stringify({id:'p',acceptedPayload:{quantity:10}})]);await expect(pg.exec("UPDATE entities SET data=jsonb_set(data,'{quantity}','20') WHERE id='p'")).rejects.toThrow(/immutable/);await expect(pg.exec("DELETE FROM entities WHERE id='p'")).rejects.toThrow(/immutable/)});
 it('does not grant audit mutation to runtime role',async()=>{await context('a');await pg.exec("INSERT INTO audit_events(tenant_id,id,actor_id,role,action,target,correlation_id) VALUES('a','audit1','u','owner','created','x','c')");await expect(pg.exec("DELETE FROM audit_events WHERE id='audit1'")).rejects.toThrow(/permission denied/)});
 it('preserves outbox identity while permitting retry lifecycle',async()=>{await context('a');await pg.exec("INSERT INTO outbox_events(tenant_id,id,type,aggregate_id,payload) VALUES('a','event1','pod.accepted','p','{}')");await pg.exec("UPDATE outbox_events SET status='processing',attempts=1 WHERE id='event1'");await expect(pg.exec("UPDATE outbox_events SET payload='{\"changed\":true}' WHERE id='event1'")).rejects.toThrow(/immutable/)});
});
