import type {Session} from './types';
export class ApiError extends Error {constructor(public status:number,message:string,public code?:string,public details?:unknown){super(message);this.name='ApiError';}}
export type RawRequest=<T>(path:string,token?:string,body?:unknown,operationId?:string)=>Promise<T>;
/** Serializes one-time refresh rotation across all requests belonging to one named account. */
export class SessionClient {
 private refresh:Promise<void>|null=null;
 private stopped=false;
 constructor(private current:Session,private raw:RawRequest,private persist:(session:Session)=>Promise<void>){}
 get session(){return this.current;}
 dispose(){this.stopped=true;}
 async settled():Promise<void>{await this.refresh?.catch(()=>undefined);}
 private ensureActive(){if(this.stopped)throw new ApiError(401,'Account was closed. Sign in again.','ACCOUNT_CLOSED');}
 async request<T>(path:string,body?:unknown,operationId?:string):Promise<T>{return this.withToken(token=>this.raw<T>(path,token,body,operationId));}
 async withToken<T>(operation:(token:string)=>Promise<T>):Promise<T>{
  this.ensureActive();const used=this.current.accessToken;
  try{return await operation(used);}catch(error){
   if(!(error instanceof ApiError)||error.status!==401||!this.current.refreshToken)throw error;
   this.ensureActive();
   if(this.current.accessToken===used){
    if(!this.refresh)this.refresh=this.rotate().finally(()=>{this.refresh=null;});
    await this.refresh;
   }
   this.ensureActive();return operation(this.current.accessToken);
  }
 }
 private async rotate(){
  try{
   const next=await this.raw<Session>('/auth/refresh',undefined,{refreshToken:this.current.refreshToken});
   this.ensureActive();
   if(next.user.id!==this.current.user.id||next.user.tenantId!==this.current.user.tenantId||next.user.membershipId!==this.current.user.membershipId||next.user.role!=='driver')throw new ApiError(401,'Refreshed account scope changed. Sign in again.','REFRESH_SCOPE');
   // A failed secure persistence aborts the retry: never silently lose a rotated refresh token.
   await this.persist(next);this.ensureActive();this.current=next;
  }catch(error){
   // One-time refresh may already have committed remotely. Do not replay an uncertain token.
   this.stopped=true;
   if(error instanceof ApiError)throw error;
   throw new ApiError(401,'Session refresh could not complete safely. Sign in again.','REFRESH_UNCERTAIN');
  }
 }
 async logout():Promise<void>{try{await this.raw('/auth/logout',this.current.accessToken,{});}finally{this.dispose();}}
}
