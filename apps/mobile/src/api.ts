import * as FileSystem from 'expo-file-system/legacy';
import type { Session, Consignment, Operation } from './types';
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://10.0.2.2:4000/v1').replace(/\/$/,'');
if (!__DEV__ && !API_URL.startsWith('https://')) throw new Error('Release builds require an HTTPS EXPO_PUBLIC_API_URL.');
export class ApiError extends Error { constructor(public status:number,message:string) {super(message);} }
async function request<T>(path:string,token?:string,body?:unknown,operationId?:string):Promise<T> {
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),30000);
  try {
    const response=await fetch(`${API_URL}${path}`,{method:body===undefined?'GET':'POST',signal:controller.signal,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(operationId?{'Idempotency-Key':operationId}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json().catch(()=>({message:`Request failed (${response.status})`}));
    if (!response.ok) throw new ApiError(response.status,typeof data.message==='string'?data.message:`Request failed (${response.status})`);
    return data as T;
  } finally {clearTimeout(timeout);}
}
export function login(email:string,password:string,otp?:string):Promise<Session> {return request<Session>('/auth/login',undefined,{email:email.trim().toLowerCase(),password,...(otp?{otp}:{})});}
export async function assignedWork(session:Session):Promise<Consignment[]> {const result=await request<Consignment[]|{items:Consignment[]}>('/resources/consignments',session.accessToken);return Array.isArray(result)?result:result.items;}
export function postAction(session:Session,action:string,input:unknown,operationId:string):Promise<Record<string,unknown>> {return request(`/actions/${action}`,session.accessToken,input,operationId);}
export async function uploadPhoto(session:Session,operation:Operation,base64:string):Promise<Record<string,unknown>> {
  if (!FileSystem.cacheDirectory) throw new Error('Temporary upload directory is unavailable.');
  const uri=`${FileSystem.cacheDirectory}cargoorbit-upload-${operation.id}.jpg`;
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);
  try {
    await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});
    const form=new FormData();
    form.append('file',{uri,name:`evidence-${operation.id}.jpg`,type:'image/jpeg'} as unknown as Blob);
    form.append('consignmentId',operation.consignmentId);form.append('clientOperationId',operation.id);
    if (operation.sha256) form.append('sha256',operation.sha256);
    const response=await fetch(`${API_URL}/evidence`,{method:'POST',headers:{Authorization:`Bearer ${session.accessToken}`,'Idempotency-Key':operation.id,...(operation.sha256?{'X-Content-SHA256':operation.sha256}:{})},body:form,signal:controller.signal});
    const result=await response.json().catch(()=>({message:`Upload failed (${response.status})`}));
    if (!response.ok) throw new ApiError(response.status,result.message||`Upload failed (${response.status})`);
    return result;
  } finally {clearTimeout(timeout);await FileSystem.deleteAsync(uri,{idempotent:true}).catch(()=>undefined);}
}
