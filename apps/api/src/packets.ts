import { storeObject } from './storage.js';
import { database } from './runtime.js';
import { hashPayload } from '@cargoorbit/domain';
import type { Context, Entity } from '@cargoorbit/database';
import {renderReceipt,type SealedReceipt} from './packet-renderer.js';
export async function generatePacket(ctx:Context,podId:string){
 const source=await database.transaction(ctx,async tx=>({pod:await tx.get<Entity>('pods',podId),packet:await tx.get<Entity>('packets',podId)}));
 if(source.packet)return source.packet;
 const pod=source.pod;
 if(!pod||!['accepted','accepted_with_exceptions','refused'].includes(String(pod.status))||!pod.acceptedPayload)throw new Error('POD is not sealed');
 if(hashPayload(pod.acceptedPayload)!==pod.payloadHash)throw new Error('POD integrity check failed');
 const manifest={format:'cargoorbit-pod-manifest-v2',podId,version:pod.version,tenantId:ctx.tenantId,payloadHash:pod.payloadHash,acceptedAt:pod.acceptedAt,payload:pod.acceptedPayload};
 const pdf=await renderReceipt(pod as unknown as SealedReceipt);
 const stored=await storeObject(`${ctx.tenantId}/packets/${podId}`,pdf,'application/pdf');
 const packet:Entity={id:podId,podId,...stored,manifest,generatedAt:new Date().toISOString()};
 return database.transaction(ctx,async tx=>{const existing=await tx.get<Entity>('packets',podId);if(existing)return existing;await tx.put('packets',packet);await tx.audit('packet.generated',podId,{sha256:stored.sha256});return packet;});
}
