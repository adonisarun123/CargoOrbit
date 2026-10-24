import { Database } from '@cargoorbit/database';
import { WorkflowService } from '@cargoorbit/domain';
import { AuthService, AuthGuard } from './auth.js';
import { config, production } from './config.js';
import { ExpansionService } from './expansion/index.js';
export const database=new Database();
export const devOtps=new Map<string,{code:string;expiresAt:number}>();
export const workflow=new WorkflowService(database,{otpSecret:config.otpSecret,deliverOtp:async(contact:string,code:string)=>{
 if(!production&&!config.smsUrl){devOtps.set(contact,{code,expiresAt:Date.now()+300000});return;}
 if(!config.smsUrl)throw new Error('OTP provider unavailable');
 const response=await fetch(config.smsUrl,{method:'POST',headers:{'content-type':'application/json','authorization':`Bearer ${config.smsToken}`},body:JSON.stringify({contact,code,purpose:'cargoorbit-pod',expiresIn:300}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('OTP provider rejected delivery');
}});
export const auth=new AuthService(database);
AuthGuard.service=auth;
export const expansion=new ExpansionService(database);
