import { Body, Controller, Get, Post, Param, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, HttpException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { z } from 'zod';
import type { Entity } from '@cargoorbit/database';
import { AuthGuard, type AuthRequest } from './auth.js';
import { auth, database, devOtps, expansion, workflow } from './runtime.js';
import { evidenceDownload, packetDownload, uploadEvidence } from './evidence.js';
import { production } from './config.js';
const trustedActions=new Set(['markEvidenceScanned','recordEvidence']);
const resources=new Set(['dashboard','organizations','facilities','policies','grants','consignments','trips','pods','billing','invoices','disputes','compliance','audit','outbox','evidence']);
function sendFile(res:Response,file:{bytes:Buffer;mime:string;filename:string}){res.set({'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.send(file.bytes);}
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
 @Post('login') @ApiOperation({summary:'Authenticate and choose an authorized workspace'})
 login(@Body() body:unknown,@Req() req:Request){return auth.login(body,req.ip||'unknown');}
 @Get('me') @UseGuards(AuthGuard) @ApiBearerAuth()
 me(@Req() req:AuthRequest){return req.user;}
 @Post('logout') @UseGuards(AuthGuard) @ApiBearerAuth()
 logout(@Req() req:AuthRequest){return auth.logout(req.actor.userId);}
}
@ApiTags('Workflow') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller()
export class WorkflowController {
 @Post('actions/:action')
 action(@Param('action') action:string,@Body() body:unknown,@Req() req:AuthRequest){if(trustedActions.has(action))throw new HttpException('This action is restricted to trusted evidence services',403);return this.checkedAction(req,action,body);}
 private async checkedAction(req:AuthRequest,action:string,body:unknown){if(action==='grantReceiver'){const i=z.object({userId:z.string(),organizationId:z.string(),contact:z.string()}).passthrough().parse(body);const match=await database.pool.query("SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=$1 AND m.tenant_id=$2 AND m.organization_id=$3 AND m.role='receiver' AND m.status='active' AND u.status='active'",[i.userId,req.actor.tenantId,i.organizationId]);if(!match.rows[0]||match.rows[0].email.toLowerCase()!==i.contact.toLowerCase())throw new HttpException('Grant must use the enrolled active receiver and their verified account contact',400);}return workflow.execute(req.actor,action,body);}
 @Get('resources/:resource')
 list(@Param('resource') resource:string,@Req() req:AuthRequest,@Query('q') q?:string,@Query('limit') limit?:string,@Query('offset') offset?:string){return this.read(resource,undefined,req,q,limit,offset);}
 @Get('resources/:resource/:id')
 get(@Param('resource') resource:string,@Param('id') id:string,@Req() req:AuthRequest){return this.read(resource,id,req);}
 private async read(resource:string,id:string|undefined,req:AuthRequest,q?:string,limit?:string,offset?:string){if(!resources.has(resource))throw new HttpException('Unknown resource',404);const value=await workflow.query(req.actor,resource,id);if(!Array.isArray(value))return value;const filtered=q?value.filter(row=>JSON.stringify(row).toLowerCase().includes(q.toLowerCase().slice(0,100))):value;const start=Math.max(0,Math.min(Number(offset)||0,100000));const count=Math.max(1,Math.min(Number(limit)||200,500));return filtered.slice(start,start+count);}
 @Post('consignments') createConsignment(@Body() body:unknown,@Req() req:AuthRequest){return workflow.execute(req.actor,'createConsignment',body);}
 @Post('trips') createTrip(@Body() body:unknown,@Req() req:AuthRequest){return workflow.execute(req.actor,'createTrip',body);}
 @Post('imports') imports(@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,body.commit===true?'importCommit':'importPreview',body);}
 @Post('delivery-attempts/:id/events') event(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'recordEvent',{...body,attemptId:id});}
 @Post('pods/:id/drafts') draft(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'saveDraft',{...body,podId:id});}
 @Post('pods/:id/challenges') challenge(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'issueChallenge',{...body,podId:id});}
 @Post('pods/:id/accept') accept(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'acceptPod',{...body,podId:id});}
 @Post('pods/:id/corrections') correction(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'correctPod',{...body,podId:id});}
 @Get('billing/readiness') readiness(@Req() req:AuthRequest){return workflow.query(req.actor,'billing');}
 @Post('invoices/:id/submissions') submission(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return workflow.execute(req.actor,'submitInvoice',{...body,invoiceId:id});}
 @Post('receipts') receipt(@Body() body:unknown,@Req() req:AuthRequest){return workflow.execute(req.actor,'allocateReceipt',body);}
 @Post('disputes') dispute(@Body() body:unknown,@Req() req:AuthRequest){return workflow.execute(req.actor,'createDispute',body);}
 @Post(['evidence','evidence/uploads']) @ApiConsumes('multipart/form-data')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1,fields:8}}))
 evidence(@UploadedFile() file:Express.Multer.File|undefined,@Body() body:unknown,@Req() req:AuthRequest){return uploadEvidence(req.actor,file,body);}
 @Get('evidence/:id') async file(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await evidenceDownload(req.actor,id));}
 @Get('evidence-packets/:id') async packet(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await packetDownload(req.actor,id));}
 @Get('evidence-packets/:id/manifest') async manifest(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await packetDownload(req.actor,id,true));}
 @Get('export') async export(@Req() req:AuthRequest,@Res() res:Response){if(!['owner','finance','auditor'].includes(req.actor.role))throw new HttpException('Export permission required',403);const names=['organizations','facilities','policies','consignments','trips','pods','billing','invoices','disputes','compliance','evidence'];const records:Record<string,unknown>={};for(const name of names)records[name]=await workflow.query(req.actor,name);await database.transaction(req.actor,tx=>tx.audit('tenant.export',req.actor.tenantId,{resources:names}));sendFile(res,{bytes:Buffer.from(JSON.stringify({format:'cargoorbit-export-v1',tenantId:req.actor.tenantId,exportedAt:new Date().toISOString(),records},null,2)),mime:'application/json',filename:'cargoorbit-export.json'});}
 @Post('expansion/actions/:action') expandedAction(@Param('action') action:string,@Body() body:unknown,@Req() req:AuthRequest){return expansion.execute(req.actor,action,body);}
 @Get('expansion/resources/:resource') expandedList(@Param('resource') resource:string,@Req() req:AuthRequest){return expansion.query(req.actor,resource);}
 @Get('expansion/resources/:resource/:id') expandedGet(@Param('resource') resource:string,@Param('id') id:string,@Req() req:AuthRequest){return expansion.query(req.actor,resource,id);}
 @Get('dev/otp') devOtp(@Req() req:AuthRequest){if(production)throw new HttpException('Not found',404);if(req.actor.role!=='receiver')throw new HttpException('Receiver account required',403);const otp=devOtps.get(req.user.email);if(!otp||otp.expiresAt<Date.now())throw new HttpException('No active development OTP for this account email',404);return {code:otp.code,expiresAt:new Date(otp.expiresAt).toISOString(),developmentOnly:true};}
 @Get('settings/features') async features(@Req() req:AuthRequest){if(!['owner','operations','finance','auditor','customer_admin'].includes(req.actor.role))throw new HttpException('Permission required',403);return database.transaction(req.actor,tx=>tx.get<Entity>('configuration','features'));}
 @Post('settings/features') async setFeatures(@Body() body:unknown,@Req() req:AuthRequest){if(req.actor.role!=='owner')throw new HttpException('Tenant owner required',403);const value=z.object({enabled:z.array(z.enum(['P2','P3','P4'])).max(3),reason:z.string().min(10).max(500)}).strict().parse(body);return database.transaction(req.actor,async tx=>{const tenant=await database.pool.query('SELECT features FROM tenants WHERE id=$1',[req.actor.tenantId]);const entitled=tenant.rows[0]?.features?.entitled||[];if(value.enabled.some(v=>!entitled.includes(v)))throw new HttpException('Module not included in workspace entitlements',403);await tx.put('configuration',{id:'features',...value,updatedAt:new Date().toISOString()});await tx.audit('features.configure','features',value);return {id:'features',...value};});}
}
@ApiTags('Health') @Controller('health')
export class HealthController {
 @Get() async health(){try{await database.pool.query('SELECT 1');return {status:'ok',service:'cargoorbit-api',time:new Date().toISOString()};}catch{throw new HttpException({status:'degraded',service:'cargoorbit-api'},503);}}
}
