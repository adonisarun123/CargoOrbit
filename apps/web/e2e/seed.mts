import 'dotenv/config';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Database,type Context} from '@cargoorbit/database';
import {WorkflowService} from '@cargoorbit/domain';
import type {BrowserFixture} from './types';
if(process.env.NODE_ENV==='production'||process.env.CARGOORBIT_E2E!=='1')throw new Error('Browser fixtures require a nonproduction database and CARGOORBIT_E2E=1');
const password=process.env.E2E_PASSWORD;if(!password||password.length<12)throw new Error('Set E2E_PASSWORD to at least 12 characters');
const db=new Database(),prefix=`browser-${randomUUID().slice(0,8)}`;
const fixture:BrowserFixture={tenantId:prefix,secondaryTenantId:`${prefix}-secondary`,primaryMembershipId:randomUUID(),secondaryMembershipId:randomUUID(),senderId:`${prefix}-sender`,customerId:`${prefix}-customer`,originId:`${prefix}-origin`,destinationId:`${prefix}-destination`,receiverGrantId:'',revocationGrantId:'',revocationConsignmentId:'',revocationPodId:'',search:{ids:[],hiddenId:`${prefix}-search-hidden`,reference:'BROWSER-SEARCH-GOODS',freightInvoice:'BROWSER-SEARCH-FREIGHT',vehicle:'KA01SR1234',formulaLr:'=BROWSER-SEARCH-01'},users:{}};
const owner:Context={tenantId:prefix,userId:`${prefix}-owner`,role:'owner'};
const salt=randomBytes(16).toString('hex'),passwordHash=`scrypt$${salt}$${scryptSync(password,salt,64).toString('hex')}`;
try{
 await db.assertRuntimeRole();
 await db.pool.query('INSERT INTO tenants(id,name,features) VALUES($1,$2,$3),($4,$5,$3)',[prefix,'Browser acceptance workspace',JSON.stringify({entitled:['P2','P3','P4']}),fixture.secondaryTenantId,'Browser secondary workspace']);
 for(const key of ['owner','driver','receiver','revocable_receiver','customer_admin','customer_finance','finance','auditor']){
  const role=key==='revocable_receiver'?'receiver':key,id=`${prefix}-${key}`,name=`Browser ${key.replaceAll('_',' ')}`,email=`${key}.${prefix}@cargoorbit.test`,membershipId=key==='owner'?fixture.primaryMembershipId:randomUUID();
  fixture.users[key]={id,email,name,membershipId};
  await db.pool.query('INSERT INTO users(id,email,password_hash,name,verified_contact,contact_verified_at) VALUES($1,$2,$3,$4,$2,now())',[id,email,passwordHash,name]);
  await db.pool.query('INSERT INTO memberships(id,user_id,tenant_id,role,organization_id,facility_ids,assigned_driver_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[membershipId,id,prefix,role,['receiver','customer_admin','customer_finance'].includes(role)?fixture.customerId:null,role==='receiver'?[fixture.destinationId]:[],role==='driver'?id:null]);
 }
 await db.pool.query('INSERT INTO memberships(id,user_id,tenant_id,role) VALUES($1,$2,$3,$4)',[fixture.secondaryMembershipId,owner.userId,fixture.secondaryTenantId,'auditor']);
 const workflow=new WorkflowService(db,{otpSecret:'isolated-browser-seed-only-secret-123456',deliverOtp:async()=>{}}),run=(name:string,input:any,ctx=owner)=>workflow.execute(ctx,name,input) as Promise<any>;
 await run('createOrganization',{id:fixture.senderId,name:'Browser Components',roles:['consignor'],address:'Bengaluru test plant'});
 await run('createOrganization',{id:fixture.customerId,name:'Browser Automotive',roles:['consignee','payer'],address:'Hosur test plant'});
 await run('createFacility',{id:fixture.originId,organizationId:fixture.senderId,name:'Browser origin',address:'Plant road',city:'Bengaluru',state:'Karnataka',pinCode:'560001'});
 await run('createFacility',{id:fixture.destinationId,organizationId:fixture.customerId,name:'Browser receiving site',address:'Assembly road',city:'Hosur',state:'Tamil Nadu',pinCode:'635126'});
 const customerAdmin:Context={...owner,userId:fixture.users.customer_admin.id,role:'customer_admin',organizationId:fixture.customerId};
 for(const key of ['receiver','revocable_receiver']){const grant=await run('grantReceiver',{userId:fixture.users[key].id,organizationId:fixture.customerId,facilityId:fixture.destinationId,receiverName:fixture.users[key].name,contact:fixture.users[key].email,validUntil:new Date(Date.now()+7*86400000).toISOString()},customerAdmin);if(key==='receiver')fixture.receiverGrantId=grant.id;else fixture.revocationGrantId=grant.id;}
 const c=await run('createConsignment',{lrNumber:'BROWSER-REVOCATION',consignorId:fixture.senderId,consigneeId:fixture.customerId,payerId:fixture.customerId,originId:fixture.originId,destinationId:fixture.destinationId,freightAmount:'100',lines:[{description:'Revocation test goods',quantity:'1',unit:'pcs'}]});
 const pod=await run('saveDraft',{consignmentId:c.id,clientEventId:randomUUID(),lines:[{lineId:c.lines[0].id,accepted:'1',damaged:'0',rejected:'0',short:'0'}]});fixture.revocationConsignmentId=c.id;fixture.revocationPodId=pod.id;
 // More than one search page, including a formula-like reference and a site outside receiver scope.
 const hiddenSite=await run('createFacility',{id:`${prefix}-search-hidden-site`,organizationId:fixture.customerId,name:'Browser other receiving site',address:'Other assembly road',city:'Hosur',state:'Tamil Nadu',pinCode:'635126'});
 let first:any;
 for(let index=0;index<12;index++){
  const visible=index<11,id=visible?`${prefix}-search-${String(index+1).padStart(2,'0')}`:fixture.search.hiddenId;
  const shipment=await run('createConsignment',{id,lrNumber:index===0?fixture.search.formulaLr:`BROWSER-SEARCH-${String(index+1).padStart(2,'0')}`,consignorId:fixture.senderId,consigneeId:fixture.customerId,payerId:fixture.customerId,originId:fixture.originId,destinationId:visible?fixture.destinationId:hiddenSite.id,freightAmount:'37',invoiceReferences:[`${fixture.search.reference}-${String(index+1).padStart(2,'0')}`],ewayBills:[{number:String(111111111100+index)}],lines:[{description:'Cross-reference acceptance goods',quantity:'1',unit:'pcs'}]});
  if(visible)fixture.search.ids.push(id);if(index===0)first=shipment;
 }
 await run('createTrip',{vehicleNumber:fixture.search.vehicle,driverId:fixture.users.driver.id,stops:[{facilityId:fixture.destinationId,allocations:[{consignmentId:first.id,lines:[{lineId:first.lines[0].id,quantity:'1'}]}]}]});
 await run('createInvoice',{number:fixture.search.freightInvoice,payerId:fixture.customerId,consignmentIds:[first.id],amount:'37',issueDate:new Date().toISOString().slice(0,10),accountingSource:'browser-acceptance',taxTreatmentReference:'browser-fixture-reference'});
 await db.transaction(owner,tx=>tx.put('configuration',{id:'features',enabled:['P2','P3','P4']}));
 await writeFile(new URL('./fixture.local.json',import.meta.url),JSON.stringify(fixture,null,2),{mode:0o600});console.log('Isolated browser acceptance fixture created. Existing records were not modified.');
}finally{await db.close()}
