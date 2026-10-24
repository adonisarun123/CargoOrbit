import 'reflect-metadata';
import type { Context, OutboxEvent } from '@cargoorbit/database';
import { database, workflow } from './runtime.js';
import { OperationsService } from './operations-service.js';
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
 if(event.type==='notification.requested'){
   const notification=await operationsService.prepareNotification(ctx,String(payload.notificationId));
   if(!notification||['cancelled','submitted','delivered'].includes(String(notification.status)))return;
   const url=process.env.NOTIFICATION_WEBHOOK_URL,token=process.env.NOTIFICATION_WEBHOOK_TOKEN;
   if(!url||!token)throw new Error('Notification provider is not configured');
   if(!url.startsWith('https://'))throw new Error('Notification provider must use HTTPS');
   const response=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json','authorization':`Bearer ${token}`,'idempotency-key':notification.id},body:JSON.stringify({eventId:event.id,notificationId:notification.id,tenantId:ctx.tenantId,channel:notification.channel,contact:notification.contact,message:notification.message}),signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw new Error('Notification provider rejected request');
   const result=await response.json() as Record<string,unknown>;const reference=String(result.id||result.reference||'');if(!reference||reference.length>200)throw new Error('Notification provider did not return a reference');
   await database.transaction(ctx,async tx=>{const current=await tx.get('notifications',notification.id);if(current&&!['delivered','cancelled'].includes(String(current.status))){current.status='submitted';current.providerReference=reference;current.submittedAt=new Date().toISOString();await tx.put('notifications',current);}await tx.audit('notification.provider_accepted',notification.id,{providerReference:reference});});return;
 }
 // Business events are durable history; only subscribed event types produce side effects.
 await database.transaction(ctx,tx=>tx.audit('outbox.no_subscriber',event.id,{type:event.type}));
}
const operationsService=new OperationsService(database);
const nextSweep=new Map<string,number>();
export async function runWorkerOnce():Promise<number>{
 const requested=process.env.WORKER_TENANT_IDS?.split(',').map(v=>v.trim()).filter(Boolean);
 const tenantIds=requested||((await database.pool.query("SELECT id FROM tenants WHERE status='active' ORDER BY id")).rows.map(row=>String(row.id)));
 let processed=0;
 for(const tenantId of tenantIds){
  if(stopping)break;const ctx:Context={tenantId,userId:'system:worker',role:'owner',correlationId:`worker-${Date.now()}`};
  if(Date.now()>=(nextSweep.get(tenantId)||0)){await operationsService.tick(ctx);nextSweep.set(tenantId,Date.now()+60000);}
  const event=await database.claimOutbox(ctx,120000);
  if(!event)continue;
  try{await processEvent(ctx,event);if(await database.completeOutbox(ctx,event.id,event.leaseToken!))processed++;}
  catch{await database.failOutbox(ctx,event.id,event.leaseToken!,'TASK_PROCESSING_FAILED',8);await database.transaction(ctx,tx=>tx.audit('worker.failed',event.id,{attempts:event.attempts,type:event.type}));console.error(JSON.stringify({level:'error',eventId:event.id,type:event.type,message:'Outbox task failed; retained for retry or operator review'}));}
 }
 return processed;
}
async function main(){await database.assertRuntimeRole();await verifyStorage();console.info('CargoOrbit durable outbox worker started');while(!stopping){const count=await runWorkerOnce();if(!count)await sleep(2000);}await database.close();}
if(process.argv[1]?.endsWith('/worker.js')||process.argv[1]?.endsWith('/worker.ts'))main().catch(error=>{console.error(`Worker startup failed: ${error.message}`);process.exitCode=1;});
