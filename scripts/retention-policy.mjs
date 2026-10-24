import {createHash,createPublicKey,verify} from 'node:crypto';
export const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:JSON.stringify(value);
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const validDate=(value,now)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now;
const reference=value=>typeof value==='string'&&value.trim().length>=8&&value.length<=500;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function dispositionSignatures(manifest,trust,requiredActors,now){
 const {signatures,...payload}=manifest||{},matched=new Set(),keyFingerprints=new Set();
 for(const signature of Array.isArray(signatures)?signatures:[]){
  const key=trust?.keys?.find(item=>item.keyId===signature.keyId&&item.userId===signature.userId);
  if(!key||!requiredActors.includes(key.userId)||!Number.isFinite(Date.parse(key.expiresAt))||Date.parse(key.expiresAt)<=now)continue;
  try{const publicKey=createPublicKey(key.publicKeyPem),fingerprint=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');if(publicKey.asymmetricKeyType!=='ed25519'||keyFingerprints.has(fingerprint))continue;if(verify(null,Buffer.from(canonical(payload)),publicKey,Buffer.from(signature.signature,'base64url'))){matched.add(key.userId);keyFingerprints.add(fingerprint);}}catch{}
 }
 return requiredActors.length===2&&new Set(requiredActors).size===2&&requiredActors.every(id=>matched.has(id));
}
/** Pure authorization/receipt validator. This function performs no database or object mutations. */
export function retentionPlan(snapshot,manifest,trust,now=Date.now()){
 const blockers=[],check=(ok,code)=>{if(!ok)blockers.push(code);},r=snapshot.request||{},actors=[r.requestedBy,r.reviewedBy];
 check(snapshot.tenant&&snapshot.tenant.id===snapshot.tenantId,'TENANT_NOT_FOUND');
 check(['close','delete'].includes(r.action),'REQUEST_ACTION_UNSUPPORTED');
 check(r.status==='approved'&&r.executionStatus!=='completed','REQUEST_NOT_APPROVED_OR_ALREADY_EXECUTED');
 check(typeof r.requestedBy==='string'&&typeof r.reviewedBy==='string'&&r.requestedBy!==r.reviewedBy,'TWO_DISTINCT_APPROVERS_REQUIRED');
 check(actors.every(actor=>snapshot.activeOwnerIds.includes(actor)),'APPROVER_AUTHORITY_NO_LONGER_ACTIVE');
 check(validDate(r.earliestActionAt,now),'RETENTION_NOT_DUE');
 check(manifest?.format==='cargoorbit-retention-disposition-v1'&&manifest.tenantId===snapshot.tenantId&&manifest.requestId===snapshot.requestId&&manifest.policyReference===r.policyReference,'DISPOSITION_SCOPE_MISMATCH');
 check(dispositionSignatures(manifest,trust,actors,now),'TWO_VALID_DISPOSITION_SIGNATURES_REQUIRED');
 const inventory=snapshot.objects.slice().sort((a,b)=>canonical(a).localeCompare(canonical(b))),inventorySha256=digest(inventory);
 check(inventory.length<=100000&&inventory.every(o=>o.objectKey&&o.objectVersion&&hash(o.sha256)),'INCOMPLETE_OBJECT_INVENTORY');
 check(manifest?.inventorySha256===inventorySha256,'INVENTORY_RECEIPT_MISMATCH');
 const e=snapshot.exports.find(value=>value.id===manifest?.exportReceipt?.exportId),receipt=manifest?.exportReceipt;
 check(e?.status==='completed'&&hash(e.sha256)&&e.sha256===receipt?.sha256&&reference(e.receiptReference)&&e.receiptReference===receipt?.receiptReference&&e.acknowledgedBy===receipt?.acknowledgedBy&&e.acknowledgedAt===receipt?.acknowledgedAt&&validDate(e.acknowledgedAt,now),'ACKNOWLEDGED_EXPORT_RECEIPT_REQUIRED');
 if(r.action==='close')check(snapshot.tenant?.status==='active','TENANT_NOT_ACTIVE');
 if(r.action==='delete'){
  check(snapshot.tenant?.status==='closing','TENANT_MUST_BE_CLOSING');
  check(snapshot.activeHolds.length===0,'ACTIVE_LEGAL_HOLD');
  check(validDate(manifest?.exportWindowEndsAt,now),'EXPORT_WINDOW_NOT_EXPIRED');
  check(reference(manifest?.objectDisposition?.reference)&&manifest.objectDisposition.status==='disposed'&&manifest.objectDisposition.inventorySha256===inventorySha256&&validDate(manifest.objectDisposition.verifiedAt,now),'OBJECT_DISPOSITION_NOT_RECONCILED');
  check(reference(manifest?.backupInventory?.reference)&&hash(manifest?.backupInventory?.sha256)&&manifest.backupInventory.complete===true,'BACKUP_INVENTORY_NOT_COMPLETE');
  check(Array.isArray(manifest?.backups)&&manifest.backups.length>0&&manifest.backups.length<=10000&&manifest.backups.every(b=>reference(b.id)&&['disposed','expired'].includes(b.status)&&reference(b.reference)&&validDate(b.verifiedAt,now)),'BACKUP_DISPOSITIONS_NOT_COMPLETE');
  check(reference(manifest?.storage?.bucket)&&/^[0-9]{12}$/.test(manifest?.storage?.accountId||'')&&reference(manifest?.storage?.region),'APPROVED_STORAGE_IDENTITY_REQUIRED');
 }
 const plan={format:'cargoorbit-retention-plan-v1',tenantId:snapshot.tenantId,requestId:snapshot.requestId,action:r.action,tenantStatus:snapshot.tenant?.status,requestSha256:digest(r),approverIds:actors,entityCounts:snapshot.entityCounts,inventorySha256,objectCount:inventory.length,dispositionSha256:digest(manifest||{}),activeHoldIds:snapshot.activeHolds.map(h=>h.id).sort(),blockers};
 return {...plan,planSha256:digest(plan),executable:blockers.length===0};
}
