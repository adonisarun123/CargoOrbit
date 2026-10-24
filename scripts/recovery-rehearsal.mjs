import {mkdtemp,mkdir,readFile,writeFile,readdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import pg from 'pg';
import {Database} from '@cargoorbit/database';
process.umask(0o077);
const adminUrl=process.env.RECOVERY_DRILL_DATABASE_URL;
if(!adminUrl||process.env.RECOVERY_DRILL_EXECUTE!=='isolated-fixtures')throw new Error('Set RECOVERY_DRILL_DATABASE_URL and RECOVERY_DRILL_EXECUTE=isolated-fixtures for a disposable local PostgreSQL cluster');
const parsed=new URL(adminUrl);if(!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname)||!parsed.pathname.includes('test'))throw new Error('Rehearsal requires a local database URL with test in its name; production use is prohibited');
const runId=randomUUID().replaceAll('-','').slice(0,16),sourceName=`co_${runId}_recovery_source`,targetName=`co_${runId}_restore_drill`,probeRole=`co_${runId}_probe`,password=randomBytes(24).toString('hex');
const urlFor=(database,user=parsed.username,pass=decodeURIComponent(parsed.password))=>{const url=new URL(adminUrl);url.pathname=`/${database}`;url.username=user;url.password=pass;return url.href};
const root=await mkdtemp(join(tmpdir(),'cargoorbit-recovery-')),backup=join(root,'backup'),original=join(root,'original'),recovered=join(root,'recovered');for(const path of [backup,original,recovered])await mkdir(path);
const started=Date.now(),admin=new pg.Pool({connectionString:adminUrl,max:1});let source,probe;const created=[];
async function command(script,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>{output+=chunk.toString().slice(0,20000)});child.stderr.resume();child.on('error',()=>reject(new Error('Rehearsal subprocess could not start')));child.on('exit',code=>code===0?resolve(output):reject(new Error(`Rehearsal subprocess failed: ${script} (${code}); credentials and stderr omitted`)));});}
try{
 for(const name of [sourceName,targetName]){await admin.query(`CREATE DATABASE "${name}"`);created.push(name)}
 await command('packages/database/dist/migrate.js',{MIGRATION_DATABASE_URL:urlFor(sourceName)});
 source=new pg.Pool({connectionString:urlFor(sourceName),max:1});
 await admin.query(`CREATE ROLE "${probeRole}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'`);
 await admin.query(`GRANT cargoorbit_app TO "${probeRole}"`);
 const tenantId=`recovery-${runId}`,bytes=Buffer.from(`Original evidence recovery fixture ${runId}\n`),sha256=createHash('sha256').update(bytes).digest('hex'),key=`${tenantId}/evidence/original.txt`,version='fixture-version-1';
 await writeFile(join(original,'original.txt'),bytes,{mode:0o600});
 await source.query('INSERT INTO tenants(id,name) VALUES($1,$2)',[tenantId,'Disposable recovery fixture']);
 const evidence={id:'original',objectKey:key,objectVersion:version,sha256,size:bytes.length,scanStatus:'clean'},pod={id:'accepted-pod',status:'accepted',acceptedPayload:{evidence:[evidence]},receiptReference:'RECOVERY-FIXTURE-ONLY'};
 for(const [kind,data] of [['evidence',evidence],['pods',pod]])await source.query('INSERT INTO entities(tenant_id,kind,id,data) VALUES($1,$2,$3,$4)',[tenantId,kind,data.id,JSON.stringify(data)]);
 const backupStarted=Date.now();await command('scripts/backup-database.mjs',{BACKUP_DATABASE_URL:urlFor(sourceName),BACKUP_DIRECTORY:backup,POSTGRES_TOOL_DIRECTORY:backup});
 const manifestName=(await readdir(backup)).find(name=>name.endsWith('.manifest.json'));if(!manifestName)throw new Error('Snapshot manifest not created');const manifest=join(backup,manifestName);
 await cp(join(original,'original.txt'),join(backup,'original.txt'));await rm(original,{recursive:true});
 const backupSeconds=(Date.now()-backupStarted)/1000,restoreStarted=Date.now();await command('scripts/restore-drill.mjs',{RESTORE_DATABASE_URL:urlFor(targetName),BACKUP_MANIFEST:manifest,POSTGRES_TOOL_DIRECTORY:backup});
 await cp(join(backup,'original.txt'),join(recovered,'original.txt'));const restored=await readFile(join(recovered,'original.txt'));if(createHash('sha256').update(restored).digest('hex')!==sha256)throw new Error('Restored original bytes failed checksum');
 probe=new Database(urlFor(targetName,probeRole,password));await probe.assertRuntimeRole();await probe.transaction({tenantId,userId:'recovery-probe',role:'auditor'},async tx=>{const actual=await tx.get('pods','accepted-pod'),attachment=await tx.get('evidence','original');if(!isDeepStrictEqual(actual?.acceptedPayload,pod.acceptedPayload)||attachment?.sha256!==sha256||attachment?.objectVersion!==version)throw new Error('Application recovery read differs from captured evidence');});
 const result={format:'cargoorbit-recovery-rehearsal-v1',scope:'synthetic local PostgreSQL17 and file-object fixture; not production S3/PITR or RPO evidence',status:'passed',startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),backupSeconds,restoreSeconds:(Date.now()-restoreStarted)/1000,totalSeconds:(Date.now()-started)/1000,databaseCountsAndReferencesVerified:true,objectVersions:1,objectBytes:restored.length,restoredObjectChecksumVerified:true,restrictedRuntimeApplicationReadReplayed:true,applicationAcceptanceReplayed:false,cloudBackupDisposalOrPitrVerified:false};
 const report=resolve(process.env.RECOVERY_DRILL_REPORT||'test-results/recovery-rehearsal.json');await mkdir(resolve(report,'..'),{recursive:true});await writeFile(report,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}finally{
 await probe?.close();await source?.end();for(const name of created.reverse())await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);await admin.query(`DROP ROLE IF EXISTS "${probeRole}"`);await admin.end();await rm(root,{recursive:true,force:true});
}
