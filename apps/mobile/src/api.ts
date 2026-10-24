import * as FileSystem from 'expo-file-system/legacy';
import type {Session,Consignment,Attempt,Pod,Operation,WorkSnapshot,BarcodeMapping} from './types';
import {ApiError,SessionClient,type RawRequest} from './session-client';
export {ApiError,SessionClient} from './session-client';
export const API_URL=(process.env.EXPO_PUBLIC_API_URL||'http://10.0.2.2:4000/v1').replace(/\/$/,'');
const parsed=new URL(API_URL);
if(!__DEV__&&parsed.protocol!=='https:')throw new Error('Release builds require an HTTPS EXPO_PUBLIC_API_URL.');
if(parsed.username||parsed.password||parsed.search||parsed.hash)throw new Error('API URL must not contain credentials, query parameters or a fragment.');
export const request:RawRequest=async<T>(path:string,token?:string,body?:unknown,operationId?:string):Promise<T>=>{
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
 try{const response=await fetch(`${API_URL}${path}`,{method:body===undefined?'GET':'POST',signal:controller.signal,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...(operationId?{'Idempotency-Key':operationId}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await response.json().catch(()=>({message:`Request failed (${response.status})`}));
 if(!response.ok)throw new ApiError(response.status,typeof data.message==='string'?data.message:`Request failed (${response.status})`,data.code,data.details);
 return data as T;}finally{clearTimeout(timeout);}
};
export function login(email:string,password:string,otp?:string,membershipId?:string):Promise<Session>{return request('/auth/login',undefined,{email:email.trim().toLowerCase(),password,...(otp?{otp}:{}),...(membershipId?{membershipId}:{})});}
async function pages<T>(client:SessionClient,resource:string):Promise<T[]>{const result:T[]=[];for(let offset=0;offset<10000;offset+=200){const value=await client.request<T[]|{items:T[]}>(`/resources/${resource}?limit=200&offset=${offset}`);const rows=Array.isArray(value)?value:value.items;if(!Array.isArray(rows))throw new Error('Server assignment response was invalid.');result.push(...rows);if(rows.length<200)return result;}throw new Error('Assignment list exceeds device capacity. Operations must reduce active assignments.');}
export async function assignedWork(client:SessionClient):Promise<WorkSnapshot>{
 // Fetch concurrently but share a serialized refresh coordinator.
 const [consignments,attempts,pods,barcodes]=await Promise.all([pages<Consignment>(client,'consignments'),pages<Attempt>(client,'attempts'),pages<Pod>(client,'pods'),pages<BarcodeMapping>(client,'barcodes')]);
 return {consignments,attempts,pods,barcodes,fetchedAt:new Date().toISOString()};
}
export function transport(client:SessionClient){return {postAction:(action:string,input:unknown,operationId:string)=>client.request<Record<string,unknown>>(`/actions/${action}`,input,operationId),uploadPhoto:(op:Operation,base64:string)=>uploadPhoto(client,op,base64)};}
/** Remove only CargoOrbit-created temporary upload files left by an interrupted process. */
export async function cleanupTemporaryPhotos():Promise<void>{if(!FileSystem.cacheDirectory)return;for(const name of await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory)){if(/^cargoorbit-upload-[a-f0-9-]+\.jpg$/.test(name))await FileSystem.deleteAsync(`${FileSystem.cacheDirectory}${name}`,{idempotent:true});}}
async function uploadPhoto(client:SessionClient,op:Operation,base64:string):Promise<Record<string,unknown>>{
 if(!FileSystem.cacheDirectory)throw new Error('Temporary upload directory is unavailable.');
 if(!/^[a-f0-9-]{36}$/.test(op.id))throw new Error('Invalid queued photo identifier.');
 const uri=`${FileSystem.cacheDirectory}cargoorbit-upload-${op.id}.jpg`;
 try{
 await FileSystem.writeAsStringAsync(uri,base64,{encoding:FileSystem.EncodingType.Base64});
 return await client.withToken(async token=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);try{
 const form=new FormData();form.append('file',{uri,name:`evidence-${op.id}.jpg`,type:'image/jpeg'} as unknown as Blob);
 form.append('consignmentId',op.consignmentId);if(typeof op.payload.attemptId==='string')form.append('attemptId',op.payload.attemptId);form.append('clientOperationId',op.id);form.append('captureMethod','android');form.append('documentType','photo');if(typeof op.payload.capturedAt==='string')form.append('capturedAt',op.payload.capturedAt);
 const response=await fetch(`${API_URL}/evidence`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Idempotency-Key':op.id,...(op.sha256?{'X-Content-SHA256':op.sha256}:{})},body:form,signal:controller.signal});
 const data=await response.json().catch(()=>({message:`Upload failed (${response.status})`}));if(!response.ok)throw new ApiError(response.status,data.message||`Upload failed (${response.status})`,data.code,data.details);
 const result=data.evidence||data;if(op.sha256&&result.sha256!==op.sha256)throw new ApiError(409,'Server acknowledgement checksum differs from captured photo. Contact operations.','PHOTO_CHECKSUM');return data;
 }finally{clearTimeout(timeout);}});
 }finally{await FileSystem.deleteAsync(uri,{idempotent:true});}
}
