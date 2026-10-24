/** Privileged operator workflow. Dry-run by default; never deletes object versions or backups. */
import {readFile,stat,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {S3Client,HeadBucketCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {retentionPlan,digest} from './retention-policy.mjs';
process.umask(0o077);
const readJson=async path=>{if(!path)return undefined;const info=await stat(path);if(info.size>8*1024*1024)throw new Error('RETENTION_FILE_TOO_LARGE');return JSON.parse(await readFile(path,'utf8'));};
async function snapshot(client,tenantId,requestId){
 const tenant=(await client.query('SELECT id,status,features FROM tenants WHERE id=$1 FOR UPDATE',[tenantId])).rows[0];
 const request=(await client.query("SELECT data FROM entities WHERE tenant_id=$1 AND kind='retention_requests' AND id=$2 FOR UPDATE",[tenantId,requestId])).rows[0]?.data;
 const owners=(await client.query("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=$1 AND m.role='owner' AND m.status='active' AND u.status='active' FOR SHARE OF u,m",[tenantId])).rows;
 const activeHolds=(await client.query("SELECT id FROM entities WHERE tenant_id=$1 AND kind='legal_holds' AND data->>'status'='active'",[tenantId])).rows;
 const entityCounts=(await client.query('SELECT kind,count(*)::text count FROM entities WHERE tenant_id=$1 GROUP BY kind ORDER BY kind',[tenantId])).rows;
 const exports=(await client.query("SELECT data FROM entities WHERE tenant_id=$1 AND kind='tenant_exports' ORDER BY id",[tenantId])).rows.map(r=>r.data);
 const objects=(await client.query("SELECT kind,id,data->>'objectKey' AS \"objectKey\",data->>'objectVersion' AS \"objectVersion\",data->>'sha256' sha256 FROM entities WHERE tenant_id=$1 AND (kind IN ('evidence','packets') OR kind='tenant_exports' AND data->>'status'='completed') ORDER BY kind,id LIMIT 100001",[tenantId])).rows;
 return {tenantId,requestId,tenant,request,activeOwnerIds:owners.map(r=>r.id),activeHolds,entityCounts,exports,objects};
}
async function lockedSnapshot(client,tenantId,requestId){await client.query('BEGIN');await client.query("SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='60s'");await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenantId]);await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`cargoorbit:${tenantId}`]);return snapshot(client,tenantId,requestId);}
async function verifyAbsent(objects,storage){const client=new S3Client({region:storage.region,maxAttempts:1});try{await client.send(new HeadBucketCommand({Bucket:storage.bucket,ExpectedBucketOwner:storage.accountId}),{abortSignal:AbortSignal.timeout(10000)});let cursor=0;const started=Date.now();await Promise.all(Array.from({length:4},async()=>{while(cursor<objects.length){if(Date.now()-started>15*60*1000)throw new Error('OBJECT_VERIFICATION_TIME_LIMIT');const object=objects[cursor++];let absent=false;try{await client.send(new HeadObjectCommand({Bucket:storage.bucket,Key:object.objectKey,VersionId:object.objectVersion,ExpectedBucketOwner:storage.accountId}),{abortSignal:AbortSignal.timeout(10000)});}catch(error){if(error?.$metadata?.httpStatusCode===404)absent=true;else throw new Error('OBJECT_ABSENCE_COULD_NOT_BE_VERIFIED');}if(!absent)throw new Error('OBJECT_VERSION_STILL_EXISTS');}}));}finally{client.destroy();}}
async function execute(client,s,plan,manifest,operator){
 if(plan.action==='delete'){
  // A newly added tenant table must be reviewed explicitly before this erasure procedure can proceed.
  const tables=(await client.query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id'")).rows.map(r=>r.table_name);
  // shipment_search_terms is a derived index with an enforced source FK ON DELETE CASCADE.
  if(tables.some(name=>!['entities','audit_events','outbox_events','memberships','tenant_usage','shipment_search_terms'].includes(name)))throw new Error('UNREVIEWED_TENANT_TABLE');
  const userIds=(await client.query('SELECT DISTINCT user_id FROM memberships WHERE tenant_id=$1',[s.tenantId])).rows.map(r=>r.user_id);
  await client.query('DELETE FROM exit_sessions WHERE membership_id IN (SELECT id FROM memberships WHERE tenant_id=$1)',[s.tenantId]);
  await client.query('DELETE FROM auth_sessions WHERE membership_id IN (SELECT id FROM memberships WHERE tenant_id=$1)',[s.tenantId]);
  await client.query('DELETE FROM memberships WHERE tenant_id=$1',[s.tenantId]);
  await client.query('DELETE FROM users WHERE id=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=users.id) AND NOT EXISTS(SELECT 1 FROM auth_sessions WHERE user_id=users.id)',[userIds]);
  // Transactional DDL blocks concurrent writers. Only these known immutable-history triggers are bypassed,
  // only by the table owner, and they are restored before commit. Usage accounting remains enabled.
  await client.query('ALTER TABLE entities DISABLE TRIGGER entities_finalized_pod; ALTER TABLE entities DISABLE TRIGGER entities_history_immutable; ALTER TABLE audit_events DISABLE TRIGGER audit_immutable');
  await client.query('DELETE FROM entities WHERE tenant_id=$1',[s.tenantId]);await client.query('DELETE FROM audit_events WHERE tenant_id=$1',[s.tenantId]);await client.query('DELETE FROM outbox_events WHERE tenant_id=$1',[s.tenantId]);await client.query('DELETE FROM tenant_usage WHERE tenant_id=$1',[s.tenantId]);
  await client.query('ALTER TABLE entities ENABLE TRIGGER entities_finalized_pod; ALTER TABLE entities ENABLE TRIGGER entities_history_immutable; ALTER TABLE audit_events ENABLE TRIGGER audit_immutable');
  await client.query("UPDATE tenants SET status='closed',name='Closed tenant',features='{}'::jsonb WHERE id=$1",[s.tenantId]);
 }else{
  await client.query("UPDATE tenants SET status='closing',features=features||jsonb_build_object('exitExportUntil',$2::text,'exitExportReceiptId',$3::text) WHERE id=$1",[s.tenantId,manifest.exportWindowEndsAt,manifest.exportReceipt.exportId]);await client.query('UPDATE auth_sessions SET revoked_at=now() WHERE membership_id IN (SELECT id FROM memberships WHERE tenant_id=$1)',[s.tenantId]);
  await client.query("UPDATE entities SET data=data||jsonb_build_object('executionStatus','completed','executedAt',now()::text,'executionPlanSha256',$3::text) WHERE tenant_id=$1 AND kind='retention_requests' AND id=$2",[s.tenantId,s.requestId,plan.planSha256]);
 }
 const receipt={format:'cargoorbit-retention-execution-v1',operatorReference:operator,approvalIdentityHashes:plan.approverIds.map(id=>digest(id)),dispositionSha256:plan.dispositionSha256,inventorySha256:plan.inventorySha256,exportSha256:manifest.exportReceipt.sha256,exportReceiptReference:manifest.exportReceipt.receiptReference,exportWindowEndsAt:manifest.exportWindowEndsAt,backupInventoryReference:manifest.backupInventory?.reference,objectVersionsVerifiedAbsent:plan.action==='delete',backupsVerifiedBySignedDisposition:plan.action==='delete',action:plan.action};
 await client.query('INSERT INTO retention_execution_receipts(id,tenant_id_hash,request_id,action,plan_sha256,receipt) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[randomUUID(),digest(s.tenantId),s.requestId,plan.action,plan.planSha256,JSON.stringify(receipt)]);
 return receipt;
}
async function main(){
 const {RETENTION_DATABASE_URL:url,RETENTION_TENANT_ID:tenantId,RETENTION_REQUEST_ID:requestId,RETENTION_MANIFEST:manifestFile,RETENTION_APPROVER_KEYS_FILE:keyFile,RETENTION_TRUST_SHA256:trustSha,RETENTION_OPERATOR_REFERENCE:operator}=process.env;
 if(!url||!tenantId||!requestId)throw new Error('SET_RETENTION_DATABASE_URL_TENANT_ID_AND_REQUEST_ID');
 const mutate=process.argv.includes('--execute'),expected=process.argv.find(arg=>arg.startsWith('--plan-sha256='))?.slice(14),manifest=await readJson(manifestFile),trust=await readJson(keyFile);
 if(mutate&&(!operator||operator.length<8||!trustSha||digest(trust)!==trustSha))throw new Error('TRUST_STORE_AND_OPERATOR_REFERENCE_REQUIRED');
 const pool=new pg.Pool({connectionString:url,max:1,connectionTimeoutMillis:10000}),client=await pool.connect();try{
  const role=(await client.query("SELECT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='public.entities'::regclass),'MEMBER') owns_tables,pg_has_role(current_user,'cargoorbit_operator','MEMBER') operator_authorized")).rows[0];if(!role?.owns_tables||!role?.operator_authorized)throw new Error('RETENTION_REQUIRES_SEPARATE_TABLE_OWNER_IDENTITY');
  const first=await lockedSnapshot(client,tenantId,requestId),plan=retentionPlan(first,manifest,trust);await client.query('ROLLBACK');
  if(process.env.RETENTION_INVENTORY_FILE)await writeFile(process.env.RETENTION_INVENTORY_FILE,JSON.stringify({tenantId,requestId,inventorySha256:plan.inventorySha256,objects:first.objects},null,2)+'\n',{mode:0o600});
  if(!mutate){console.log(JSON.stringify({dryRun:true,...plan},null,2));if(!plan.executable)process.exitCode=1;return;}
  if(!plan.executable||expected!==plan.planSha256)throw new Error('RETENTION_PLAN_BLOCKED_OR_DIGEST_MISMATCH');
  if(plan.action==='delete')await verifyAbsent(first.objects,manifest.storage);
  const current=await lockedSnapshot(client,tenantId,requestId),rechecked=retentionPlan(current,manifest,trust);if(!rechecked.executable||rechecked.planSha256!==expected)throw new Error('RETENTION_PLAN_CHANGED_REVIEW_AGAIN');
  const receipt=await execute(client,current,rechecked,manifest,operator);await client.query('COMMIT');console.log(JSON.stringify({status:'retention_executed',action:plan.action,planSha256:plan.planSha256,receipt},null,2));
 }catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error;}finally{client.release();await pool.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{const code=/^[A-Z_]+$/.test(error.message)?error.message:'RETENTION_OPERATOR_FAILED';console.error(JSON.stringify({status:'blocked',code,note:'No successful commit is claimed. Consult restricted operator logs and re-run dry-run.'}));process.exitCode=1;});
