import 'reflect-metadata';
import type { Context, OutboxEvent } from '@cargoorbit/database';
import { database, workflow, expansion } from './runtime.js';
import { OperationsService } from './operations-service.js';
import { TaskService } from './operations-tasks.js';
import { ExportService,cleanupExportStaging } from './export-jobs.js';
import { generatePacket } from './packets.js';
import { verifyStorage, readObject, scanBytes } from './storage.js';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function processEvent(ctx:Context,event:OutboxEvent,signal?:AbortSignal){
 const payload=event.payload as Record<string,unknown>;
 if(event.type==='tenant.export_requested'){await exportService.generate(ctx,String(payload.exportId),signal);return;}
 if(await taskService.businessEvent(ctx,event))return;
 if(['telemetry.alert.created','receiver.unavailable','sync.escalated','compliance.opened','warehouse.reconciliation'].includes(event.type)){await operationsService.tick(ctx);return;}
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
   if(!response.body)throw new Error('Notification provider returned no response');const chunks:Uint8Array[]=[];let size=0;for await(const chunk of response.body as any){size+=chunk.length;if(size>16384)throw new Error('Provider response exceeded limit');chunks.push(chunk)}const result=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>;const reference=String(result.id||result.reference||'');if(!reference||reference.length>200)throw new Error('Notification provider did not return a reference');
   await database.transaction(ctx,async tx=>{const current=await tx.get('notifications',notification.id);if(current&&!['delivered','cancelled'].includes(String(current.status))){current.status='submitted';current.providerReference=reference;current.submittedAt=new Date().toISOString();await tx.put('notifications',current);}await tx.audit('notification.provider_accepted',notification.id,{providerReference:reference});});return;
 }
 // Business events are durable history; only subscribed event types produce side effects.
 await database.transaction(ctx,tx=>tx.audit('outbox.no_subscriber',event.id,{type:event.type}));
}
const operationsService=new OperationsService(database),taskService=new TaskService(database),exportService=new ExportService(database);
const nextSweep=new Map<string,number>();
let exportActive=false,claimTail=Promise.resolve();
async function claimNext(ctx:Context){let release!:()=>void;const previous=claimTail;claimTail=new Promise<void>(resolve=>release=resolve);await previous;try{const event=await database.claimOutbox(ctx,120000,{excludeTypes:exportActive?['tenant.export_requested']:[]});if(event?.type==='tenant.export_requested')exportActive=true;return event;}finally{release()}}

export async function runWorkerOnce():Promise<number>{
 const requested=process.env.WORKER_TENANT_IDS?.split(',').map(v=>v.trim()).filter(Boolean);
 const tenantIds=requested||((await database.pool.query("SELECT id FROM tenants WHERE status='active' ORDER BY id")).rows.map(row=>String(row.id)));
 let processed=0;
 for(const tenantId of tenantIds){
  if(stopping)break;const ctx:Context={tenantId,userId:'system:worker',role:'owner',correlationId:`worker-${Date.now()}`};
  if(Date.now()>=(nextSweep.get(tenantId)||0)){const features=await database.transaction(ctx,tx=>tx.get<any>('configuration','features'));if(features?.enabled?.includes('P2'))await expansion.execute(ctx,'evaluateOperationalRules',{});if(features?.enabled?.includes('P3'))await expansion.execute(ctx,'evaluateHandlingMovements',{});if(features?.enabled?.includes('P4'))await expansion.execute(ctx,'evaluateEnabledMaintenance',{});await operationsService.tick(ctx);nextSweep.set(tenantId,Date.now()+10000);}
  const event=await claimNext(ctx);
  if(!event)continue;
  const controller=new AbortController();let renewing=false;const heartbeat=setInterval(async()=>{if(renewing)return;renewing=true;try{if(!await database.renewOutbox(ctx,event.id,event.leaseToken!,120000))controller.abort(new Error('Outbox lease lost'));}catch{controller.abort(new Error('Outbox lease renewal failed'))}finally{renewing=false}},30000);
  try{await processEvent(ctx,event,controller.signal);controller.signal.throwIfAborted();if(await database.completeOutbox(ctx,event.id,event.leaseToken!))processed++;}
  catch{await database.failOutbox(ctx,event.id,event.leaseToken!,'TASK_PROCESSING_FAILED',8);await database.transaction(ctx,tx=>tx.audit('worker.failed',event.id,{attempts:event.attempts,type:event.type}));console.error(JSON.stringify({level:'error',eventId:event.id,type:event.type,message:'Outbox task failed; retained for retry or operator review'}));}
  finally{clearInterval(heartbeat);if(event.type==='tenant.export_requested')exportActive=false}
 }
 return processed;
}
async function main(){
 await database.assertRuntimeRole();await verifyStorage();await cleanupExportStaging();console.info('CargoOrbit durable outbox worker started');
 // A long export occupies one slot; other slots keep evidence and notifications moving.
 const active=new Set<Promise<void>>();const concurrency=Number(process.env.WORKER_CONCURRENCY||4);
 if(!Number.isInteger(concurrency)||concurrency<2||concurrency>16)throw new Error('WORKER_CONCURRENCY must be between 2 and 16');
 while(!stopping){if(active.size<concurrency){const work=runWorkerOnce().then(()=>undefined).catch(()=>{console.error(JSON.stringify({level:'error',message:'Worker sweep failed; retrying without dropping leased work'}));}).finally(()=>active.delete(work));active.add(work);}await sleep(2000);}
 await Promise.allSettled(active);await database.close();
}
if(process.argv[1]?.endsWith('/worker.js')||process.argv[1]?.endsWith('/worker.ts'))main().catch(error=>{console.error(`Worker startup failed: ${error.message}`);process.exitCode=1;});
