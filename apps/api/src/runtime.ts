import {createHmac} from 'node:crypto';
import {HttpException} from '@nestjs/common';
import { Database } from '@cargoorbit/database';
import { WorkflowService,ContractUsageService } from '@cargoorbit/domain';
import { AuthService, AuthGuard } from './auth.js';
import { config, production } from './config.js';
import {createIntegrationService} from './integrations/index.js';
import {OidcService} from './oidc-service.js';
import {VerifiedOidcTransport,parseOidcConfigurations} from './oidc-client.js';
import {AccessService} from './access-service.js';
import { ExpansionService } from './expansion/index.js';
export const database=new Database();
export const devOtps=new Map<string,{code:string;expiresAt:number}>();
export async function deliverOtp(contact:string,code:string,purpose='cargoorbit-pod'):Promise<void|{reference:string}>{
 if(!production&&!config.smsUrl){for(const [key,value] of devOtps)if(value.expiresAt<Date.now())devOtps.delete(key);if(devOtps.size>=1000)throw new Error('Development OTP capacity reached');devOtps.set(contact,{code,expiresAt:Date.now()+300000});return;}
 if(!config.smsUrl)throw new Error('OTP provider unavailable');
 const response=await fetch(config.smsUrl,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.smsToken}`,'idempotency-key':createHmac('sha256',config.otpSecret).update(`${purpose}:${contact}:${code}:${Math.floor(Date.now()/300000)}`).digest('hex')},body:JSON.stringify({contact,code,purpose,expiresIn:300}),signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!response.ok)throw new Error('OTP provider rejected delivery');let text='';if(response.body){const reader=response.body.getReader(),decoder=new TextDecoder();let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>8192){await reader.cancel();throw new Error('OTP provider response exceeded limit')}text+=decoder.decode(part.value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}}let result:{reference?:unknown;id?:unknown;messageId?:unknown};try{result=text?JSON.parse(text):{}}catch{throw new Error('OTP provider response invalid')}const reference=result.reference??result.messageId??result.id;if(typeof reference==='string'&&reference.length>0&&reference.length<=200)return {reference};if(production)throw new Error('OTP provider must return a delivery reference');
}
export const workflow=new WorkflowService(database,{otpSecret:config.otpSecret,deliverOtp,validateReceiver:async(ctx,i,tx)=>{
 const u=await database.verifyReceiver(tx,i.userId,i.organizationId),contact=u?.contact_verified_at?u.verified_contact||u.email:!production?u?.email:undefined;
 if(!u||!contact||contact.toLowerCase()!==i.contact.toLowerCase()||u.facility_ids?.length&&!u.facility_ids.includes(i.facilityId))throw new HttpException('Grant requires an active receiver, their verified contact and an authorized facility',400);
}});
export const auth=new AuthService(database);
AuthGuard.service=auth;
export const expansion=new ExpansionService(database);

export const integrations=createIntegrationService(database);

export const access=new AccessService(database,{
 supportPrincipal:async userId=>(await database.pool.query("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.id=$1 AND u.status='active' AND u.mfa_enabled=true AND m.status='active' AND m.role='platform_admin' AND t.status='active' LIMIT 1",[userId])).rows.length===1,
 receiverContact:async(tx,userId,organizationId)=>{const u=await database.verifyReceiver(tx,userId,organizationId);const contact=u?.contact_verified_at?u.verified_contact||u.email:!production?u?.email:undefined;return u&&contact?{contact,facilityIds:u.facility_ids}:undefined},
 publicTransaction:(source,callback)=>database.capabilityTransaction(source,callback),
 supportTransaction:(source,target,callback)=>database.supportTransaction(source,target,callback),
 deliverInvitation:async body=>{if(!config.invitationUrl){if(production)throw new Error('Invitation adapter required');return {developmentOnly:true}}const response=await fetch(config.invitationUrl,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.invitationToken}`,'idempotency-key':String(body.idempotencyKey)},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('Invitation provider unavailable');const reader=response.body?.getReader();let size=0,text='';if(reader){const decoder=new TextDecoder();try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>8192){await reader.cancel();throw new Error('Invitation provider response exceeded limit')}text+=decoder.decode(chunk.value,{stream:true})}text+=decoder.decode()}finally{reader.releaseLock()}}const result=text?JSON.parse(text):{},reference=result.reference??result.messageId??result.id;if(typeof reference==='string'&&reference.length>0&&reference.length<=200)return {reference};if(production)throw new Error('Invitation provider reference required');return {};}
});

export const oidc=new OidcService(database,auth,parseOidcConfigurations(process.env.OIDC_CONFIG_JSON||'[]',config.origins),new VerifiedOidcTransport(),config.mfaEncryptionKey||'',config.otpSecret);

export const contractUsage=new ContractUsageService(database);
