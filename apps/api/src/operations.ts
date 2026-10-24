import {Body,Controller,Get,Post,Param,Req,UseGuards,HttpException,Res,Query} from '@nestjs/common';
import type {RawBodyRequest} from '@nestjs/common';
import type {Request,Response} from 'express';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {AuthGuard,type AuthRequest} from './auth.js';
import {auth,database} from './runtime.js';
import {tenantArchive} from './export.js';
import {OperationsService} from './operations-service.js';
import {TaskService} from './operations-tasks.js';
import {ExportService} from './export-jobs.js';
export const operations=new OperationsService(database);
const tasks=new TaskService(database),exports=new ExportService(database);
const stepUp=(req:AuthRequest)=>auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'policy:change');
@UseGuards(AuthGuard) @Controller('operations')
export class OperationsController{
 @Get('tasks') tasks(@Req() req:AuthRequest){return tasks.list(req.actor)}
 @Get('task-pages') taskPage(@Query('source') source:string,@Query('cursor') cursor:string|undefined,@Req() req:AuthRequest){return tasks.page(req.actor,source,cursor)}
 @Post('tasks') createTask(@Body() body:unknown,@Req() req:AuthRequest){return tasks.create(req.actor,body)}
 @Post('tasks/:source/:id/transition') transition(@Param('source') source:string,@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){return tasks.transition(req.actor,source,id,body)}
 @Get('inbox') inbox(@Req() req:AuthRequest){return tasks.inbox(req.actor)}
 @Get('inbox-page') inboxPage(@Query('cursor') cursor:string|undefined,@Req() req:AuthRequest){return tasks.inboxPage(req.actor,cursor)}
 @Post('inbox/:id/read') read(@Param('id') id:string,@Req() req:AuthRequest){return tasks.read(req.actor,id)}
 @Get('exports') exports(@Req() req:AuthRequest){return exports.list(req.actor)}
 @Post('exports') requestExport(@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return exports.request(req.actor,body)}
 @Post('exports/:id/acknowledge') acknowledge(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return exports.acknowledge(req.actor,id,body)}
 @Get('exports/:id/download') async downloadExport(@Param('id') id:string,@Req() req:AuthRequest,@Res() res:Response){stepUp(req);const abort=new AbortController();res.once('close',()=>abort.abort());const result=await exports.download(req.actor,id,AbortSignal.any([abort.signal,AbortSignal.timeout(1800000)]));if(res.destroyed){result.stream.destroy();return;}res.set({'Content-Type':'application/gzip','Content-Disposition':`attachment; filename="cargoorbit-export-${id}.tar.gz"`,'Cache-Control':'private, no-store','X-Archive-SHA256':result.sha256,'X-Archive-Bytes':String(result.bytes)});result.stream.on('error',()=>res.destroy());res.on('close',()=>result.stream.destroy());result.stream.pipe(res);}
 @Get('usage') usage(@Req() req:AuthRequest){if(!['owner','auditor'].includes(req.actor.role))throw new HttpException('Tenant administration required',403);return database.transaction(req.actor,tx=>tx.usage())}
 @Get('archive/download') async archive(@Req() req:AuthRequest,@Res() res:Response){if(req.actor.role!=='owner')throw new HttpException('Tenant owner required',403);stepUp(req);res.set({'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="cargoorbit-export.tar.gz"','Cache-Control':'private, no-store'});const stream=tenantArchive(req.actor);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);}
 @Get(':resource') list(@Param('resource') resource:string,@Req() req:AuthRequest){return operations.list(req.actor,resource)}
 @Post('scheduler') configure(@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return operations.configure(req.actor,body)}
 @Post('legal-holds') hold(@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return operations.legalHold(req.actor,body)}
 @Post('legal-holds/:id/release') release(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return operations.releaseHold(req.actor,id,body)}
 @Post('retention-requests') retention(@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return operations.requestRetention(req.actor,body)}
 @Post('retention-requests/:id/review') review(@Param('id') id:string,@Body() body:unknown,@Req() req:AuthRequest){stepUp(req);return operations.reviewRetention(req.actor,id,body)}
}
@Controller('provider-callbacks')
export class PublicNotificationController{
 @Post('notifications/:tenantId') async callback(@Param('tenantId') tenantId:string,@Req() req:RawBodyRequest<Request>,@Body() body:unknown){
 const secret=process.env.NOTIFICATION_CALLBACK_SECRET,timestamp=String(req.headers['x-cargoorbit-timestamp']||''),signature=String(req.headers['x-cargoorbit-signature']||'');
 if(!secret||secret.length<32||!req.rawBody||!/^[a-f0-9]{64}$/.test(signature)||!/^\d{10}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp)*1000)>300000)throw new HttpException('Invalid callback authentication',401);
 const expected=createHmac('sha256',secret).update(`${tenantId}.${timestamp}.`).update(req.rawBody).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw new HttpException('Invalid callback authentication',401);
 return operations.callback({tenantId,userId:'system:notification-provider',role:'owner'},body);
 }
}
