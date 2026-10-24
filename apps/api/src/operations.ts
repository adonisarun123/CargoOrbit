import {Body,Controller,Get,Post,Param,Req,UseGuards,HttpException,Res} from '@nestjs/common';
import type {RawBodyRequest} from '@nestjs/common';
import type {Request,Response} from 'express';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {AuthGuard,type AuthRequest} from './auth.js';
import {auth,database} from './runtime.js';
import {tenantArchive} from './export.js';
import {OperationsService} from './operations-service.js';
export const operations=new OperationsService(database);
const stepUp=(req:AuthRequest)=>auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'policy:change');
@UseGuards(AuthGuard) @Controller('operations')
export class OperationsController{
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
