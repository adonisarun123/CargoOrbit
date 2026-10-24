import 'dotenv/config';
import {readFile,stat} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {contractUsageCeilingSchema} from '@cargoorbit/domain';
const {MIGRATION_DATABASE_URL:url,CONTRACT_TENANT_ID:tenantId,CONTRACT_USAGE_FILE:file,CONTRACT_OPERATOR_REFERENCE:operator}=process.env;
if(!url||!tenantId||!file||!operator||operator.length<8)throw new Error('Set MIGRATION_DATABASE_URL, CONTRACT_TENANT_ID, CONTRACT_USAGE_FILE and CONTRACT_OPERATOR_REFERENCE');
if((await stat(file)).size>65536)throw new Error('Contract file exceeds 64 KiB');
const ceiling=contractUsageCeilingSchema.parse(JSON.parse(await readFile(file,'utf8')));
const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:10000}),client=await pool.connect();
try{
 await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='30s'");
 const role=(await client.query("SELECT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.entities'::regclass),'MEMBER') owner,pg_has_role(current_user,'cargoorbit_operator','MEMBER') operator")).rows[0];if(!role?.owner||!role?.operator)throw new Error('A separate migration owner identity is required');
 await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`cargoorbit:${tenantId}`]);
 const tenant=(await client.query("SELECT id,status FROM tenants WHERE id=$1 FOR UPDATE",[tenantId])).rows[0];if(tenant?.status!=='active')throw new Error('An active existing tenant is required');
 const previous=(await client.query("SELECT data FROM entities WHERE tenant_id=$1 AND kind='configuration' AND id='contract_usage_ceiling' FOR UPDATE",[tenantId])).rows[0]?.data??null;
 const plan={tenantId,operatorReference:operator,before:previous,after:ceiling},sha256=createHash('sha256').update(JSON.stringify(plan)).digest('hex');
 if(!process.argv.includes('--apply')){await client.query('ROLLBACK');console.log(JSON.stringify({dryRun:true,planSha256:sha256,...plan},null,2));}
 else{const expected=process.argv.find(v=>v.startsWith('--plan-sha256='))?.slice(14);if(expected!==sha256)throw new Error('Plan changed or approval hash missing; review a fresh dry run');
  await client.query("INSERT INTO entities(tenant_id,kind,id,data) VALUES($1,'configuration','contract_usage_ceiling',$2::jsonb) ON CONFLICT(tenant_id,kind,id) DO UPDATE SET data=excluded.data,updated_at=now()",[tenantId,JSON.stringify(ceiling)]);
  await client.query("INSERT INTO audit_events(tenant_id,id,actor_id,role,action,target,details,correlation_id) VALUES($1,$2,'system:contract-operator','platform_admin','contractUsage.operator_provisioned','contract_usage_ceiling',$3::jsonb,$4)",[tenantId,randomUUID(),JSON.stringify({...plan,planSha256:sha256}),randomUUID()]);await client.query('COMMIT');console.log(JSON.stringify({applied:true,tenantId,planSha256:sha256}));
 }
}catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw new Error(error instanceof Error&&/Plan changed|active existing|separate migration/.test(error.message)?error.message:'Contract provisioning failed; no successful commit is claimed');}
finally{client.release();await pool.end();}
