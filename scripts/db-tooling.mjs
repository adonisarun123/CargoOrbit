import {spawn} from 'node:child_process';
import {realpath} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
export function postgresEnvironment(connectionString){
 const url=new URL(connectionString);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Expected a PostgreSQL URL');
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGCONNECT_TIMEOUT:'15',PGAPPNAME:'cargoorbit-operator'};
 for(const [key,target] of [['sslmode','PGSSLMODE'],['sslrootcert','PGSSLROOTCERT'],['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY']])if(url.searchParams.has(key))env[target]=url.searchParams.get(key);
 return env;
}
export async function postgresTool(binary,args,connectionString){
 const env=postgresEnvironment(connectionString);let command=binary,commandArgs=args;
 if(process.env.POSTGRES_CLIENT_IMAGE){
  if(!['pg_dump','pg_restore'].includes(binary)||!/^postgres:17-alpine(?:@sha256:[a-f0-9]{64})?$/.test(process.env.POSTGRES_CLIENT_IMAGE))throw new Error('Only the PostgreSQL 17 client image and archive tools are permitted');
  const directory=process.env.POSTGRES_TOOL_DIRECTORY;if(!directory||!isAbsolute(directory)||directory==='/')throw new Error('POSTGRES_TOOL_DIRECTORY must name the isolated absolute backup directory');
  const mount=await realpath(directory);command='docker';commandArgs=['run','--rm','--network','host','--user',`${process.getuid?.()??1000}:${process.getgid?.()??1000}`,'--volume',`${mount}:${mount}`,...Object.keys(env).filter(key=>key.startsWith('PG')).flatMap(key=>['--env',key]),process.env.POSTGRES_CLIENT_IMAGE,binary,...args];
 }
 await new Promise((resolve,reject)=>{const child=spawn(command,commandArgs,{env,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>{error+=b.toString().slice(0,2000)});child.on('error',()=>reject(new Error(`${binary} could not start; install matching PostgreSQL client binaries`)));child.on('exit',code=>{if(code===0)resolve();else reject(new Error(`${binary} failed (exit ${code}); no database credential or tool stderr is included in shared logs`));});});
}
