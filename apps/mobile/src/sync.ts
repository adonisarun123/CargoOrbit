import {ApiError} from './session-client';
import {errorMessage,retryAt,shouldRetry} from './policy';
import type {Operation,QueuePort} from './types';
export interface SyncTransport {postAction(action:string,input:unknown,operationId:string):Promise<Record<string,unknown>>;uploadPhoto(operation:Operation,base64:string):Promise<Record<string,unknown>>;}
export interface SyncResult {uploaded:number;failed:number;held:number;authenticationRequired:boolean;}
/** Stopping is permanent: a stale network listener cannot restart an old account's queue. */
export class SyncEngine {
 private running:Promise<SyncResult>|null=null;
 private stopped=false;
 constructor(private queue:QueuePort,private transport:SyncTransport,private now:()=>number=Date.now){}
 stop():Promise<SyncResult|null>{this.stopped=true;return this.running||Promise.resolve(null);}
 sync(onProgress?:()=>void,manual=false):Promise<SyncResult>{
  if(this.stopped)return Promise.resolve({uploaded:0,failed:0,held:0,authenticationRequired:false});
  if(this.running)return this.running;
  this.running=this.run(onProgress,manual).finally(()=>{this.running=null;});return this.running;
 }
 private async run(onProgress:(()=>void)|undefined,manual:boolean):Promise<SyncResult>{
  const result:SyncResult={uploaded:0,failed:0,held:0,authenticationRequired:false};
  const all=await this.queue.list();result.held=all.filter(op=>op.state!=='synchronized'&&!op.retryable).length;
  const items=all.filter(op=>shouldRetry(op,this.now(),manual)).sort((a,b)=>(a.kind==='photo'?0:1)-(b.kind==='photo'?0:1)||a.createdAt.localeCompare(b.createdAt));
  for(const op of items){if(this.stopped)break;try{
   await this.queue.markUploading(op.id);onProgress?.();let response:Record<string,unknown>;
   if(op.kind==='photo')response=await this.transport.uploadPhoto(op,await this.queue.mediaBase64(op.id));
   else {const payload=structuredClone(op.payload);if(op.kind==='draft'){
    const photoIds=Array.isArray(payload.photoOperationIds)?payload.photoOperationIds as string[]:[];
    const evidenceIds=Array.isArray(payload.evidenceIds)?[...payload.evidenceIds] as string[]:[];
    for(const id of photoIds){const photo=await this.queue.get(id);if(!photo||photo.kind!=='photo'||photo.consignmentId!==op.consignmentId)throw new ApiError(409,'Linked photo does not belong to this receipt. Operations must review it.','PHOTO_SCOPE');if(photo.state!=='synchronized'||!photo.serverId){if(photo.retryable===false)throw new ApiError(409,'A linked photo needs operations review.','PHOTO_HELD');throw new Error('Linked photo is awaiting synchronization.');}evidenceIds.push(photo.serverId);}
    delete payload.photoOperationIds;payload.evidenceIds=[...new Set(evidenceIds)];
   }response=await this.transport.postAction(op.kind==='event'?'recordEvent':'saveDraft',payload,op.id);}
   const entity=typeof response.evidence==='object'&&response.evidence?response.evidence as Record<string,unknown>:response;
   if(typeof entity.id!=='string'||!entity.id)throw new Error('Server did not acknowledge a stable record ID. Capture retained for retry.');
   await this.queue.markSynced(op.id,entity.id);result.uploaded++;
  }catch(error){
   const denied=error instanceof ApiError&&[400,403,404,409,410,413,415,422].includes(error.status);
   const authentication=error instanceof ApiError&&error.status===401;
   const message=denied?`${errorMessage(error)} Retained on device for operations review; automatic retry stopped.`:errorMessage(error);
   await this.queue.markFailed(op.id,message,{retryable:!denied,nextAttemptAt:denied?null:retryAt(op.attempts+1,this.now())});result.failed++;
   if(denied)result.held++;if(authentication){result.authenticationRequired=true;break;}
  }finally{onProgress?.();}}
  return result;
 }
}
