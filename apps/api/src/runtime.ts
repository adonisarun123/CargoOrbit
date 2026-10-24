import {createHmac} from 'node:crypto';
import {HttpException} from '@nestjs/common';
import { Database } from '@cargoorbit/database';
import { WorkflowService } from '@cargoorbit/domain';
import { AuthService, AuthGuard } from './auth.js';
import { config, production } from './config.js';
import {createIntegrationService} from './integrations/index.js';
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
