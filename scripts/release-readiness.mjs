import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const productionHost=host=>!['localhost','[::1]','0.0.0.0','example','test','invalid'].includes(host)&&!host.startsWith('127.')&&!['localhost','invalid','test','example','example.com','example.net','example.org'].some(domain=>host===domain||host.endsWith(`.${domain}`));
const publicHttps=(value,originOnly=false,allowQuery=false)=>{try{const u=new URL(value);const host=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&(allowQuery||!u.search)&&productionHost(host)&&(!originOnly||u.origin===value)?u:undefined}catch{return undefined}};

/** Structural/runtime configuration and explicit attestations only; performs no remote calls. */
export function evaluateReadiness(env,evidence,now=Date.now()){
 const results=[],record=(name,ok,detail)=>results.push({name,status:ok?'passed':'blocked',detail});
 record('production_runtime',env.NODE_ENV==='production','Run against the production runtime environment');
 const secrets=['JWT_SECRET','OTP_SECRET','SMS_WEBHOOK_TOKEN','NOTIFICATION_WEBHOOK_TOKEN','NOTIFICATION_CALLBACK_SECRET','INVITATION_WEBHOOK_TOKEN'];
 for(const name of secrets)record(name,!!env[name]&&env[name].length>=32&&!/replace|example|change.?me|test-secret/i.test(env[name]),'Required secret is configured with at least 32 characters; value never printed');
 record('secret_separation',!!env.JWT_SECRET&&!!env.OTP_SECRET&&env.JWT_SECRET!==env.OTP_SECRET&&!!env.NOTIFICATION_CALLBACK_SECRET&&![env.JWT_SECRET,env.OTP_SECRET].includes(env.NOTIFICATION_CALLBACK_SECRET),'JWT, OTP and callback keys must be distinct');
 record('MFA_ENCRYPTION_KEY',/^[a-f0-9]{64}$/i.test(env.MFA_ENCRYPTION_KEY||''),'MFA encryption key must be 32 bytes encoded in hex');
 const origins=String(env.WEB_ORIGIN||'').split(',').map(value=>value.trim());const validOrigins=origins.length>0&&origins.every(value=>publicHttps(value,true));
 record('WEB_ORIGIN',validOrigins,'Requires explicit allowed HTTPS origins without paths, query strings, fragments or credentials');
 const app=publicHttps(env.APP_PUBLIC_URL,true);
 record('APP_PUBLIC_URL',!!app,'Requires one approved public web origin');
 record('public_web_origin_consistency',!!app&&validOrigins&&origins.includes(app.origin),'APP_PUBLIC_URL must be included in WEB_ORIGIN');
 const api=publicHttps(env.NEXT_PUBLIC_API_URL);
 record('NEXT_PUBLIC_API_URL',!!api&&api.pathname.replace(/\/$/,'')==='/v1','Requires the approved HTTPS API base ending /v1; rebuild web after changing this value');
 for(const name of ['SMS_WEBHOOK_URL','NOTIFICATION_WEBHOOK_URL','INVITATION_WEBHOOK_URL'])record(name,!!publicHttps(env[name],false,true),'Requires approved HTTPS endpoint without embedded credentials or fragment');
 let dbTls=false;try{const url=new URL(env.DATABASE_URL);dbTls=['postgres:','postgresql:'].includes(url.protocol)&&productionHost(url.hostname.toLowerCase())&&!!url.hostname&&!!url.username&&!!url.password&&url.pathname.length>1&&new Set(url.searchParams.keys()).size===[...url.searchParams.keys()].length&&url.searchParams.getAll('sslmode').length===1&&url.searchParams.get('sslmode')==='verify-full'&&!url.hash&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='0';}catch{}
 record('database_tls',dbTls,'Runtime PostgreSQL URL must use verify-full; Render requires its full external hostname plus a scoped egress allowlist and live CA/SNI validation');
 record('production_storage',env.EVIDENCE_STORAGE==='s3'&&!!env.S3_BUCKET&&!!env.AWS_REGION,'Private versioning and IAM must also pass live startup/storage checks');
 record('malware_scanner',env.MALWARE_SCANNER==='clamav','ClamAV service/signature freshness also require live checks');
 record('runtime_secret_boundary',!env.MIGRATION_DATABASE_URL&&!env.ACCOUNT_PASSWORD&&!env.ACCOUNT_MFA_SECRET,'Run readiness against runtime environment; owner/enrollment credentials must not be present');
const required=['customer_receipt_finance_acceptance','hosting_region_and_processors','provider_sandbox_contracts','android_device_offline_matrix','browser_accessibility_and_uat','independent_security_review','backup_objects_and_restore_drill','load_and_latency_targets','privacy_retention_and_incident_owners'];
record('evidence_format',evidence?.format==='cargoorbit-release-evidence-v1'&&evidence?.environment==='production','Use a production evidence record with the expected version');
record('release_commit',/^[a-f0-9]{40}$/.test(evidence?.releaseCommit||'')&&evidence?.releaseCommit===env.RELEASE_COMMIT,'Evidence must name this exact full commit SHA');
for(const name of required){const check=evidence?.checks?.[name];const verified=Date.parse(check?.verifiedAt);record(name,check?.status==='passed'&&typeof check.owner==='string'&&check.owner.length>2&&typeof check.reference==='string'&&check.reference.length>5&&Number.isFinite(verified)&&verified<=now,'Requires actual completed evidence, named reviewer and verification date');}
const mobile=evidence?.checks?.mobile_toolchain_security;
const reviewed=mobile?.status==='reviewed_mitigation'&&mobile.rawAuditStatus==='unresolved'&&mobile.advisory==='GHSA-86w9-cpqp-85rv'&&mobile.sourceCommit==='ceba34402e329f0365134f23fe19898756527d65'&&mobile.patchedFileSha256==='c9b1e3799e230528b6d6815c1f6cd3c6058b9d45975264b55d995abb976589af'&&mobile.scope==='Node lib entry point only'&&mobile.regressionStatus==='passed'&&typeof mobile.independentReviewer==='string'&&mobile.independentReviewer.length>2&&mobile.independentReviewer!==mobile.owner;
const upstream=mobile?.status==='passed'&&mobile.rawAuditStatus==='passed'&&typeof mobile.patchedVersion==='string'&&mobile.patchedVersion!=='1.4.0';
record('mobile_toolchain_security',(reviewed||upstream)&&typeof mobile?.owner==='string'&&mobile.owner.length>2&&typeof mobile?.reference==='string'&&mobile.reference.length>5&&Number.isFinite(Date.parse(mobile?.verifiedAt))&&Date.parse(mobile.verifiedAt)<=now,'Requires clean raw audit with published patch, or explicit independent approval of the exact hash-locked Node-only candidate, regression evidence and unresolved raw-audit disclosure');
 const ok=results.every(r=>r.status==='passed');return {ready:ok,checkedAt:new Date(now).toISOString(),results,note:'Configuration and attestation checks only. This command does not perform or certify external tests or verify the API URL embedded in a previously built web artifact.'};
}
async function main(){let evidence;try{evidence=JSON.parse(await readFile(process.env.RELEASE_EVIDENCE_FILE||'','utf8'));}catch{}const result=evaluateReadiness(process.env,evidence);console.log(JSON.stringify(result,null,2));if(!result.ready)process.exitCode=1;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
