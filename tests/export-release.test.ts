import {beforeEach,describe,expect,it,vi} from 'vitest';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const fixture=vi.hoisted(()=>({rows:[] as any[],audit:[] as any[],queries:[] as string[],reads:0,releases:0,fail:false,events:[] as string[]}));
vi.mock('../apps/api/src/runtime.js',()=>({database:{
 transaction:async(_ctx:unknown,fn:any)=>fn({audit:async(action:string)=>fixture.events.push(action)}),
 pool:{connect:async()=>({release:()=>fixture.releases++,query:async(sql:string)=>{fixture.queries.push(sql);if(sql.startsWith('FETCH FORWARD 200 FROM cargo_export')){if(fixture.fail)throw new Error('Snapshot unavailable');return {rows:fixture.reads++?[]:fixture.rows,rowCount:fixture.reads===1?fixture.rows.length:0}}if(sql.startsWith('FETCH FORWARD 200 FROM audit_export')){const rows=fixture.audit.splice(0);return {rows,rowCount:rows.length}}return {rows:[],rowCount:0}}})}
}}));
vi.mock('../apps/api/src/storage.js',()=>({readObject:async()=>Buffer.from('original bytes')}));
import {tenantArchive,tarEntry} from '../apps/api/src/export';
const actor={tenantId:'tenant',userId:'owner',role:'owner' as const};
function entries(tar:Buffer){const result=new Map<string,Buffer>();let at=0;while(at+512<=tar.length){const h=tar.subarray(at,at+512),path=h.subarray(0,100).toString().replace(/\0.*$/s,'');if(!path)break;const size=parseInt(h.subarray(124,136).toString().replace(/\0.*$/s,''),8);result.set(path,tar.subarray(at+512,at+512+size));at+=512+Math.ceil(size/512)*512;}return result;}
beforeEach(()=>{fixture.rows=[];fixture.audit=[];fixture.queries=[];fixture.reads=0;fixture.releases=0;fixture.fail=false;fixture.events=[]});
describe('Authenticated tenant export',()=>{
 it('emits a valid hashed archive from one tenant snapshot with clean exact originals',async()=>{
  fixture.rows=[{kind:'consignments',id:'c',data:{id:'c'}},{kind:'evidence',id:'e',data:{id:'e',scanStatus:'clean',objectKey:'exact/key',objectVersion:'version1',sha256:'hash'}},{kind:'evidence',id:'q',data:{id:'q',scanStatus:'quarantined'}}];fixture.audit=[{id:'event',action:'pod.sealed'}];
  const chunks=[];for await(const chunk of tenantArchive(actor))chunks.push(chunk as Buffer);const files=entries(gunzipSync(Buffer.concat(chunks)));const manifest=JSON.parse(files.get('manifest.json')!.toString());expect(manifest.records).toBe(3);expect(manifest.evidenceCount).toBe(1);for(const file of manifest.files)expect(createHash('sha256').update(files.get(file.path)!).digest('hex')).toBe(file.sha256);
  expect(fixture.queries.join('\n')).toContain("'contact_challenges'");expect(fixture.queries.join('\n')).toContain('REPEATABLE READ READ ONLY');expect(fixture.releases).toBe(1);expect(fixture.events).toEqual(['tenant.archive.started','tenant.archive.generated']);
 });
 it('propagates snapshot failures and releases the connection without claiming completion',async()=>{fixture.fail=true;await expect((async()=>{for await(const _ of tenantArchive(actor)){/* Consume stream to surface failure. */}})()).rejects.toThrow('Snapshot unavailable');expect(fixture.releases).toBe(1);expect(fixture.queries).toContain('ROLLBACK');expect(fixture.events).toContain('tenant.archive.interrupted')});
 it('refuses non-owner exports and unsafe or oversized tar paths',()=>{expect(()=>tenantArchive({...actor,role:'auditor'})).toThrow(/owner/);expect(()=>tarEntry('../outside',Buffer.alloc(0))).toThrow();expect(()=>tarEntry('é'.repeat(60),Buffer.alloc(0))).toThrow();const chunks=tarEntry('record.json',Buffer.from('ok'));expect(chunks.reduce((n,b)=>n+b.length,0)).toBe(1024)});
});
