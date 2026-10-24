import 'reflect-metadata';
import { Module, Catch, type ExceptionFilter, type ArgumentsHost, HttpException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { AuthController, WorkflowController, HealthController } from './controller.js';
import { AdminController, InvitationController } from './admin.js';
import { database } from './runtime.js';
import { config, production } from './config.js';
import { verifyStorage } from './storage.js';
@Catch()
class Errors implements ExceptionFilter {
 catch(error:any,host:ArgumentsHost){const http=host.switchToHttp();const response=http.getResponse<Response>();const req=http.getRequest<Request>();let status=error instanceof HttpException?error.getStatus():error instanceof ZodError?400:Number(error.status)||500;if(status<400||status>599)status=500;const message=error instanceof ZodError?'Request validation failed':status>=500?'Internal service error':error.message||'Request failed';const details=error instanceof ZodError?error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})):error instanceof HttpException?error.getResponse():undefined;if(status>=500)console.error(JSON.stringify({level:'error',requestId:req.headers['x-request-id'],error:production?error.constructor?.name:error.message}));response.status(status).json({statusCode:status,code:error.code||'REQUEST_ERROR',message,details,requestId:req.headers['x-request-id']});}
}
@Module({controllers:[AuthController,WorkflowController,HealthController,AdminController,InvitationController]})
class ApplicationModule{}
async function bootstrap(){
 await database.assertRuntimeRole();await verifyStorage();
 const app=await NestFactory.create(ApplicationModule,{bodyParser:true});
 app.setGlobalPrefix('v1');app.use(helmet());
 app.enableCors({origin:config.origin.split(',').map(v=>v.trim()),methods:['GET','POST','OPTIONS'],allowedHeaders:['Authorization','Content-Type','X-Request-Id','Idempotency-Key'],credentials:false});
 app.use((req:Request,res:Response,next:NextFunction)=>{const incoming=String(req.headers['x-request-id']||'');const id=/^[a-zA-Z0-9_-]{8,80}$/.test(incoming)?incoming:randomUUID();req.headers['x-request-id']=id;res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');next();});
 app.useGlobalFilters(new Errors());
 const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('CargoOrbit API').setDescription('Tenant scoped delivery, evidence, billing and gated expansion workflows. POST /actions/:action and GET /resources/:resource use the shared domain contract.').setVersion('0.1.0').addBearerAuth().build());
 if(!production)SwaggerModule.setup('v1/docs',app,document);
 app.enableShutdownHooks();await app.listen(config.port,'0.0.0.0');
}
bootstrap().catch(error=>{console.error(`API startup failed: ${error.message}`);process.exitCode=1;});
