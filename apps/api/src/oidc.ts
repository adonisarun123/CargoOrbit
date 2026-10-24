import {Body,Controller,Get,Param,Post,Req,UseGuards} from '@nestjs/common';
import type {Request} from 'express';
import {AuthGuard,type AuthRequest} from './auth.js';
import {auth,oidc} from './runtime.js';
const step=(req:AuthRequest)=>auth.requireStepUp(req.user,typeof req.headers['x-step-up']==='string'?req.headers['x-step-up']:undefined,'account:sso');
@Controller('auth/oidc')
export class OidcController{
 @Get('providers') providers(){return oidc.providers()}
 @Post('login/start') async start(@Body() body:unknown,@Req() req:Request){await auth.limit('oidc-start-ip',req.ip||'unknown',20,900);return oidc.start(body)}
 @Post('login/callback') async callback(@Body() body:unknown,@Req() req:Request){await auth.limit('oidc-callback-ip',req.ip||'unknown',30,900);return oidc.callback(body)}
 @Post('login/complete') async complete(@Body() body:unknown,@Req() req:Request){await auth.limit('oidc-complete-ip',req.ip||'unknown',30,900);if(typeof body==='object'&&body&&'completionId' in body)await auth.limit('oidc-complete-flow',String(body.completionId),10,900);return oidc.complete(body)}
 @Post('link/start') @UseGuards(AuthGuard) async link(@Body() body:unknown,@Req() req:AuthRequest){step(req);await auth.limit('oidc-link',req.user.id,10,900);return oidc.start(body,req.actor)}
 @Post('link/callback') @UseGuards(AuthGuard) linked(@Body() body:unknown,@Req() req:AuthRequest){return oidc.callback(body,req.actor)}
 @Get('bindings') @UseGuards(AuthGuard) bindings(@Req() req:AuthRequest){return oidc.bindings(req.actor)}
 @Post('bindings/:id/revoke') @UseGuards(AuthGuard) revoke(@Param('id') id:string,@Req() req:AuthRequest){step(req);return oidc.revoke(req.user,id)}
}
