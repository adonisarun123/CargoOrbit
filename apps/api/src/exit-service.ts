import {randomBytes,randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {HttpException} from '@nestjs/common';
import {z} from 'zod';
import type {Context,Database} from '@cargoorbit/database';
import type {PoolClient} from 'pg';
import type {AuthService} from './auth.js';
import {config,production} from './config.js';
import {hashPassword,matchingTotpCounter,openMfaSecret,verifyPassword} from './security.js';

const audience='cargoorbit-exit',dummy=hashPassword(randomBytes(32).toString('hex'));
const loginSchema=z.object({email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(256),otp:z.string().regex(/^\d{6}$/),membershipId:z.string().min(1).max(100).optional()}).strict();
function denied(message='Exit session unavailable',status=401,code='EXIT_SESSION_INVALID'):never{throw new HttpException({message,code},status)}
function windowFor(features:any){const until=typeof features?.exitExportUntil==='string'?Date.parse(features.exitExportUntil):NaN;return Number.isFinite(until)&&until>Date.now()&&typeof features?.exitExportReceiptId==='string'&&features.exitExportReceiptId.length>0?{until,receiptId:features.exitExportReceiptId as string}:undefined;}
export interface ExitIdentity{actor:Context;user:{id:string;name:string;email:string;tenantId:string;tenantName:string;membershipId:string;role:'owner'};expiresAt:string;exitExportUntil:string;receiptId:string}

/** Closing-workspace authority is stored separately and never produces an application or refresh token. */
export class ExitService{
 constructor(private db:Database,private auth:Pick<AuthService,'limit'>){}
 private async audit(c:PoolClient,tenantId:string,userId:string,action:string,target:string,details:unknown={}){await c.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);await c.query('INSERT INTO audit_events(tenant_id,id,actor_id,role,action,target,details,correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[tenantId,randomUUID(),userId,'owner',action,target,JSON.stringify(details),randomUUID()]);}
 async login(body:unknown,ip:string){
  const input=loginSchema.parse(body);await this.auth.limit('exit-login-ip',ip,60);await this.auth.limit('exit-login-account',input.email,10);
  const c=await this.db.pool.connect();try{await c.query('BEGIN');let user=(await c.query('SELECT * FROM users WHERE lower(email)=lower($1)',[input.email])).rows[0];
   const passwordOk=await verifyPassword(input.password,user?.password_hash||dummy);if(!passwordOk||!user||user.status!=='active'||user.mfa_enabled!==true)denied('Invalid credentials or verification code',401,'INVALID_CREDENTIALS');
   let secret:string;try{secret=openMfaSecret(user.mfa_secret,config.mfaEncryptionKey,!production)}catch{denied('Invalid credentials or verification code',401,'INVALID_CREDENTIALS')}
   if(matchingTotpCounter(secret!,input.otp,Date.now(),Number(user.mfa_last_counter??-1))===undefined)denied('Invalid credentials or verification code',401,'INVALID_CREDENTIALS');
   const memberships=(await c.query("SELECT m.*,t.name tenant_name,t.features FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status='active' AND m.role='owner' AND t.status='closing'",[user.id])).rows.filter(m=>windowFor(m.features));
   let membership=input.membershipId?memberships.find(m=>m.id===input.membershipId):memberships.length===1?memberships[0]:undefined;
   if(!membership){if(!input.membershipId&&memberships.length>1)throw new HttpException({message:'Choose an authorized closing workspace',code:'WORKSPACE_REQUIRED',memberships:memberships.map(m=>({id:m.id,name:m.tenant_name,role:'owner'}))},409);denied('No approved exit export window',403,'EXIT_WORKSPACE_UNAVAILABLE');}
   // Match the operator/tenant transaction lock order, then revalidate every preflight fact.
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`cargoorbit:${membership.tenant_id}`]);const previous=user;
   user=(await c.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[previous.id])).rows[0];
   if(!user||user.status!=='active'||user.mfa_enabled!==true||user.password_hash!==previous.password_hash||user.mfa_secret!==previous.mfa_secret)denied('Credentials changed; authenticate again',401,'INVALID_CREDENTIALS');
   const counter=matchingTotpCounter(secret!,input.otp,Date.now(),Number(user.mfa_last_counter??-1));if(counter===undefined)denied('Invalid credentials or verification code',401,'INVALID_CREDENTIALS');
   membership=(await c.query("SELECT m.*,t.name tenant_name,t.features FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.id=$1 AND m.user_id=$2 AND m.tenant_id=$3 AND m.status='active' AND m.role='owner' AND t.status='closing' FOR SHARE OF m,t",[membership.id,user.id,membership.tenant_id])).rows[0];
   const window=windowFor(membership?.features);if(!membership||!window)denied('No approved exit export window',403,'EXIT_WORKSPACE_UNAVAILABLE');const expiresAt=new Date(Math.min(Date.now()+1800000,window.until)),sid=randomUUID();
   await c.query('UPDATE users SET mfa_last_counter=$2 WHERE id=$1',[user.id,counter]);
   await c.query('INSERT INTO exit_sessions(id,user_id,membership_id,user_session_version,expires_at) VALUES($1,$2,$3,$4,$5)',[sid,user.id,membership.id,user.session_version,expiresAt.toISOString()]);
   await this.audit(c,membership.tenant_id,user.id,'auth.exit_login',sid,{receiptId:window.receiptId,exitExportUntil:new Date(window.until).toISOString()});await c.query('COMMIT');
   const expiresIn=Math.max(1,Math.floor((expiresAt.getTime()-Date.now())/1000));const exitToken=jwt.sign({sub:user.id,mid:membership.id,tid:membership.tenant_id,sid,sv:Number(user.session_version),v:1,receipt:window.receiptId,purpose:'exit-export'},config.jwtSecret,{algorithm:'HS256',issuer:'cargoorbit',audience,expiresIn,jwtid:randomUUID()});
   return {exitToken,expiresIn,expiresAt:expiresAt.toISOString(),exitExportUntil:new Date(window.until).toISOString(),user:{id:user.id,name:user.name,email:user.email,tenantId:membership.tenant_id,tenantName:membership.tenant_name,membershipId:membership.id,role:'owner' as const}};
  }catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error}finally{c.release()}
 }
 async authenticate(header:string|undefined):Promise<ExitIdentity>{
  if(!header?.startsWith('Bearer ')||header.length>8192)denied();let token:jwt.JwtPayload;
  try{token=jwt.verify(header.slice(7),config.jwtSecret,{algorithms:['HS256'],issuer:'cargoorbit',audience}) as jwt.JwtPayload;if(typeof token.sub!=='string'||typeof token.mid!=='string'||typeof token.sid!=='string'||typeof token.tid!=='string'||typeof token.receipt!=='string'||!Number.isInteger(token.v)||!Number.isInteger(token.sv)||token.purpose!=='exit-export')throw new Error()}catch{denied()}
  const row=(await this.db.pool.query(`SELECT u.id,u.name,u.email,u.status,u.mfa_enabled,u.session_version,m.id membership_id,m.status membership_status,m.role,m.tenant_id,m.organization_id,m.facility_ids,m.assigned_driver_id,t.name tenant_name,t.status tenant_status,t.features,s.id session_id,s.version,s.user_session_version,s.revoked_at,s.expires_at
   FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id JOIN exit_sessions s ON s.user_id=u.id AND s.membership_id=m.id WHERE u.id=$1 AND m.id=$2 AND s.id=$3 AND t.id=$4`,[token!.sub,token!.mid,token!.sid,token!.tid])).rows[0];
  const window=windowFor(row?.features);if(!row||!window||row.status!=='active'||row.mfa_enabled!==true||row.membership_status!=='active'||row.role!=='owner'||row.tenant_status!=='closing'||row.revoked_at||new Date(row.expires_at).getTime()<=Date.now()||Number(row.session_version)!==token!.sv||Number(row.user_session_version)!==token!.sv||Number(row.version)!==token!.v||window.receiptId!==token!.receipt)denied();
  return {actor:{tenantId:row.tenant_id,userId:row.id,role:'owner',membershipId:row.membership_id,exitSessionId:row.session_id,exitExportReceiptId:window!.receiptId,sessionVersion:Number(row.version),userSessionVersion:Number(row.session_version),organizationId:row.organization_id||undefined,facilityIds:row.facility_ids||[],assignedDriverId:row.assigned_driver_id||undefined},user:{id:row.id,name:row.name,email:row.email,tenantId:row.tenant_id,tenantName:row.tenant_name,membershipId:row.membership_id,role:'owner'},expiresAt:new Date(row.expires_at).toISOString(),exitExportUntil:new Date(window!.until).toISOString(),receiptId:window!.receiptId};
 }
 async logout(identity:ExitIdentity){const c=await this.db.pool.connect();try{await c.query('BEGIN');await c.query('UPDATE exit_sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2',[identity.actor.exitSessionId,identity.actor.userId]);await this.audit(c,identity.actor.tenantId,identity.actor.userId,'auth.exit_logout',identity.actor.exitSessionId!);await c.query('COMMIT');return {ok:true}}catch(error){await c.query('ROLLBACK').catch(()=>undefined);throw error}finally{c.release()}}
 async list(identity:ExitIdentity){return this.db.transaction(identity.actor,async tx=>{const job=await tx.get('tenant_exports',identity.receiptId);await tx.audit('tenant.exit_export.list',identity.receiptId);if(!job||job.status!=='completed'||!job.acknowledgedAt)return [];const {objectKey,objectVersion,runToken,...view}=job;return [{...view,exitExportUntil:identity.exitExportUntil}];});}
 async archive(identity:ExitIdentity,id:string){return this.db.transaction(identity.actor,async tx=>{if(id!==identity.receiptId)denied('Approved exit archive not found',404,'NOT_FOUND');const job=await tx.get('tenant_exports',id);if(!job||job.status!=='completed'||!job.acknowledgedAt||typeof job.objectKey!=='string'||typeof job.objectVersion!=='string'||typeof job.sha256!=='string'||!/^[a-f0-9]{64}$/.test(job.sha256)||!Number.isSafeInteger(job.bytes)||Number(job.bytes)<1)denied('Approved exit archive unavailable',404,'NOT_FOUND');await tx.audit('tenant.exit_export.download',id,{sha256:job.sha256});return {objectKey:job.objectKey,objectVersion:job.objectVersion,sha256:job.sha256,bytes:Number(job.bytes)};});}
}
