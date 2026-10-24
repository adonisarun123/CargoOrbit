import PDFDocument from 'pdfkit';
import { readObject, storeObject } from './storage.js';
import { database } from './runtime.js';
import type { Context, Entity } from '@cargoorbit/database';
function stringify(value:unknown){return value===undefined||value===null?'—':typeof value==='object'?JSON.stringify(value):String(value);}
export async function generatePacket(ctx:Context,podId:string){
 const source=await database.transaction(ctx,async tx=>({pod:await tx.get<Entity>('pods',podId),packet:await tx.get<Entity>('packets',podId)}));
 if(source.packet)return source.packet;
 const pod=source.pod;if(!pod||!['accepted','accepted_with_exceptions','refused'].includes(String(pod.status))||!pod.acceptedPayload)throw new Error('POD is not sealed for packet generation');
 const payload=pod.acceptedPayload as Record<string,unknown>;const manifest={format:'cargoorbit-pod-manifest-v1',podId,version:pod.version,tenantId:ctx.tenantId,payloadHash:pod.payloadHash,acceptedAt:pod.acceptedAt,payload};
 const document=new PDFDocument({size:'A4',margin:44,info:{Title:`CargoOrbit Proof of Delivery ${podId}`,Author:'CargoOrbit'}});const chunks:Buffer[]=[];const bytes=new Promise<Buffer>((resolve,reject)=>{document.on('data',chunk=>chunks.push(chunk));document.on('end',()=>resolve(Buffer.concat(chunks)));document.on('error',reject);});
 const title=(text:string)=>{if(document.y>725)document.addPage();document.moveDown().fillColor('#172b45').font('Helvetica-Bold').fontSize(11).text(text).moveDown(0.4);};
 const line=(label:string,value:unknown)=>{if(document.y>735)document.addPage();document.font('Helvetica-Bold').fontSize(9).fillColor('#52617a').text(label.toUpperCase(),{continued:false});document.font('Helvetica').fontSize(10).fillColor('#172b45').text(stringify(value),{width:505}).moveDown(0.5);};
 document.fillColor('#0b63ce').font('Helvetica-Bold').fontSize(26).text('CargoOrbit');document.fontSize(18).fillColor('#172b45').text('Proof of delivery');document.font('Helvetica').fontSize(10).fillColor('#52617a').text(`Sealed record · Version ${pod.version} · ${stringify(pod.acceptedAt)}`);
 title('Document identity');line('POD ID',pod.id);line('Consignment',pod.consignmentId);line('Delivery attempt',pod.attemptId);line('Receipt status',pod.status);
 title('Acknowledged receipt');const items=Array.isArray(payload.lines)?payload.lines:Array.isArray(pod.lines)?pod.lines:[];for(const item of items)line('Receipt line',item);
 title('Reservations');line('Exceptions',payload.exceptions||pod.exceptions||[]);
 title('Authorization and declaration');line('Receiver authority snapshot',payload.grantSnapshot||pod.grantSnapshot);line('Declaration',payload.declaration||'Receipt is subject to the recorded reservations. Physical receipt does not itself approve freight charges.');
 title('Integrity');line('Accepted payload SHA-256',pod.payloadHash);line('Acknowledged evidence',payload.evidence||payload.attachments||pod.evidenceIds||[]);
 document.moveDown().fontSize(8).fillColor('#52617a').text('This PDF presents the immutable acknowledged data version. Verify through authenticated CargoOrbit access and its machine readable manifest. The manifest is the exact data source; no government or independent signature certification is implied.');document.end();
 const pdf=await bytes;const stored=await storeObject(`${ctx.tenantId}/packets/${podId}`,pdf,'application/pdf');
 const packet:Entity={id:podId,podId,...stored,manifest,generatedAt:new Date().toISOString()};
 return database.transaction(ctx,async tx=>{const existing=await tx.get<Entity>('packets',podId);if(existing)return existing;await tx.put('packets',packet);await tx.audit('packet.generated',podId,{sha256:stored.sha256});return packet;});
}
