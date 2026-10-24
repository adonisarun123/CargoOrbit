import {spawn} from 'node:child_process';
export function postgresEnvironment(connectionString){
 const url=new URL(connectionString);if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Expected a PostgreSQL URL');
 const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGCONNECT_TIMEOUT:'15',PGAPPNAME:'cargoorbit-operator'};
 for(const [key,target] of [['sslmode','PGSSLMODE'],['sslrootcert','PGSSLROOTCERT'],['sslcert','PGSSLCERT'],['sslkey','PGSSLKEY']])if(url.searchParams.has(key))env[target]=url.searchParams.get(key);
 return env;
}
export async function postgresTool(binary,args,connectionString){
 const env=postgresEnvironment(connectionString);
 await new Promise((resolve,reject)=>{const child=spawn(binary,args,{env,stdio:['ignore','ignore','pipe']});let error='';child.stderr.on('data',b=>{error+=b.toString().slice(0,2000)});child.on('error',()=>reject(new Error(`${binary} could not start; install matching PostgreSQL client binaries`)));child.on('exit',code=>{if(code===0)resolve();else reject(new Error(`${binary} failed (exit ${code}); no database credential or tool stderr is included in shared logs`));});});
}
