import {Body,Controller,Get,Post,Param,Req,Res,UseGuards,Injectable,type CanActivate,type ExecutionContext} from '@nestjs/common';
import type {Request,Response} from 'express';
import {randomUUID} from 'node:crypto';
import {auth,database} from './runtime.js';
import {ExitService,type ExitIdentity} from './exit-service.js';
import {tenantArchive} from './export.js';
import {openObject} from './storage.js';

export const exitAccess=new ExitService(database,auth);
export interface ExitRequest extends Request{exit:ExitIdentity}
@Injectable()
export class ExitGuard implements CanActivate{async canActivate(context:ExecutionContext){const req=context.switchToHttp().getRequest<ExitRequest>();req.exit=await exitAccess.authenticate(req.headers.authorization);req.exit.actor.correlationId=String(req.headers['x-request-id']||randomUUID());return true;}}
/** Existing downloads are interrupted on session/window expiry and rechecked for revocation every five seconds. */
function downloadLifetime(req:ExitRequest,res:Response){const abort=new AbortController(),deadline=Math.max(1,Math.min(Date.parse(req.exit.expiresAt),Date.parse(req.exit.exitExportUntil))-Date.now());const timeout=setTimeout(()=>abort.abort(),deadline);timeout.unref();let checking=false;const interval=setInterval(async()=>{if(checking||abort.signal.aborted)return;checking=true;try{await exitAccess.authenticate(req.headers.authorization)}catch{abort.abort()}finally{checking=false}},5000);interval.unref();const cleanup=()=>{clearTimeout(timeout);clearInterval(interval)};res.once('close',()=>{cleanup();abort.abort()});res.once('finish',cleanup);abort.signal.addEventListener('abort',()=>{cleanup();res.destroy()},{once:true});if(req.aborted||res.destroyed)abort.abort();return abort.signal;}
@Controller('exit')
export class ExitLoginController{@Post('login') login(@Body() body:unknown,@Req() req:Request){return exitAccess.login(body,req.ip||'unknown')}}
@UseGuards(ExitGuard) @Controller('exit')
export class ExitController{
 @Get('session') session(@Req() req:ExitRequest){return {user:req.exit.user,expiresAt:req.exit.expiresAt,exitExportUntil:req.exit.exitExportUntil}}
 @Post('logout') logout(@Req() req:ExitRequest){return exitAccess.logout(req.exit)}
 @Get('exports') list(@Req() req:ExitRequest){return exitAccess.list(req.exit)}
 @Get('exports/:id/download') async download(@Param('id') id:string,@Req() req:ExitRequest,@Res() res:Response){await auth.limit('exit-download',req.exit.user.id,20,3600);const job=await exitAccess.archive(req.exit,id),signal=downloadLifetime(req,res);if(signal.aborted)return;const stream=await openObject(job.objectKey,job.objectVersion,job.sha256,signal);if(res.destroyed){stream.destroy();return}res.set({'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="cargoorbit-exit-export.tar.gz"','Cache-Control':'private, no-store','X-Archive-SHA256':job.sha256,'X-Archive-Bytes':String(job.bytes)});stream.once('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res)}
 @Get('archive/download') async archive(@Req() req:ExitRequest,@Res() res:Response){await auth.limit('exit-archive',req.exit.user.id,5,3600);await database.transaction(req.exit.actor,tx=>tx.audit('tenant.exit_archive.requested',req.exit.receiptId));const signal=downloadLifetime(req,res);if(signal.aborted)return;const stream=tenantArchive(req.exit.actor,signal);res.set({'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="cargoorbit-exit-current-archive.tar.gz"','Cache-Control':'private, no-store'});stream.once('error',()=>res.destroy());res.once('close',()=>stream.destroy());stream.pipe(res)}
}
