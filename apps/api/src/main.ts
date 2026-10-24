import 'reflect-metadata';
import {Module,Catch,type ExceptionFilter,type ArgumentsHost,HttpException} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {NestExpressApplication} from '@nestjs/platform-express';
import {SwaggerModule,DocumentBuilder} from '@nestjs/swagger';
import helmet from 'helmet';
import {randomUUID} from 'node:crypto';
import {ZodError} from 'zod';
import type {Request,Response,NextFunction} from 'express';
import {AuthController,WorkflowController,HealthController} from './controller.js';
import {OidcController} from './oidc.js';
import {AccessController,SupportController,PublicAccessController} from './access.js';
import {ContactController} from './contact.js';
import {AdminController,InvitationController} from './admin.js';
import {database} from './runtime.js';
import {OperationsController,PublicNotificationController} from './operations.js';
import {config,production} from './config.js';
import {verifyStorage} from './storage.js';
@Catch()
export class Errors implements ExceptionFilter{
 catch(error:any,host:ArgumentsHost){const http=host.switchToHttp(),response=http.getResponse<Response>(),req=http.getRequest<Request>();let status=error instanceof HttpException?error.getStatus():error instanceof ZodError?400:Number(error.status)||500;if(status<400||status>599)status=500;const details=error instanceof ZodError?error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})):error instanceof HttpException?error.getResponse():undefined;const structured=typeof details==='object'&&details!==null&&!Array.isArray(details)?details as Record<string,unknown>:undefined;const message=status>=500?'Service temporarily unavailable':error instanceof ZodError?'Request validation failed':typeof structured?.message==='string'?structured.message:error.message||'Request failed';const code=status>=500?'SERVICE_UNAVAILABLE':typeof structured?.code==='string'?structured.code:typeof error.code==='string'&&/^[A-Z_]+$/.test(error.code)?error.code:'REQUEST_ERROR';if(status>=500)console.error(JSON.stringify({level:'error',requestId:req.headers['x-request-id'],error:error.constructor?.name||'Error'}));response.status(status).json({statusCode:status,code,message,...(status<500?{details}:{}),requestId:req.headers['x-request-id']});}
}
@Module({controllers:[AuthController,WorkflowController,HealthController,AdminController,InvitationController,ContactController,OidcController,AccessController,SupportController,PublicAccessController,OperationsController,PublicNotificationController]})
export class ApplicationModule{}
export async function bootstrap(){
 await database.assertRuntimeRole();await verifyStorage();
 const app=await NestFactory.create<NestExpressApplication>(ApplicationModule,{bodyParser:false,rawBody:true});
 app.set('trust proxy',config.trustProxy.length?config.trustProxy:false);
 app.use((req:Request,res:Response,next:NextFunction)=>{const incoming=String(req.headers['x-request-id']||''),id=/^[a-zA-Z0-9_-]{8,80}$/.test(incoming)?incoming:randomUUID();req.headers['x-request-id']=id;res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');const started=performance.now();res.on('finish',()=>{console.log(JSON.stringify({level:'info',event:'request.completed',requestId:id,method:req.method,route:req.route?.path||'unmatched',status:res.statusCode,durationMs:Math.round(performance.now()-started)}));});next();});
 app.setGlobalPrefix('v1');app.use(helmet());app.useBodyParser('json',{limit:'2mb'});app.useBodyParser('urlencoded',{limit:'256kb',extended:false});
 app.enableCors({origin:config.origins,methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type','X-Request-Id','Idempotency-Key','X-Step-Up','X-Content-SHA256'],exposedHeaders:['X-Request-Id','X-Archive-SHA256','X-Archive-Bytes'],credentials:false});
 app.useGlobalFilters(new Errors());
 if(!production){const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('CargoOrbit API').setDescription('Tenant scoped logistics workflows. Sensitive changes require a scoped X-Step-Up token.').setVersion('0.2.0').addBearerAuth().build());SwaggerModule.setup('v1/docs',app,document);}
 app.enableShutdownHooks();await app.listen(config.port,'0.0.0.0');return app;
}
if(process.argv[1]?.endsWith('/main.js')||process.argv[1]?.endsWith('/main.ts'))bootstrap().catch(error=>{console.error(`API startup failed: ${error.constructor?.name||'Error'}`);process.exitCode=1;});
