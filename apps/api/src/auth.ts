import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { HttpException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Context, Database } from '@cargoorbit/database';
import { config, production } from './config.js';

export interface AuthUser {id:string;name:string;email:string;role:string;tenantId:string;organizationId?:string;membershipId:string;facilityIds:string[];assignedDriverId?:string}
export interface AuthRequest extends Request {actor:Context;user:AuthUser}
export function hashPassword(password:string):string {const salt=randomBytes(16).toString('hex');return `scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;}
export function verifyPassword(password:string,encoded:string):boolean {const [algorithm,salt,digest]=encoded.split('$');if(algorithm!=='scrypt'||!salt||!digest||digest.length!==128)return false;const expected=Buffer.from(digest,'hex');const actual=scryptSync(password,salt,64);return expected.length===actual.length&&timingSafeEqual(expected,actual);}
const dummy=hashPassword(randomBytes(32).toString('hex'));
const loginSchema=z.object({email:z.string().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(1).max(256),membershipId:z.string().max(100).optional(),otp:z.string().regex(/^\d{6}$/).optional()}).strict();
// Database transaction advisory locks make brute-force limits effective across API replicas.
export class AuthService {
  constructor(private db:Database){}
  async login(body:unknown,ip:string){
    const input=loginSchema.parse(body);const key=createHmac('sha256',config.jwtSecret).update(`${input.email}:${ip}`).digest('hex');
    const client=await this.db.pool.connect();
    try{
      await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`login:${key}`]);
      await client.query("DELETE FROM login_attempts WHERE expires_at < now() AND key=$1",[key]);
      const limited=await client.query('SELECT attempts FROM login_attempts WHERE key=$1 FOR UPDATE',[key]);
      if(Number(limited.rows[0]?.attempts||0)>=10){await client.query('COMMIT');throw new HttpException('Too many login attempts; try again after 15 minutes',429);}
      const result=await client.query('SELECT * FROM users WHERE lower(email)=lower($1)',[input.email]);const user=result.rows[0];
      const valid=verifyPassword(input.password,user?.password_hash||dummy)&&user?.status==='active'&&(!user.mfa_enabled||(input.otp&&verifyTotp(user.mfa_secret,input.otp)));
      if(!valid){await client.query("INSERT INTO login_attempts(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1",[key]);await client.query('COMMIT');throw new HttpException('Invalid credentials or verification code',401);}
      const memberships=await client.query("SELECT m.*,t.name tenant_name FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 AND m.status='active' AND t.status='active'",[user.id]);
      const membership=input.membershipId?memberships.rows.find(m=>m.id===input.membershipId):memberships.rows.length===1?memberships.rows[0]:null;
      if(!membership){await client.query('COMMIT');if(memberships.rows.length>1)throw new HttpException({message:'Choose an authorized workspace',memberships:memberships.rows.map(m=>({id:m.id,name:m.tenant_name,role:m.role}))},409);throw new HttpException('No active workspace membership',403);}
      if(production&&['owner','customer_admin','platform_admin'].includes(membership.role)&&!user.mfa_enabled)throw new HttpException('Administrator MFA enrollment required through the verified provisioning process',403);
      await client.query('DELETE FROM login_attempts WHERE key=$1',[key]);await client.query('COMMIT');
      const accessToken=jwt.sign({sub:user.id,mid:membership.id,sv:user.session_version},config.jwtSecret,{algorithm:'HS256',expiresIn:'15m',issuer:'cargoorbit',audience:'cargoorbit-api',jwtid:randomBytes(16).toString('hex')});
      return {accessToken,expiresIn:900,user:this.toUser(user,membership)};
    }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();}
  }
  private toUser(user:any,m:any):AuthUser{return {id:user.id,name:user.name,email:user.email,role:m.role,tenantId:m.tenant_id,organizationId:m.organization_id||undefined,membershipId:m.id,facilityIds:m.facility_ids||[],assignedDriverId:m.assigned_driver_id||undefined};}
  async authenticate(header:string|undefined):Promise<{actor:Context;user:AuthUser}>{
    if(!header?.startsWith('Bearer '))throw new HttpException('Authentication required',401);
    let token:jwt.JwtPayload;try{token=jwt.verify(header.slice(7),config.jwtSecret,{algorithms:['HS256'],issuer:'cargoorbit',audience:'cargoorbit-api'}) as jwt.JwtPayload;}catch{throw new HttpException('Session expired or invalid',401);}
    const result=await this.db.pool.query("SELECT u.id,u.name,u.email,u.session_version,m.*,u.status user_status,t.status tenant_status FROM users u JOIN memberships m ON m.user_id=u.id JOIN tenants t ON t.id=m.tenant_id WHERE u.id=$1 AND m.id=$2",[token.sub,token.mid]);
    const row=result.rows[0];if(!row||row.status!=='active'||row.user_status!=='active'||row.tenant_status!=='active'||row.session_version!==token.sv)throw new HttpException('Membership revoked or session ended',401);
    // m.id overlaps u.id in joined projection; user id always comes from verified token.
    const user=this.toUser({...row,id:token.sub},row);
    return {user,actor:{tenantId:row.tenant_id,userId:String(token.sub),role:row.role,organizationId:row.organization_id||undefined,facilityIds:row.facility_ids||[],assignedDriverId:row.assigned_driver_id||undefined}};
  }
  async logout(userId:string){await this.db.pool.query('UPDATE users SET session_version=session_version+1 WHERE id=$1',[userId]);return {ok:true};}
}
function verifyTotp(secret:string|undefined,code:string):boolean{
 if(!secret)return false;const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits='';for(const char of secret.toUpperCase().replace(/=+$/,'')){const index=alphabet.indexOf(char);if(index<0)return false;bits+=index.toString(2).padStart(5,'0');}const key=Buffer.from((bits.match(/.{8}/g)||[]).map(v=>parseInt(v,2)));for(let delta=-1;delta<=1;delta++){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)+delta));const hash=createHmac('sha1',key).update(counter).digest();const offset=hash[19]!&15;const calculated=String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');if(timingSafeEqual(Buffer.from(calculated),Buffer.from(code)))return true;}return false;
}
@Injectable()
export class AuthGuard implements CanActivate {
 static service:AuthService;
 async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<AuthRequest>();const result=await AuthGuard.service.authenticate(req.headers.authorization);req.actor={...result.actor,correlationId:String(req.headers['x-request-id']||randomBytes(8).toString('hex'))};req.user=result.user;return true;}
}
