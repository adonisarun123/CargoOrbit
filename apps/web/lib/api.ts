export type User = {id:string;name:string;email:string;role:string;tenantId:string;organizationId?:string;facilityIds?:string[]};
export type Session = {accessToken:string;user:User};
export type Row = {id:string;[key:string]:any};
const BASE=(process.env.NEXT_PUBLIC_API_URL||'http://localhost:4000/v1').replace(/\/$/,'');
export class ApiError extends Error {constructor(public status:number,message:string,public code?:string){super(message)}}
export async function request<T=any>(path:string,token?:string,body?:unknown,method?:string):Promise<T>{
  const headers:Record<string,string>={};
  if(token)headers.Authorization=`Bearer ${token}`;
  if(body!==undefined)headers['Content-Type']='application/json';
  const response=await fetch(`${BASE}${path}`,{method:method||(body!==undefined?'POST':'GET'),headers,body:body!==undefined?JSON.stringify(body):undefined,cache:'no-store'});
  const data=await response.json().catch(()=>({message:response.statusText}));
  if(!response.ok)throw new ApiError(response.status,Array.isArray(data.message)?data.message.join(', '):data.message||'The request could not be completed.',data.code);
  return data as T;
}
export const query=(token:string,resource:string,id?:string)=>request(`/resources/${resource}${id?`/${encodeURIComponent(id)}`:''}`,token);
export const action=(token:string,name:string,input:unknown)=>request(`/actions/${name}`,token,input);
export function rows(value:any):Row[]{if(Array.isArray(value))return value;return value?.items||value?.data||value?.records||[]}
export async function uploadEvidence(token:string,podId:string,file:File){
  const form=new FormData();form.append('file',file);form.append('podId',podId);
  const response=await fetch(`${BASE}/evidence/uploads`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});
  const data=await response.json().catch(()=>({message:'The file upload failed.'}));
  if(!response.ok)throw new ApiError(response.status,data.message||'The file upload failed.');
  return data;
}
export async function downloadAuthorized(token:string,path:string,filename:string){
  const response=await fetch(`${BASE}${path}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok){const err=await response.json().catch(()=>({}));throw new ApiError(response.status,err.message||'This download is not available.')}
  const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const currency=(value:unknown)=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value)||0);
export const number=(value:unknown)=>new Intl.NumberFormat('en-IN').format(Number(value)||0);
export function date(value:unknown,full=false){if(!value)return 'Not recorded';const d=new Date(String(value));return Number.isNaN(d.getTime())?'Not recorded':new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',...(full?{year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}:{}),timeZone:'Asia/Kolkata'}).format(d)}
export const label=(value:unknown)=>String(value||'Not recorded').replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,c=>c.toUpperCase());
export const idKey=(row:Row)=>row.lrNumber||row.number||row.invoiceNumber||row.name||row.reference||row.id.slice(0,8);
