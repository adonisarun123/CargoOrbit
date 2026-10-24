import { ApiError, postAction, uploadPhoto } from './api';
import { errorMessage } from './policy';
import type { Session, Operation } from './types';
import type { EncryptedQueue } from './storage';

export interface SyncResult { uploaded:number; failed:number; authenticationRequired:boolean; }
// One instance per mounted account; closing is awaited before switching accounts.
export class SyncEngine {
  private running:Promise<SyncResult>|null=null;
  private stopped=false;
  constructor(private readonly queue:EncryptedQueue,private readonly session:Session) {}
  stop():Promise<SyncResult|null> {this.stopped=true;return this.running||Promise.resolve(null);}
  sync(onProgress?:()=>void):Promise<SyncResult> {
    if (this.running) return this.running;
    this.stopped=false;this.running=this.run(onProgress).finally(()=>{this.running=null;});return this.running;
  }
  private async run(onProgress?:()=>void):Promise<SyncResult> {
    const result:SyncResult={uploaded:0,failed:0,authenticationRequired:false};
    // Photos precede any draft that refers to them. Within each kind use original capture order.
    const all=await this.queue.list();
    const items=all.filter(op=>op.state!=='synchronized').sort((a,b)=>(a.kind==='photo'?0:1)-(b.kind==='photo'?0:1)||a.createdAt.localeCompare(b.createdAt));
    for (const op of items) {
      if (this.stopped) break;
      try {
        await this.queue.markUploading(op.id);onProgress?.();
        let response:Record<string,unknown>;
        if (op.kind==='photo') response=await uploadPhoto(this.session,op,await this.queue.mediaBase64(op.id));
        else {
          const payload={...op.payload};
          if (op.kind==='draft') {
            const photoOperationIds=Array.isArray(payload.photoOperationIds)?payload.photoOperationIds as string[]:[];
            const evidenceIds=Array.isArray(payload.evidenceIds)?payload.evidenceIds as string[]:[];
            for (const id of photoOperationIds) {
              const photo=await this.queue.get(id);
              if (!photo?.serverId || photo.state!=='synchronized') throw new Error('A linked photo has not uploaded. Retry photos first.');
              evidenceIds.push(photo.serverId);
            }
            delete payload.photoOperationIds;payload.evidenceIds=[...new Set(evidenceIds)];
          }
          response=await postAction(this.session,op.kind==='event'?'recordEvent':'saveDraft',payload,op.id);
        }
        const entity=typeof response.evidence==='object'&&response.evidence?response.evidence as Record<string,unknown>:response;
        await this.queue.markSynced(op.id,typeof entity.id==='string'?entity.id:undefined);result.uploaded++;
      } catch(error) {
        const conflict=error instanceof ApiError && error.status===409;
        await this.queue.markFailed(op.id,conflict?'The server has a newer version. Operations must review this draft; retrying will not overwrite it.':errorMessage(error));result.failed++;
        if (error instanceof ApiError && (error.status===401||error.status===403)) {result.authenticationRequired=true;break;}
      } finally {onProgress?.();}
    }
    return result;
  }
}
