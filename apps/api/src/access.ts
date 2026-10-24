import {randomUUID} from 'node:crypto';
import {Body,Controller,Get,Param,Post,Req,UseGuards,HttpException} from '@nestjs/common';
import type {Request} from 'express';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {AuthGuard,type AuthRequest} from './auth.js';
import {auth,access} from './runtime.js';
import {config} from './config.js';
import type {StepUpScope} from './security.js';
const step=(req:AuthRequest,scope:StepUpScope)=>auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,scope);
@UseGuards(AuthGuard) @Controller('access')
export class AccessController{
 @Get('support-grants') support(@Req() req:AuthRequest){return access.list(req.actor,'support_grants')}
 @Post('support-grants') async grant(@Body() body:unknown,@Req() req:AuthRequest){step(req,'support:approve');await auth.limit('support-approve',req.user.id,20,3600);return access.grantSupport(req.actor,body)}
 @Post('support-grants/:id/revoke') revokeSupport(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'support:approve');return access.revokeSupport(req.actor,id,body)}
 @Get('machine-accounts') machines(@Req() req:AuthRequest){return access.list(req.actor,'machine_accounts')}
 @Post('machine-accounts') async createMachine(@Body() body:unknown,@Req() req:AuthRequest){step(req,'machine:manage');await auth.limit('machine-create',req.user.id,20,3600);return access.createMachine(req.actor,body)}
 @Post('machine-accounts/:id/rotate') rotateMachine(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'machine:manage');return access.changeMachine(req.actor,id,body,true)}
 @Post('machine-accounts/:id/revoke') revokeMachine(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'machine:manage');return access.changeMachine(req.actor,id,body,false)}
 @Get('tracking-links') links(@Req() req:AuthRequest){return access.list(req.actor,'tracking_links')}
 @Post('tracking-links') async createLink(@Body() body:unknown,@Req() req:AuthRequest){step(req,'access:manage');await auth.limit('tracking-create',req.user.id,50,3600);return access.createTracking(req.actor,body)}
 @Post('tracking-links/:id/revoke') revokeLink(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'access:manage');return access.revokeTracking(req.actor,id,body)}
 @Get('receiver-invitations') invitations(@Req() req:AuthRequest){return access.list(req.actor,'receiver_invitations')}
 @Post('receiver-invitations') async invite(@Body() body:unknown,@Req() req:AuthRequest){step(req,'receiver:invite');await auth.limit('receiver-invite',req.user.id,30,3600);return access.createReceiverInvitation(req.actor,body)}
 @Post('receiver-invitations/:id/resend') async resend(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'receiver:invite');await auth.limit('receiver-invite',req.user.id,30,3600);return access.changeReceiverInvitation(req.actor,id,body,true)}
 @Post('receiver-invitations/:id/revoke') revokeInvitation(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){step(req,'receiver:invite');return access.changeReceiverInvitation(req.actor,id,body,false)}
 @Post('receiver-invitations/redeem') async redeem(@Body() body:unknown,@Req() req:AuthRequest){await auth.limit('receiver-redeem',req.user.id,30,900);return access.redeemReceiverInvitation(req.actor,body)}
}
@UseGuards(AuthGuard) @Controller('support')
export class SupportController{
 @Post('sessions') async open(@Body() body:unknown,@Req() req:AuthRequest){step(req,'support:access');await auth.limit('support-session',req.user.id,20,3600);const i=z.object({tenantId:z.string().min(1).max(100),grantId:z.string().uuid()}).strict().parse(body);const result=await access.openSupport(req.actor,i.tenantId,i.grantId,randomUUID());const supportToken=jwt.sign({sub:req.user.id,sid:req.user.sessionId,mid:req.user.membershipId,grantId:i.grantId,targetTenantId:i.tenantId,supportSessionId:result.sessionId,exp:Math.floor(Date.parse(result.expiresAt)/1000)},config.jwtSecret,{algorithm:'HS256',issuer:'cargoorbit',audience:'cargoorbit-support',jwtid:randomUUID()});return {...result,supportToken}}
 @Post('read') async read(@Body() body:unknown,@Req() req:AuthRequest){await auth.limit('support-read',req.user.id,300,60);const i=z.object({supportToken:z.string().max(8192),resource:z.string(),id:z.string().optional(),limit:z.number().int().min(1).max(500).optional(),offset:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional()}).strict().parse(body);let claims:jwt.JwtPayload;try{claims=jwt.verify(i.supportToken,config.jwtSecret,{algorithms:['HS256'],issuer:'cargoorbit',audience:'cargoorbit-support'}) as jwt.JwtPayload;if(claims.sub!==req.user.id||claims.sid!==req.user.sessionId||claims.mid!==req.user.membershipId||typeof claims.grantId!=='string'||typeof claims.targetTenantId!=='string'||typeof claims.supportSessionId!=='string')throw new Error();}catch{throw new HttpException('Support session unavailable',401)}return access.readSupport(req.actor,claims.targetTenantId,claims.grantId,claims.supportSessionId,{resource:i.resource,...(i.id?{id:i.id}:{}),...(i.limit!==undefined?{limit:i.limit}:{}),...(i.offset!==undefined?{offset:i.offset}:{})})}
}
@Controller()
export class PublicAccessController{
 @Post('public/tracking/resolve') async track(@Body() body:unknown,@Req() req:Request){await auth.limit('tracking-read-ip',req.ip||'unknown',120,60);return access.track(body)}
 @Post('machine/read') async machine(@Body() body:unknown,@Req() req:Request){await auth.limit('machine-read-ip',req.ip||'unknown',300,60);const header=req.headers.authorization;if(!header?.startsWith('Bearer '))throw new HttpException('Machine credential required',401);const credential=header.slice(7);await auth.limit('machine-read-key',credential,300,60);return access.machineRead(credential,body)}
}
