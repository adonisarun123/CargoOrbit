import 'reflect-metadata';
import type { Context, OutboxEvent } from '@cargoorbit/database';
import { database, workflow } from './runtime.js';
import { config, production } from './config.js';
import { generatePacket } from './packets.js';
import { verifyStorage, readObject, scanBytes } from './storage.js';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function processEvent(ctx:Context,event:OutboxEvent){
 const payload=event.payload as Record<string,unknown>;
 if(event.type==='evidence.scan_requested'){
   const e=await database.transaction(ctx,tx=>tx.get('evidence',String(payload.evidenceId)));
   if(!e||e.scanStatus==='clean'||e.scanStatus==='quarantined')return;
   const result=await scanBytes(await readObject(String(e.objectKey),String(e.objectVersion),String(e.sha256)));
   await workflow.execute(ctx,'markEvidenceScanned',{evidenceId:e.id,status:result.status,scannerReference:result.reference});
   if(result.status==='failed')throw new Error('Evidence scanner unavailable');
   await workflow.execute({...ctx,role:'finance'},'evaluateBilling',{consignmentId:e.consignmentId});return;
 }
 if(event.type==='pod.accepted'){
   await generatePacket(ctx,String(payload.podId||event.aggregateId));
   await workflow.execute({...ctx,role:'finance'},'evaluateBilling',{consignmentId:payload.consignmentId});
   return;
 }
 if(event.type.startsWith('notification.')||event.type==='notification.requested'){
   const url=process.env.NOTIFICATION_WEBHOOK_URL;const token=process.env.NOTIFICATION_WEBHOOK_TOKEN;
   if(!url){if(production)throw new Error('Notification provider unavailable');await database.transaction(ctx,tx=>tx.audit('notification.development_pending',event.id,{channel:payload.channel||'unconfigured'}));return;}
   if(production&&!url.startsWith('https://'))throw new Error('Notification provider must use HTTPS');
   const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'idempotency-key':event.id},body:JSON.stringify({eventId:event.id,...payload}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error(`Notification provider response ${response.status}`);
   const result=await response.json() as Record<string,unknown>;await database.transaction(ctx,tx=>tx.audit('notification.provider_accepted',event.id,{providerReference:result.id||result.reference||'unavailable'}));return;
 }
 // Business events are durable history; only subscribed event types produce side effects.
 await database.transaction(ctx,tx=>tx.audit('outbox.no_subscriber',event.id,{type:event.type}));
}
export async function runWorkerOnce():Promise<number>{
 const requested=process.env.WORKER_TENANT_IDS?.split(',').map(v=>v.trim()).filter(Boolean);
 const tenantIds=requested||((await database.pool.query("SELECT id FROM tenants WHERE status='active' ORDER BY id")).rows.map(row=>String(row.id)));
 let processed=0;
 for(const tenantId of tenantIds){
  if(stopping)break;const ctx:Context={tenantId,userId:'system:worker',role:'owner',correlationId:`worker-${Date.now()}`};
  const event=await database.transaction(ctx,async tx=>{const events=await tx.list<OutboxEvent>('outbox');const item=events.find(e=>['pending','failed','processing'].includes(e.status)&&new Date(e.availableAt).getTime()<=Date.now());if(!item)return undefined;const claimed:OutboxEvent={...item,status:'processing',attempts:item.attempts+1,availableAt:new Date(Date.now()+120000).toISOString()};await tx.put('outbox',claimed);return claimed;});
  if(!event)continue;
  try{await processEvent(ctx,event);await database.transaction(ctx,async tx=>{const current=await tx.get<OutboxEvent>('outbox',event.id);if(current)await tx.put('outbox',{...current,status:'completed',completedAt:new Date().toISOString(),lastError:undefined});});processed++;}
  catch(error){await database.transaction(ctx,async tx=>{const current=await tx.get<OutboxEvent>('outbox',event.id);if(current)await tx.put('outbox',{...current,status:event.attempts>=8?'dead':'failed',lastError:(error as Error).message.slice(0,240),availableAt:new Date(Date.now()+Math.min(3600000,1000*2**event.attempts)).toISOString()});await tx.audit('worker.failed',event.id,{attempts:event.attempts,type:event.type});});console.error(JSON.stringify({level:'error',eventId:event.id,type:event.type,message:'Outbox task failed; retained for retry or operator review'}));}
 }
 return processed;
}
async function main(){await database.assertRuntimeRole();await verifyStorage();console.info('CargoOrbit durable outbox worker started');while(!stopping){const count=await runWorkerOnce();if(!count)await sleep(2000);}await database.close();}
if(process.argv[1]?.endsWith('/worker.js')||process.argv[1]?.endsWith('/worker.ts'))main().catch(error=>{console.error(`Worker startup failed: ${error.message}`);process.exitCode=1;});
