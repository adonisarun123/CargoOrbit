import {readFile} from 'node:fs/promises';
const results=[];
const record=(name,ok,detail)=>results.push({name,status:ok?'passed':'blocked',detail});
const secrets=['JWT_SECRET','OTP_SECRET','SMS_WEBHOOK_TOKEN','NOTIFICATION_WEBHOOK_TOKEN','NOTIFICATION_CALLBACK_SECRET','INVITATION_WEBHOOK_TOKEN'];
for(const name of secrets)record(name,!!process.env[name]&&process.env[name].length>=32&&!/replace|example/i.test(process.env[name]),'Required secret is configured with at least 32 characters; value never printed');
record('MFA_ENCRYPTION_KEY',/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY||''),'MFA encryption key must be 32 bytes encoded in hex');
for(const name of ['WEB_ORIGIN','SMS_WEBHOOK_URL','NOTIFICATION_WEBHOOK_URL','INVITATION_WEBHOOK_URL']){let valid=false;try{const url=new URL(process.env[name]);valid=url.protocol==='https:'&&!['localhost','127.0.0.1'].includes(url.hostname)&&!url.username&&!url.password;}catch{}record(name,valid,'Requires approved HTTPS endpoint without embedded credentials');}
let dbTls=false;try{const url=new URL(process.env.DATABASE_URL);dbTls=['verify-full','verify-ca'].includes(url.searchParams.get('sslmode'));}catch{}record('database_tls',dbTls,'Runtime database URL must verify TLS using trusted CA configuration');
record('production_storage',process.env.EVIDENCE_STORAGE==='s3'&&!!process.env.S3_BUCKET&&!!process.env.AWS_REGION,'Private versioning and IAM must also pass live startup/storage checks');
record('malware_scanner',process.env.MALWARE_SCANNER==='clamav','ClamAV service/signature freshness also require live checks');
record('runtime_secret_boundary',!process.env.MIGRATION_DATABASE_URL&&!process.env.ACCOUNT_PASSWORD&&!process.env.ACCOUNT_MFA_SECRET,'Run readiness against runtime environment; owner/enrollment credentials must not be present');
const required=['customer_receipt_finance_acceptance','hosting_region_and_processors','provider_sandbox_contracts','android_device_offline_matrix','browser_accessibility_and_uat','independent_security_review','backup_objects_and_restore_drill','load_and_latency_targets','privacy_retention_and_incident_owners'];
let evidence;try{evidence=JSON.parse(await readFile(process.env.RELEASE_EVIDENCE_FILE||'','utf8'));}catch{}
record('evidence_format',evidence?.format==='cargoorbit-release-evidence-v1'&&evidence?.environment==='production','Use a production evidence record with the expected version');
record('release_commit',/^[a-f0-9]{40}$/.test(evidence?.releaseCommit||'')&&evidence?.releaseCommit===process.env.RELEASE_COMMIT,'Evidence must name this exact full commit SHA');
for(const name of required){const check=evidence?.checks?.[name];const verified=Date.parse(check?.verifiedAt);record(name,check?.status==='passed'&&typeof check.owner==='string'&&check.owner.length>2&&typeof check.reference==='string'&&check.reference.length>5&&Number.isFinite(verified)&&verified<=Date.now(),'Requires actual completed evidence, named reviewer and verification date');}
const ok=results.every(r=>r.status==='passed');console.log(JSON.stringify({ready:ok,checkedAt:new Date().toISOString(),results,note:'Configuration and attestation checks only. This command does not perform or certify external tests.'},null,2));if(!ok)process.exitCode=1;
