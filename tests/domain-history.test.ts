import {describe,it,expect} from 'vitest';
import {MemoryDatabase,type Context} from '@cargoorbit/database';
import {WorkflowService,hashPayload} from '@cargoorbit/domain';

const owner:Context={tenantId:'history',userId:'owner',role:'owner'};
const admin:Context={...owner,userId:'admin',role:'customer_admin',organizationId:'customer'};
const receiver:Context={...admin,userId:'receiver',role:'receiver'};
const driver:Context={...owner,userId:'driver',role:'driver'};
const total=501;
const serial=(n:number)=>String(n).padStart(4,'0');
async function fixture(){
 const db=new MemoryDatabase();let code='';
 const service=new WorkflowService(db,{otpSecret:'h'.repeat(40),now:()=>new Date('2026-10-24T10:00:00Z'),deliverOtp:async(_,value)=>{code=value;}});
 const exec=(action:string,input:any,ctx=owner)=>service.execute(ctx,action,input);
 for(const [id,roles] of [['sender',['consignor']],['customer',['consignee','payer']]] as const)await exec('createOrganization',{id,name:id,roles});
 for(const [id,organizationId] of [['origin','sender'],['site','customer']])await exec('createFacility',{id,organizationId,name:id,address:'Road',city:'Bengaluru',state:'Karnataka',pinCode:'560001'});
 await exec('grantReceiver',{id:'grant',userId:'receiver',organizationId:'customer',facilityId:'site',contact:'receiver@example.test',receiverName:'Receiver',validUntil:'2027-01-01T00:00:00Z'},admin);
 const c=await exec('createConsignment',{id:'shipment',lrNumber:'LR',consignorId:'sender',consigneeId:'customer',payerId:'customer',originId:'origin',destinationId:'site',freightAmount:'1000',lines:[{id:'line',description:'Goods',quantity:'10',unit:'pcs'}]});
 const draft=()=>exec('saveDraft',{consignmentId:c.id,clientEventId:'draft',expectedVersion:0,lines:[{lineId:'line',accepted:'10',damaged:'0',rejected:'0',short:'0'}]});
 const accept=async(pod:any)=>{const challenge=await exec('issueChallenge',{podId:pod.id},receiver);return exec('acceptPod',{podId:pod.id,challengeId:challenge.challengeId,code,consent:true,idempotencyKey:'accept'},receiver);};
 const invoice=()=>exec('createInvoice',{number:'INV',payerId:'customer',consignmentIds:[c.id],amount:'1000',issueDate:'2026-10-24',accountingSource:'ERP',taxTreatmentReference:'Reviewed externally'});
 return {db,service,exec,c,draft,accept,invoice};
}

