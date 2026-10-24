import {mkdir,writeFile,rename,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import pg from 'pg';
import {postgresTool} from './db-tooling.mjs';
process.umask(0o077);
const url=process.env.BACKUP_DATABASE_URL,directory=process.env.BACKUP_DIRECTORY;
if(!url||!directory)throw new Error('Set operator-only BACKUP_DATABASE_URL and BACKUP_DIRECTORY on encrypted storage');
const output=resolve(directory);await mkdir(output,{recursive:true,mode:0o700});
const name=`cargoorbit-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
const dump=join(output,`${name}.dump`),partial=`${dump}.partial`,manifest=join(output,`${name}.manifest.json`);
const pool=new pg.Pool({connectionString:url,max:1}),client=await pool.connect();
try{
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const snapshot=(await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
 const evidence=(await client.query("SELECT tenant_id,kind,id,data->>'objectKey' object_key,data->>'objectVersion' object_version,data->>'sha256' sha256 FROM entities WHERE kind IN ('evidence','packets') ORDER BY tenant_id,kind,id")).rows;
 const counts=(await client.query('SELECT tenant_id,kind,count(*)::text count FROM entities GROUP BY tenant_id,kind ORDER BY tenant_id,kind')).rows;
 await postgresTool('pg_dump',['--format=custom','--no-owner',`--snapshot=${snapshot}`,'--file',partial],url);
 await client.query('COMMIT');
 const sha=createHash('sha256');for await(const chunk of createReadStream(partial))sha.update(chunk);const hash=sha.digest('hex');
 const result={format:'cargoorbit-backup-v1',createdAt:new Date().toISOString(),databaseArchive:`${name}.dump`,sha256:hash,bytes:(await stat(partial)).size,entityCounts:counts,evidence,objectBackupStatus:'must_reconcile_and_copy_exact_versions_separately'};
 await writeFile(`${manifest}.partial`,JSON.stringify(result,null,2)+'\n',{mode:0o600});await rename(partial,dump);await rename(`${manifest}.partial`,manifest);
 console.log(JSON.stringify({status:'database_snapshot_created',archive:dump,manifest,evidenceObjects:evidence.length,objectBackupComplete:false}));
}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();await pool.end()}
