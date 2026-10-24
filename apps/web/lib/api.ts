export type User = {id:string;name:string;email:string;role:string;tenantId:string;organizationId?:string;facilityIds?:string[];assignedDriverId?:string;membershipId?:string;mfaEnabled?:boolean;verifiedContact?:string;sessionId?:string};
export type Session = {accessToken:string;refreshToken?:string;expiresIn?:number;user:User};
export type Row = {id:string;[key:string]:any};
export const API_BASE=(process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/v1').replace(/\/$/,'');
export const SESSION_KEY='cargoorbit.session';
export class ApiError extends Error {constructor(public status:number,message:string,public code?:string,public details?:any,public requestId?:string){super(message)}}
let refreshInFlight:Promise<Session>|null=null;const replacements=new Map<string,string>();
export function readSession():Session|null {if(typeof window==='undefined')return null;try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
export function persistSession(session:Session){sessionStorage.setItem(SESSION_KEY,JSON.stringify(session));window.dispatchEvent(new CustomEvent('cargoorbit:session',{detail:session}));}
export async function refreshSession():Promise<Session>{if(refreshInFlight)return refreshInFlight;const old=readSession();if(!old?.refreshToken)throw new ApiError(401,'Your session has expired. Sign in to continue.');refreshInFlight=(async()=>{const response=await fetchWithTimeout('/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:old.refreshToken})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new ApiError(response.status,'Your session has expired. Sign in to continue.');const current=readSession();if(current?.accessToken!==old.accessToken||current?.refreshToken!==old.refreshToken)throw new ApiError(401,'Account or workspace changed while refreshing the session.');replacements.set(old.accessToken,data.accessToken);if(replacements.size>8)replacements.delete(replacements.keys().next().value!);persistSession(data);return data;})().finally(()=>{refreshInFlight=null});return refreshInFlight;}
export async function fetchWithTimeout(path:string,init:RequestInit={},timeout=30000):Promise<Response>{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);try{return await fetch(`${API_BASE}${path}`,{...init,signal:controller.signal,cache:'no-store'})}catch(error){if(controller.signal.aborted)throw new ApiError(408,'The service did not respond in time. Check the record before retrying; the operation may have completed.');throw new ApiError(0,'Unable to reach CargoOrbit. Check your connection and retry.')}finally{clearTimeout(timer)}}
async function authorizedFetch(path:string,token?:string,init:RequestInit={}):Promise<Response>{const headers=new Headers(init.headers);let effective=token;while(effective&&replacements.has(effective))effective=replacements.get(effective);if(effective)headers.set('Authorization',`Bearer ${effective}`);let response=await fetchWithTimeout(path,{...init,headers});if(response.status===401&&effective&&!['/auth/login','/auth/refresh','/auth/step-up','/auth/logout'].includes(path)){let replacement=effective;while(replacements.has(replacement))replacement=replacements.get(replacement)!;if(readSession()?.accessToken!==replacement)throw new ApiError(401,'The account changed or the session ended. Sign in again.');const session=replacement!==effective?readSession()!:await refreshSession();headers.set('Authorization',`Bearer ${session.accessToken}`);response=await fetchWithTimeout(path,{...init,headers});}return response;}
export async function request<T=any>(path:string,token?:string,body?:unknown,method?:string,extraHeaders:Record<string,string>={}):Promise<T>{
 const headers:Record<string,string>={...extraHeaders};if(body!==undefined)headers['Content-Type']='application/json';
 const response=await authorizedFetch(path,token,{method:method||(body!==undefined?'POST':'GET'),headers,body:body!==undefined?JSON.stringify(body):undefined});
 const data=await response.json().catch(()=>({message:response.statusText}));
 if(!response.ok)throw new ApiError(response.status,Array.isArray(data.message)?data.message.join(', '):data.message||'The request could not be completed.',data.code||data.details?.code,data.details,data.requestId);
 return data as T;
}
export const query=(token:string,resource:string,id?:string,offset=0,limit=200)=>request(`/resources/${resource}${id?`/${encodeURIComponent(id)}`:`?limit=${limit}&offset=${offset}`}`,token);
export const action=(token:string,name:string,input:unknown,stepUpToken?:string)=>request(`/actions/${name}`,token,input,undefined,stepUpToken?{'X-Step-Up':stepUpToken}:{});
export function rows(value:any):Row[]{if(Array.isArray(value))return value;return value?.items||value?.data||value?.records||[]}
export function mergeRows(previous:Row[],next:Row[]){return [...new Map([...previous,...next].map(row=>[row.id,row])).values()]}
export const STEP_UP_SCOPES:Record<string,string>={resolveReviewTask:'finance:adjust',updateOrganization:'policy:change',updateFacility:'policy:change',grantReceiver:'receiver:grant',revokeGrant:'receiver:revoke',createPolicy:'policy:change',applyPolicy:'policy:change',overrideDueDate:'finance:adjust',verifyAllocation:'finance:adjust',reverseAllocation:'finance:adjust',voidInvoice:'finance:adjust',resolveDispute:'finance:adjust'};
export async function stepUp(session:Session,scope:string,password:string,otp:string){await request('/auth/me',session.accessToken);return request<{stepUpToken:string;expiresIn:number}>('/auth/step-up',session.accessToken,{scope,password,...(otp?{otp}:{})})}
export async function uploadEvidence(token:string,consignmentId:string,file:File,operationId:string,documentType='photo',attemptId?:string){
 if(!file.size)throw new ApiError(400,'Choose a nonempty file.');if(file.size>10*1024*1024)throw new ApiError(413,'Choose a file smaller than 10 MB.');const form=new FormData();form.append('file',file);form.append('consignmentId',consignmentId);form.append('clientOperationId',operationId);form.append('documentType',documentType);if(attemptId)form.append('attemptId',attemptId);
 const response=await authorizedFetch('/evidence',token,{method:'POST',body:form});const data=await response.json().catch(()=>({message:'The file upload failed.'}));if(!response.ok)throw new ApiError(response.status,data.message||'The file upload failed.',data.code,data.details);return data;
}
export async function downloadAuthorized(token:string,path:string,filename:string,headers:Record<string,string>={}){
 const response=await authorizedFetch(path,token,{headers});if(!response.ok){const err=await response.json().catch(()=>({}));throw new ApiError(response.status,err.message||'This download is not available.')}
 const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// Acquire the destination directly from the user's click before step-up/network awaits.
export async function archiveDestination(filename:string):Promise<FileSystemFileHandle|null>{
 const picker=(window as any).showSaveFilePicker;if(!picker)return null;
 return picker({suggestedName:filename,types:[{description:'Workspace archive',accept:{'application/gzip':['.gz']}}]});
}
export async function downloadArchive(token:string,path:string,filename:string,headers:Record<string,string>,destination:FileSystemFileHandle|null,expectedHash?:string){
 const response=await authorizedFetch(path,token,{headers});return saveArchiveResponse(response,filename,destination,expectedHash);
}
export async function saveArchiveResponse(response:Response,filename:string,destination:FileSystemFileHandle|null,expectedHash?:string){
 if(!response.ok){const err=await response.json().catch(()=>({}));throw new ApiError(response.status,err.message||'This archive is not available.')}
 if(expectedHash&&response.headers.get('X-Archive-SHA256')!==expectedHash){await response.body?.cancel();throw new Error('The archive checksum header differs from the reviewed export. Refresh and investigate before downloading.')}
 if(!response.body)throw new Error('The archive stream is unavailable.');
 const length=response.headers.get('X-Archive-Bytes');
 if(destination){const writable=await destination.createWritable();let bytes=0;const counted=new TransformStream<Uint8Array,Uint8Array>({transform(chunk,controller){bytes+=chunk.byteLength;controller.enqueue(chunk)},flush(){if(length&&bytes!==Number(length))throw new Error('The archive stream ended before all bytes arrived. Download it again.')}});await response.body.pipeThrough(counted).pipeTo(writable);return}
 const limit=128*1024*1024;if(length&&Number(length)>limit){await response.body.cancel();throw new Error('This browser cannot stream this archive to disk. Use a browser with the file save picker for archives over 128 MiB.')}
 const reader=response.body.getReader(),chunks:Uint8Array<ArrayBuffer>[]=[];let total=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Error('Archive exceeds this browser’s 128 MiB download limit. Use a browser with the file save picker.')}chunks.push(value as Uint8Array<ArrayBuffer>)}if(length&&total!==Number(length))throw new Error('The archive stream ended before all bytes arrived. Download it again.');const url=URL.createObjectURL(new Blob(chunks,{type:'application/gzip'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}finally{reader.releaseLock()}
}
export const currency=(value:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(value)||0);
export const number=(value:unknown)=>new Intl.NumberFormat('en-IN').format(Number(value)||0);
export function date(value:unknown,full=false){if(!value)return 'Not recorded';const d=new Date(String(value));return Number.isNaN(d.getTime())?'Not recorded':new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',...(full?{year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}:{}),timeZone:'Asia/Kolkata'}).format(d)}
export const label=(value:unknown)=>String(value||'Not recorded').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase());
export const idKey=(row:Row)=>row.lrNumber||row.number||row.invoiceNumber||row.name||row.reference||row.id?.slice(0,8)||'Record';