describe('Complete business histories across keyset pages',()=>{
 it('conserves goods-document quantity and rejects duplicate links beyond the first page',async()=>{
  const f=await fixture();
  await f.exec('createGoodsDocument',{id:'document',kind:'goods_invoice',number:'G',issuerOrganizationId:'sender',externalSource:'ERP',lines:[{id:'goods-line',description:'Goods',quantity:String(total),unit:'pcs'}]});
  await f.db.transaction(owner,async tx=>{for(let n=0;n<total;n++)await tx.put('goods_document_links',{id:`link-${serial(n)}`,documentId:'document',consignmentId:`other-${n}`,lineLinks:[{documentLineId:'goods-line',consignmentLineId:'line',quantity:'1'}]});});
  const input={documentId:'document',consignmentId:f.c.id,lineLinks:[{documentLineId:'goods-line',consignmentLineId:'line',quantity:'1'}],reason:'Allocate remaining goods',idempotencyKey:'overflow'};
  await expect(f.exec('linkGoodsDocument',input)).rejects.toMatchObject({code:'DOCUMENT_OVER_ALLOCATION'});
  await f.db.transaction(owner,async tx=>{await tx.put('consignments',{...f.c,id:`other-${total-1}`,lrNumber:'LAST'});});
  await expect(f.exec('linkGoodsDocument',{...input,consignmentId:`other-${total-1}`,idempotencyKey:'duplicate'})).rejects.toMatchObject({code:'DOCUMENT_ALREADY_LINKED'});
  expect(await f.db.transaction(owner,tx=>tx.count('goods_document_links'))).toBe(total);
 });

 it('seals every linked document and completes every open receiver exception/invitation',async()=>{
  const f=await fixture(),pod=await f.draft();
  await f.db.transaction(owner,async tx=>{for(let n=0;n<total;n++){
   const id=serial(n);
   await tx.put('goods_documents',{id:`document-${id}`,kind:'goods_invoice',number:`G-${id}`,issuerOrganizationId:'sender',externalSource:'ERP',lines:[]});
   await tx.put('goods_document_links',{id:`link-${id}`,documentId:`document-${id}`,consignmentId:f.c.id,lineLinks:[]});
   await tx.put('receiver_exceptions',{id:`exception-${id}`,attemptId:pod.attemptId,consignmentId:f.c.id,taskId:`task-${id}`,status:'open'});
   await tx.put('tasks',{id:`task-${id}`,consignmentId:f.c.id,status:'open'});
   await tx.put('receiver_invitations',{id:`invitation-${id}`,attemptId:pod.attemptId,receiverUserId:receiver.userId,status:'pending',tokenHash:'retire-on-acceptance'});
  }});
  const review=await f.service.query(receiver,'receiptReview',pod.id);
  expect(review.payload.goodsDocuments).toHaveLength(total);
  const sealed=await f.accept(pod);
  expect(sealed.acceptedPayload.goodsDocuments).toHaveLength(total);
  expect(sealed.acceptedPayload.goodsDocuments.at(-1).document.id).toBe('document-0500');
  expect(sealed.payloadHash).toBe(review.payloadHash);
  const state=await f.db.transaction(owner,async tx=>({exceptions:await tx.list('receiver_exceptions'),invitations:await tx.list('receiver_invitations'),tasks:await tx.list('tasks')}));
  expect(state.exceptions.every(e=>e.status==='resolved'&&e.podId===pod.id)).toBe(true);
  expect(state.invitations.every(e=>e.status==='completed'&&e.tokenHash===undefined)).toBe(true);
  expect(state.tasks.every(t=>t.status==='resolved')).toBe(true);
 });

 it('resolves a shared document label and repeated barcode mappings for a driver beyond page one',async()=>{
  const f=await fixture();
  await f.db.transaction(owner,async tx=>{
   await tx.put('goods_documents',{id:'shared-document',number:'SHARED'});
   await tx.put('barcode_mappings',{id:'shared-label',code:'SHARED-GOODS',entityType:'goods_document',entityId:'shared-document',symbology:'QR'});
   for(let n=0;n<total;n++){
    const id=`shipment-${serial(n)}`;
    await tx.put('consignments',{...f.c,id,lrNumber:`LR-${n}`});
    await tx.put('goods_document_links',{id:`link-${serial(n)}`,documentId:'shared-document',consignmentId:id,lineLinks:[]});
    await tx.put('barcode_mappings',{id:`mapping-${serial(n)}`,code:'REUSED-LABEL',entityType:'consignment',entityId:id,symbology:'QR'});
    await tx.put('attempts',{id:`attempt-${serial(n)}`,consignmentId:id,facilityId:'site',assignedDriverId:n===total-1?'driver':'other-driver',status:'planned',lines:[{lineId:'line',quantity:'10'}]});
   }
  });
  for(const value of ['SHARED-GOODS','REUSED-LABEL']){
   const result=await f.exec('resolveBarcode',{value},driver);
   expect(result.matches.map((m:any)=>m.consignment.id)).toEqual(['shipment-0500']);
   expect(result.matches[0].consignment.freightAmount).toBeUndefined();
  }
  const cached=await f.service.query(driver,'barcodes');
  expect(cached.find((m:any)=>m.id==='shared-label').consignmentIds).toEqual(['shipment-0500']);
 });

 it('includes all prior disputed allocations when enforcing the case amount',async()=>{
  const f=await fixture(),invoice=await f.invoice();
  const dispute=await f.exec('createDispute',{invoiceId:invoice.id,amount:String(total),reason:'Customer deduction',customerReference:'CLAIM',owner:'finance',nextAction:'Review evidence'});
  await f.db.transaction(owner,async tx=>{for(let n=0;n<total;n++)await tx.put('allocations',{id:`allocation-${serial(n)}`,invoiceId:invoice.id,disputeId:dispute.id,kind:'disputed',amount:'1',verified:false});});
  await expect(f.exec('allocateReceipt',{reference:'Excess deduction',idempotencyKey:'excess',allocations:[{invoiceId:invoice.id,disputeId:dispute.id,kind:'disputed',amount:'1',reason:'Additional claim'}]})).rejects.toMatchObject({code:'DISPUTE_OVER_ALLOCATION'});
  expect(await f.db.transaction(owner,tx=>tx.count('allocations'))).toBe(total);
  expect((await f.service.query(owner,'invoices',invoice.id)).balances.disputed).toBe('501.00');
 });

 it('excludes closed dispute deductions from balances after more than 500 cases',async()=>{
  const f=await fixture(),invoice=await f.invoice();
  await f.db.transaction(owner,async tx=>{for(let n=0;n<total;n++){
   await tx.put('disputes',{id:`dispute-${serial(n)}`,invoiceId:invoice.id,amount:'1',status:'rejected'});
   await tx.put('allocations',{id:`allocation-${serial(n)}`,invoiceId:invoice.id,disputeId:`dispute-${serial(n)}`,kind:'disputed',amount:'1',verified:false});
  }});
  const result=await f.service.query(owner,'invoices',invoice.id);
  expect(result.balances.disputed).toBe('0.00');
  expect(result.balances.outstanding).toBe('1000.00');
 });

 it('verifies the true latest sealed version and pending correction beyond page one',async()=>{
  const f=await fixture(),original=await f.accept(await f.draft());
  await f.db.transaction(owner,async tx=>{for(let n=0;n<total;n++){
   const id=`zz-version-${serial(n)}`,version=n+2,acceptedPayload={...original.acceptedPayload,podId:id,podVersion:version};
   await tx.put('pods',{...original,id,version,acceptedPayload,payloadHash:hashPayload(acceptedPayload),supersedesId:n?`zz-version-${serial(n-1)}`:original.id});
  }
  await tx.put('pods',{...original,id:'zzz-pending',version:total+2,status:'draft',supersedesId:'zz-version-0500',acceptedPayload:undefined,payloadHash:undefined});
  });
  const first=await f.service.query(owner,'receiptVerification',original.id),last=await f.service.query(owner,'receiptVerification','zz-version-0500');
  expect(first).toMatchObject({isCurrentVersion:false,supersededBy:'zz-version-0500',integrity:'verified'});
  expect(last).toMatchObject({isCurrentVersion:true,correctionPending:true,version:502,integrity:'verified'});
 });
});
