import {createHash} from 'node:crypto';
import type {EntityPageQuery} from './types.js';
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:JSON.stringify(value);
export function pageBounds(tenantId:string,kind:string,query:EntityPageQuery={}){
 if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(kind)||['audit','outbox'].includes(kind))throw new Error('page requires a business entity kind');
 const limit=query.limit??100;if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error('Invalid page bounds');
 if(query.before&&!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(query.before.field))throw new Error('Invalid filter field');
 const where=JSON.parse(JSON.stringify(query.where??{})),fingerprint=createHash('sha256').update(canonical({tenantId,kind,where,before:query.before??null})).digest('hex');
 let afterId:string|undefined;
 if(query.cursor){try{if(query.cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(query.cursor))throw new Error();const value=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));if(value.version!==1||value.fingerprint!==fingerprint||typeof value.id!=='string'||!value.id||value.id.length>200)throw new Error();afterId=value.id;}catch{throw new Error('Invalid page cursor or changed query scope');}}
 return {limit,where,afterId,cursor:(id:string)=>Buffer.from(JSON.stringify({version:1,fingerprint,id})).toString('base64url')};
}
