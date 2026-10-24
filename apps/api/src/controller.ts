import { Body, Controller, Get, Post, Param, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors, HttpException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { z } from 'zod';
import type { Entity } from '@cargoorbit/database';
import { AuthGuard, type AuthRequest } from './auth.js';
import { auth, database, devOtps, expansion, workflow, integrations, contractUsage } from './runtime.js';
import { evidenceDownload, packetDownload, uploadEvidence } from './evidence.js';
import type {StepUpScope} from './security.js';
import {scannerHealth,verifyStorage} from './storage.js';
import { production } from './config.js';
import {cachedReadiness} from './health.js';
const readinessQuery={text:'SELECT 1',query_timeout:4000};
const readyProbe=cachedReadiness(async signal=>{const results=await Promise.all([database.pool.query(readinessQuery),scannerHealth(),verifyStorage(signal)]);if(!results[1])throw new Error('Scanner unavailable');});
const trustedActions=new Set(['markEvidenceScanned','recordEvidence']);
const resources=new Set(['dashboard','organizations','facilities','policies','grants','consignments','trips','pods','billing','invoices','disputes','compliance','audit','outbox','evidence','attempts','events','tasks','allocations','discrepancies','imports','receipts','receiptReview','allocation_verifications','allocation_reversals','goodsDocuments','goodsDocumentLinks','receiverExceptions','syncEscalations','transshipments','barcodes','invoiceTaxReadiness','receiptVerification']);
function sendFile(res:Response,file:{bytes:Buffer;mime:string;filename:string}){res.set({'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.send(file.bytes);}
@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
 @Post('login') @ApiOperation({summary:'Authenticate and choose an authorized workspace'})
 login(@Body() body:unknown,@Req() req:Request){return auth.login(body,req.ip||'unknown');}
 @Post('refresh') refresh(@Body() body:unknown,@Req() req:Request){return auth.refresh(body,req.ip||'unknown');}
 @Post('step-up') @UseGuards(AuthGuard) stepUp(@Body() body:unknown,@Req() req:AuthRequest){return auth.stepUp(req.user,body);}
 @Post('password') @UseGuards(AuthGuard) password(@Body() body:unknown,@Req() req:AuthRequest){return auth.changePassword(req.user,body,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined);}
 @Get('sessions') @UseGuards(AuthGuard) sessions(@Req() req:AuthRequest){return auth.listSessions(req.user);}
 @Post('sessions/:id/revoke') @UseGuards(AuthGuard) revoke(@Param('id') id:string,@Req() req:AuthRequest){return auth.revokeSession(req.user,id);}
 @Get('me') @UseGuards(AuthGuard) @ApiBearerAuth()
 me(@Req() req:AuthRequest){return req.user;}
 @Post('logout') @UseGuards(AuthGuard) @ApiBearerAuth()
 logout(@Req() req:AuthRequest){return auth.logout(req.user);}
}
@ApiTags('Workflow') @ApiBearerAuth() @UseGuards(AuthGuard) @Controller()
export class WorkflowController {
 @Post('actions/:action')
 action(@Param('action') action:string,@Body() body:unknown,@Req() req:AuthRequest){if(trustedActions.has(action))throw new HttpException('This action is restricted to trusted evidence services',403);return this.checkedAction(req,action,body);}
 private async checkedAction(req:AuthRequest,action:string,body:unknown){
  const scopes:Record<string,StepUpScope>={grantReceiver:'receiver:grant',revokeGrant:'receiver:revoke',createPolicy:'policy:change',applyPolicy:'policy:change',updateOrganization:'policy:change',updateFacility:'policy:change',overrideDueDate:'finance:adjust',verifyAllocation:'finance:adjust',reverseAllocation:'finance:adjust',voidInvoice:'finance:adjust',resolveDispute:'finance:adjust',resolveReviewTask:'finance:adjust',recordInvoiceTaxData:'finance:adjust',transship:'policy:change'};
  if(scopes[action])auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,scopes[action]!);
  if(['issueChallenge','acceptPod'].includes(action))await auth.limit(`pod:${action}`,req.user.id,action==='issueChallenge'?20:60,900);
  return workflow.execute(req.actor,action,body);
 }
 @Get('resources/:resource')
 list(@Param('resource') resource:string,@Req() req:AuthRequest,@Query('q') q?:string,@Query('limit') limit?:string,@Query('offset') offset?:string){return this.read(resource,undefined,req,q,limit,offset);}
 @Get('resources/:resource/:id')
 get(@Param('resource') resource:string,@Param('id') id:string,@Req() req:AuthRequest){return this.read(resource,id,req);}
 private async read(resource:string,id:string|undefined,req:AuthRequest,q?:string,limit?:string,offset?:string){if(!resources.has(resource))throw new HttpException('Unknown resource',404);const value=await workflow.query(req.actor,resource,id);if(!Array.isArray(value))return value;const filtered=q?value.filter(row=>JSON.stringify(row).toLowerCase().includes(q.toLowerCase().slice(0,100))):value;const start=Math.max(0,Math.min(Number(offset)||0,100000));const count=Math.max(1,Math.min(Number(limit)||200,500));return filtered.slice(start,start+count);}
 @Post('consignments') createConsignment(@Body() body:unknown,@Req() req:AuthRequest){return this.checkedAction(req,'createConsignment',body);}
 @Post('trips') createTrip(@Body() body:unknown,@Req() req:AuthRequest){return this.checkedAction(req,'createTrip',body);}
 @Post('imports') imports(@Body() body:Record<string,unknown>,@Req() req:AuthRequest){const {commit,...input}=body;return this.checkedAction(req,commit===true?'importCommit':'importPreview',input);}
 @Post('delivery-attempts/:id/events') event(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'recordEvent',{...body,attemptId:id});}
 @Post('pods/:id/drafts') draft(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'saveDraft',{...body,podId:id});}
 @Post('pods/:id/challenges') challenge(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'issueChallenge',{...body,podId:id});}
 @Post('pods/:id/accept') accept(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'acceptPod',{...body,podId:id});}
 @Post('pods/:id/corrections') correction(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'correctPod',{...body,podId:id});}
 @Get('billing/readiness') readiness(@Req() req:AuthRequest){return workflow.query(req.actor,'billing');}
 @Post('invoices/:id/submissions') submission(@Param('id') id:string,@Body() body:Record<string,unknown>,@Req() req:AuthRequest){return this.checkedAction(req,'submitInvoice',{...body,invoiceId:id});}
 @Post('receipts') receipt(@Body() body:unknown,@Req() req:AuthRequest){return this.checkedAction(req,'allocateReceipt',body);}
 @Post('disputes') dispute(@Body() body:unknown,@Req() req:AuthRequest){return this.checkedAction(req,'createDispute',body);}
 @Post(['evidence','evidence/uploads']) @ApiConsumes('multipart/form-data')
 @UseInterceptors(FileInterceptor('file',{limits:{fileSize:10*1024*1024,files:1,fields:8}}))
 evidence(@UploadedFile() file:Express.Multer.File|undefined,@Body() body:unknown,@Req() req:AuthRequest){return uploadEvidence(req.actor,file,body);}
 @Get('evidence/:id') async file(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await evidenceDownload(req.actor,id));}
 @Get('evidence-packets/:id') async packet(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await packetDownload(req.actor,id));}
 @Get('evidence-packets/:id/manifest') async manifest(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){sendFile(res,await packetDownload(req.actor,id,true));}
 @Get('export') async export(@Req() req:AuthRequest,@Res() res:Response){if(!['owner','finance','auditor'].includes(req.actor.role))throw new HttpException('Export permission required',403);const names=['organizations','facilities','policies','consignments','trips','pods','billing','invoices','disputes','compliance','evidence'];const records:Record<string,unknown>={};for(const name of names)records[name]=await workflow.query(req.actor,name);await database.transaction(req.actor,tx=>tx.audit('tenant.export',req.actor.tenantId,{resources:names}));sendFile(res,{bytes:Buffer.from(JSON.stringify({format:'cargoorbit-export-v1',tenantId:req.actor.tenantId,exportedAt:new Date().toISOString(),records},null,2)),mime:'application/json',filename:'cargoorbit-export.json'});}
 @Post('expansion/actions/:action') expandedAction(@Param('action') action:string,@Body() body:unknown,@Req() req:AuthRequest){const scope:StepUpScope|undefined=['approvePaymentExport','approveInvestment','verifyRecoveryReceipt','reviewRecoveryReport','reviewTripCosts'].includes(action)?'finance:adjust':['setFeatures','configureAdvancedCapability','releaseQuarantine','approveCountTask','approveSlotting','configureOperationalRule','configureMaintenanceRule','reviewHandlingException'].includes(action)?'policy:change':undefined;if(scope)auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,scope);return expansion.execute(req.actor,action,body);}
 @Get('expansion/resources/:resource') expandedList(@Param('resource') resource:string,@Req() req:AuthRequest){return expansion.query(req.actor,resource);}
 @Get('expansion/resources/:resource/:id') expandedGet(@Param('resource') resource:string,@Param('id') id:string,@Req() req:AuthRequest){return expansion.query(req.actor,resource,id);}
 @Get('integrations/capabilities') integrationCapabilities(@Req() req:AuthRequest){if(!['owner','operations','finance','auditor'].includes(req.actor.role))throw new HttpException('Integration permission required',403);return integrations.capabilities(req.actor);}
 @Get(['integrations/history','integrations/calls']) integrationHistory(@Req() req:AuthRequest){return integrations.query(req.actor);}
 @Get(['integrations/history/:id','integrations/calls/:id']) integrationRecord(@Param('id') id:string,@Req() req:AuthRequest){return integrations.query(req.actor,id);}
 @Post('integrations/execute') executeIntegration(@Body() body:unknown,@Req() req:AuthRequest){const i=z.object({operation:z.string()}).passthrough().parse(body);if(['eway.extend','erp.invoice.create','wms.movement.post','esign.request'].includes(i.operation))auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'finance:adjust');return integrations.execute(req.actor,body);}
 @Post('integrations/reconcile') reconcileIntegration(@Body() body:unknown,@Req() req:AuthRequest){return integrations.reconcile(req.actor,body);}
 @Get('dev/otp') devOtp(@Req() req:AuthRequest){if(production)throw new HttpException('Not found',404);if(req.actor.role!=='receiver')throw new HttpException('Receiver account required',403);const otp=devOtps.get(req.user.verifiedContact||req.user.email);if(!otp||otp.expiresAt<Date.now())throw new HttpException('No active development OTP for this account email',404);return {code:otp.code,expiresAt:new Date(otp.expiresAt).toISOString(),developmentOnly:true};}
 @Get('settings/usage-limits') usageLimits(@Req() req:AuthRequest){if(!['owner','auditor'].includes(req.actor.role))throw new HttpException('Tenant administration required',403);return contractUsage.status(req.actor);}
 @Post('settings/usage-limits') configureUsageLimits(@Body() body:unknown,@Req() req:AuthRequest){if(req.actor.role!=='owner')throw new HttpException('Tenant owner required',403);auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'policy:change');return contractUsage.configure(req.actor,body);}
 @Get('settings/features') async features(@Req() req:AuthRequest){if(!['owner','operations','finance','auditor','customer_admin'].includes(req.actor.role))throw new HttpException('Permission required',403);return database.transaction(req.actor,tx=>tx.get<Entity>('configuration','features'));}
 @Post('settings/features') async setFeatures(@Body() body:unknown,@Req() req:AuthRequest){if(req.actor.role!=='owner')throw new HttpException('Tenant owner required',403);auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'policy:change');const value=z.object({enabled:z.array(z.enum(['P2','P3','P4'])).max(3),reason:z.string().min(10).max(500)}).strict().parse(body);return database.transaction(req.actor,async tx=>{const tenant=await database.pool.query('SELECT features FROM tenants WHERE id=$1',[req.actor.tenantId]);const entitled=tenant.rows[0]?.features?.entitled||[];if(value.enabled.some(v=>!entitled.includes(v)))throw new HttpException('Module not included in workspace entitlements',403);await tx.put('configuration',{id:'features',...value,updatedAt:new Date().toISOString()});await tx.audit('features.configure','features',value);return {id:'features',...value};});}
}
@ApiTags('Health') @Controller('health')
export class HealthController {
 @Get('live') live(){return {status:'ok',service:'cargoorbit-api'};}
 @Get() health(){return this.ready();}
 @Get('ready') async ready(){if(!await readyProbe())throw new HttpException({message:'Service dependencies unavailable',code:'NOT_READY'},503);return {status:'ready',service:'cargoorbit-api',time:new Date().toISOString()};}
 @Get('workspace') @UseGuards(AuthGuard) async workspace(@Req() req:AuthRequest){if(!['owner','operations','auditor'].includes(req.actor.role))throw new HttpException('Operator permission required',403);return database.transaction(req.actor,async tx=>{const events=await tx.list('outbox');const pending=events.filter(e=>['pending','failed','processing'].includes(String(e.status)));const oldest=pending.reduce((t,e)=>Math.min(t,new Date(String(e.createdAt)).getTime()),Date.now());return {status:events.some(e=>e.status==='dead')?'attention_required':'ok',pending:pending.length,dead:events.filter(e=>e.status==='dead').length,oldestPendingSeconds:Math.floor((Date.now()-oldest)/1000)};});}
}
