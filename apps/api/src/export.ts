import {createHash} from 'node:crypto';
import {Readable,pipeline} from 'node:stream';
import {createGzip} from 'node:zlib';
import type {Context} from '@cargoorbit/database';
import {database} from './runtime.js';
import {readObject} from './storage.js';
const safe=(s:string)=>createHash('sha256').update(s).digest('hex');
export function tarEntry(path:string,bytes:Buffer){if(!path||Buffer.byteLength(path)>99||path.startsWith('/')||path.split('/').includes('..'))throw new Error('Invalid archive member path');const header=Buffer.alloc(512);header.write(path,0,100,'utf8');const oct=(value:number,width:number)=>value.toString(8).padStart(width-1,'0')+'\0';header.write(oct(0o600,8),100,8);header.write(oct(0,8),108,8);header.write(oct(0,8),116,8);header.write(oct(bytes.length,12),124,12);header.write(oct(0,12),136,12);header.fill(32,148,156);header[156]=48;header.write('ustar\0',257,6);header.write('00',263,2);const checksum=header.reduce((n,v)=>n+v,0);header.write(checksum.toString(8).padStart(6,'0')+'\0 ',148,8);return [header,bytes,Buffer.alloc((512-bytes.length%512)%512)];}
/** Repeatable-read database snapshot; bounded batches and one evidence object in memory at a time. */
export function tenantArchive(ctx:Context){if(ctx.role!=='owner')throw new Error('Tenant owner required for complete data archive');const source=Readable.from(archive(ctx)),gzip=createGzip();pipeline(source,gzip,()=>{ /* Pipeline propagates cancellation and errors to both streams. */ });return gzip;}
async function* archive(ctx:Context):AsyncGenerator<Buffer>{
 await database.transaction(ctx,tx=>tx.audit('tenant.archive.started',ctx.tenantId));
 let committed=false,generated=false,totalBytes=0,records=0,evidenceCount=0;const manifest:Record<string,unknown>[]=[];
 const maximum=Number(process.env.EXPORT_MAX_BYTES||5*1024*1024*1024),maxDuration=Number(process.env.EXPORT_MAX_SECONDS||1800)*1000,maxMembers=Number(process.env.EXPORT_MAX_MEMBERS||100000),started=Date.now();
 if(!Number.isSafeInteger(maximum)||maximum<1||maximum>100*1024*1024*1024||!Number.isSafeInteger(maxDuration)||maxDuration<1000||maxDuration>3600000||!Number.isSafeInteger(maxMembers)||maxMembers<1||maxMembers>250000)throw new Error('Invalid export budget configuration');
 const member=(path:string,bytes:Buffer)=>{totalBytes+=bytes.length;if(totalBytes>maximum||Date.now()-started>maxDuration||manifest.length>=maxMembers)throw new Error('Export budget exceeded; request a partitioned operator export');manifest.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return tarEntry(path,bytes)};
 const client=await database.pool.connect();
 try{
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('statement_timeout','30000',true),set_config('idle_in_transaction_session_timeout','60000',true)",[ctx.tenantId]);
  await client.query("DECLARE cargo_export NO SCROLL CURSOR FOR SELECT kind,id,data FROM entities WHERE tenant_id=current_setting('app.tenant_id') AND kind NOT IN ('challenges','contact_challenges','invitations','operations','uploadOperations','integration_configs','integration_calls','provider_credentials') ORDER BY kind,id");
  while(true){const result=await client.query('FETCH FORWARD 200 FROM cargo_export');if(!result.rowCount)break;
   for(const row of result.rows){const name=createHash('sha256').update(`${row.kind}:${row.id}`).digest('hex');const content=Buffer.from(JSON.stringify({kind:row.kind,id:row.id,data:row.data}));for(const b of member(`records/${name}.json`,content))yield b;records++;
    if(row.kind==='evidence'||row.kind==='packets'){if(row.kind==='evidence'&&row.data.scanStatus!=='clean')continue;const bytes=await readObject(row.data.objectKey,row.data.objectVersion,row.data.sha256);for(const b of member(`objects/${name}.bin`,bytes))yield b;evidenceCount++;}
   }
  }
  await client.query('CLOSE cargo_export');await client.query("DECLARE audit_export NO SCROLL CURSOR FOR SELECT * FROM audit_events WHERE tenant_id=current_setting('app.tenant_id') ORDER BY created_at,id");
  while(true){const result=await client.query('FETCH FORWARD 200 FROM audit_export');if(!result.rowCount)break;for(const row of result.rows){for(const b of member(`audit/${safe(row.id)}.json`,Buffer.from(JSON.stringify(row))))yield b;}}
  await client.query('COMMIT');committed=true;
  const summary=Buffer.from(JSON.stringify({format:'cargoorbit-tenant-archive-v1',tenantId:ctx.tenantId,createdAt:new Date(started).toISOString(),records,evidenceCount,totalBytes,quarantinedObjectsIncluded:false,excluded:['authentication_challenges_and_tokens','provider_configuration_and_raw_results','quarantined_object_bytes'],files:manifest},null,2));for(const b of tarEntry('manifest.json',summary))yield b;yield Buffer.alloc(1024);generated=true;
 }finally{if(!committed)await client.query('ROLLBACK').catch(()=>undefined);client.release();await database.transaction(ctx,tx=>tx.audit(generated?'tenant.archive.generated':'tenant.archive.interrupted',ctx.tenantId,{records,evidenceCount,totalBytes}));}
}
