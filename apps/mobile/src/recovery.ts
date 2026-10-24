import {captureAllowed,normalizeScan,validateDispositions} from './policy';
import type {Attempt,Disposition,Operation,WorkSnapshot} from './types';

/** Exact matching only. Ambiguous labels require an explicit stop selection. */
export function resolveCachedBarcode(value:string,snapshot:WorkSnapshot):Attempt[]{
 const trimmed=value.trim();if(!trimmed||trimmed.length>512)throw new Error('Label is empty or too long.');
 // URL labels must be registered verbatim. An arbitrary host cannot claim a matching final path segment.
 const identifier=/^https?:\/\//i.test(trimmed)?trimmed:normalizeScan(trimmed),ids=new Set<string>();
 for(const c of snapshot.consignments)if(c.id===identifier||c.lrNumber===identifier||c.invoiceReferences?.includes(identifier))ids.add(c.id);
 for(const mapping of snapshot.barcodes||[])if(mapping.code===identifier)for(const id of mapping.consignmentIds)if(snapshot.consignments.some(c=>c.id===id))ids.add(id);
 return snapshot.attempts.filter(a=>!['accepted','refused','cancelled','transferred'].includes(a.status)&&(ids.has(a.consignmentId)||a.id===identifier));
}

export function heldDraftContext(original:Operation,snapshot:WorkSnapshot,now=Date.now()){
 if(original.kind!=='draft'||original.state!=='failed'||original.retryable||original.replacedBy)throw new Error('Only an unresolved held receipt draft can be reviewed.');
 if(!captureAllowed(snapshot,now)||now-Date.parse(snapshot.fetchedAt)>5*60*1000)throw new Error('Refresh assigned work before reviewing a conflict; comparisons expire after five minutes.');
 const attempt=snapshot.attempts.find(a=>a.id===original.payload.attemptId&&a.consignmentId===original.consignmentId);
 const consignment=snapshot.consignments.find(c=>c.id===original.consignmentId);
 if(!attempt||!consignment)throw new Error('This attempt is no longer assigned. Escalate the retained capture to operations.');
 if(['accepted','refused','cancelled','transferred'].includes(attempt.status))throw new Error('The attempt has closed. Escalate; a local draft cannot replace an authorized receipt.');
 const versions=snapshot.pods.filter(p=>p.attemptId===attempt.id).sort((a,b)=>b.version-a.version),pod=versions[0];
 if(pod&&pod.status!=='draft')throw new Error('The current server receipt is finalized. Operations must create an approved correction.');
 return {attempt,consignment,pod};
}

/** Rebase is explicit and creates a new operation. It never edits the retained source or accepts POD. */
export function draftReplacement(original:Operation,snapshot:WorkSnapshot,lines:Disposition[],reason:string,now=Date.now()):Record<string,unknown>{
 if(reason.trim().length<5||reason.length>1000)throw new Error('Record a review reason of 5 to 1000 characters.');
 const {attempt,pod}=heldDraftContext(original,snapshot,now);
 const priorExceptions=Array.isArray(original.payload.exceptions)?structuredClone(original.payload.exceptions):[];
 const reservations=[...new Map([...(pod?.exceptions||[]),...priorExceptions].map(value=>[JSON.stringify(value),value])).values()];
 validateDispositions(attempt,lines,reason);
 return {consignmentId:original.consignmentId,attemptId:attempt.id,...(pod?{podId:pod.id}:{}),expectedVersion:pod?.version||0,lines:structuredClone(lines),
 exceptions:[...reservations,{reason:`Driver conflict review: ${reason.trim()}`}],
 evidenceIds:[...new Set([...(pod?.evidenceIds||[]),...(Array.isArray(original.payload.evidenceIds)?original.payload.evidenceIds:[])])],
 photoOperationIds:Array.isArray(original.payload.photoOperationIds)?[...original.payload.photoOperationIds]:[],
 unexpectedOverdelivery:Array.isArray(original.payload.unexpectedOverdelivery)?structuredClone(original.payload.unexpectedOverdelivery):[],refused:original.payload.refused===true};
}

/** Hash original payload separately; no raw evidence or authentication data enters the support task. */
export function escalationPayload(original:Operation,reason:string,payloadHash:string,idempotencyKey:string){
 if(original.state==='synchronized')throw new Error('A synchronized operation is not a sync failure.');
 if(reason.trim().length<10||reason.length>1000)throw new Error('Explain the problem in 10 to 1000 characters.');
 if(!/^[a-f0-9]{64}$/.test(payloadHash))throw new Error('The retained capture checksum is invalid.');
 return {clientOperationId:original.id,kind:original.kind,consignmentId:original.consignmentId,...(typeof original.payload.attemptId==='string'?{attemptId:original.payload.attemptId}:{}),errorCode:original.errorCode||'SYNC_FAILED',reason:reason.trim(),payloadHash,idempotencyKey};
}
