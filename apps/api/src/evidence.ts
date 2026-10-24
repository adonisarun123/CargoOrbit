import { HttpException } from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import type { Context, Entity } from '@cargoorbit/database';
import { database, workflow } from './runtime.js';
import { readObject, scanBytes, sha256, sniffMime, storeObject } from './storage.js';
const uploadSchema=z.object({consignmentId:z.string().min(1).max(100),clientOperationId:z.string().uuid(),documentType:z.enum(['photo','work_copy','goods_invoice','grn','other']).default('photo'),capturedAt:z.string().datetime().optional(),captureMethod:z.enum(['camera','upload','android','import']).default('upload')});
export async function uploadEvidence(actor:Context,file:Express.Multer.File|undefined,body:unknown){
 const input=uploadSchema.parse(body);if(!file)throw new HttpException('Attach one image or PDF using the file field',400);
 if(file.size>10*1024*1024)throw new HttpException('Evidence file exceeds 10 MB',413);
 const mime=sniffMime(file.buffer);if(!mime)throw new HttpException('Only JPEG, PNG, WebP or PDF evidence is supported',415);
 const safeName=file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'evidence';
 // Domain query enforces facility/customer/driver visibility before storing any bytes.
 const consignment=await workflow.query(actor,'consignments',input.consignmentId);if(!consignment)throw new HttpException('Consignment unavailable',404);
 const opId=`${actor.userId}:${input.clientOperationId}`;const hash=sha256(file.buffer);
 const prior=await database.transaction(actor,tx=>tx.get<Entity>('uploadOperations',opId));
 if(prior){if(prior.sha256!==hash||prior.consignmentId!==input.consignmentId)throw new HttpException('Operation identifier reused with different evidence',409);return database.transaction(actor,tx=>tx.get('evidence',String(prior.evidenceId)));}
 const id=createHash('sha256').update(`${actor.tenantId}:${opId}`).digest('hex');const stored=await storeObject(`${actor.tenantId}/originals/${id}`,file.buffer,mime);
 const evidence=await workflow.execute(actor,'recordEvidence',{id,consignmentId:input.consignmentId,filename:safeName,mimeType:mime,size:file.size,...stored,captureMethod:input.captureMethod,capturedAt:input.capturedAt,documentType:input.documentType});
 await database.transaction(actor,async tx=>{const existing=await tx.get<Entity>('uploadOperations',opId);if(existing&&existing.sha256!==hash)throw new HttpException('Concurrent upload conflict',409);if(!existing)await tx.put('uploadOperations',{id:opId,evidenceId:id,sha256:hash,consignmentId:input.consignmentId});});
 // Scan inline for immediate feedback. Failed scans remain quarantined from receipt gates.
 const result=await scanBytes(file.buffer);await workflow.execute({...actor,role:'owner'},'markEvidenceScanned',{evidenceId:id,status:result.status,scannerReference:result.reference});
 return {...(evidence as Record<string,unknown>),scanStatus:result.status};
}
export async function evidenceDownload(actor:Context,id:string){const evidence=await workflow.query(actor,'evidence',id) as Record<string,unknown>|null;if(!evidence||evidence.scanStatus!=='clean')throw new HttpException('Evidence unavailable or not scan clean',404);return {bytes:await readObject(String(evidence.objectKey),String(evidence.objectVersion),String(evidence.sha256)),mime:String(evidence.mimeType),filename:String(evidence.filename)};}
export async function packetDownload(actor:Context,id:string,manifest=false){
 await workflow.query(actor,'pods',id);
 const packet=await database.transaction(actor,tx=>tx.get<Entity>('packets',id));if(!packet)throw new HttpException('Evidence packet pending worker processing',404);
 await database.transaction(actor,tx=>tx.audit('packet.download',id,{format:manifest?'manifest':'pdf'}));
 if(manifest)return {bytes:Buffer.from(JSON.stringify(packet.manifest,null,2)),mime:'application/json',filename:`POD-${id}.json`};
 return {bytes:await readObject(String(packet.objectKey),String(packet.objectVersion),String(packet.sha256)),mime:'application/pdf',filename:`POD-${id}.pdf`};
}
