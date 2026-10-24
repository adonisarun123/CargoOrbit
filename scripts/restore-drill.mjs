import {readFile,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import pg from 'pg';
import {postgresTool,postgresEnvironment} from './db-tooling.mjs';
process.umask(0o077);
const url=process.env.RESTORE_DATABASE_URL,path=process.env.BACKUP_MANIFEST;
if(!url||!path)throw new Error('Set RESTORE_DATABASE_URL and BACKUP_MANIFEST for an isolated recovery drill');
const env=postgresEnvironment(url);if(!/^[a-zA-Z0-9_-]+_restore_drill$/.test(env.PGDATABASE))throw new Error('Restore target database name must end _restore_drill');
const manifest=JSON.parse(await readFile(path,'utf8'));if(manifest.format!=='cargoorbit-backup-v1'||basename(manifest.databaseArchive)!==manifest.databaseArchive)throw new Error('Invalid backup manifest');
const archive=resolve(dirname(path),manifest.databaseArchive),sha=createHash('sha256');for await(const chunk of createReadStream(archive))sha.update(chunk);if(sha.digest('hex')!==manifest.sha256)throw new Error('Database archive checksum mismatch; no restore attempted');
const pool=new pg.Pool({connectionString:url,max:1}),started=Date.now();
try{
 const tables=await pool.query("SELECT count(*)::int count FROM information_schema.tables WHERE table_schema='public'");if(tables.rows[0].count!==0)throw new Error('Restore target must be empty; this script never clears an existing schema');
 await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cargoorbit_app') THEN CREATE ROLE cargoorbit_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$");
 await pool.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='cargoorbit_operator') THEN CREATE ROLE cargoorbit_operator NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF; END $$;GRANT cargoorbit_operator TO CURRENT_USER");
 await postgresTool('pg_restore',['--enable-row-security','--no-owner','--exit-on-error','--single-transaction','--dbname',env.PGDATABASE,archive],url);
 const actual=(await pool.query('SELECT tenant_id,kind,count(*)::text count FROM entities GROUP BY tenant_id,kind ORDER BY tenant_id,kind')).rows;
 if(JSON.stringify(actual)!==JSON.stringify(manifest.entityCounts))throw new Error('Restored entity counts differ from the database snapshot manifest');
 const evidence=(await pool.query("SELECT tenant_id,kind,id,data->>'objectKey' object_key,data->>'objectVersion' object_version,data->>'sha256' sha256 FROM entities WHERE kind IN ('evidence','packets','tenant_exports') ORDER BY tenant_id,kind,id")).rows;
 if(JSON.stringify(evidence)!==JSON.stringify(manifest.evidence))throw new Error('Restored evidence version references differ from the snapshot manifest');
 const result={status:'database_restore_verified',startedAt:new Date(started).toISOString(),finishedAt:new Date().toISOString(),durationSeconds:(Date.now()-started)/1000,entityCountsMatch:true,evidenceReferencesMatch:true,evidenceBytesRestoredAndVerified:false,applicationAcceptanceReplayed:false};
 await writeFile(`${path}.restore-result.json`,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}finally{await pool.end()}
