import {createHash,randomUUID} from 'node:crypto';
import type {Context,Transaction} from '@cargoorbit/database';
import {canonical,decimal,fail,formatted,text,type RecordEntity} from './types.js';
export interface LaunchContext {tx:Transaction;ctx:Context;now:string;hooks:{receipt:(i:Record<string,unknown>)=>Promise<unknown>;count:(i:Record<string,unknown>)=>Promise<unknown>;approveCount:(i:Record<string,unknown>)=>Promise<unknown>}}
export const digest=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export const role=(l:LaunchContext,roles:string[])=>{if(!roles.includes(l.ctx.role))fail(403,'ROLE_FORBIDDEN','Your role cannot perform this operation')};
export async function required(l:LaunchContext,kind:string,id:string){const row=await l.tx.get<RecordEntity>(kind,id);if(!row)fail(404,'NOT_FOUND','Record not found');return row!;}
export function scoped(l:LaunchContext,facilityId:unknown,ownerOrganizationId:unknown){if(l.ctx.role==='warehouse'&&(!l.ctx.organizationId||l.ctx.organizationId!==ownerOrganizationId||!l.ctx.facilityIds?.includes(String(facilityId))))fail(404,'NOT_FOUND','Warehouse record is outside your owner and site membership');}
export async function authority(l:LaunchContext,facilityId:string,ownerOrganizationId:string){scoped(l,facilityId,ownerOrganizationId);await required(l,'facilities',facilityId);await required(l,'organizations',ownerOrganizationId);const c=await required(l,'warehouse_config',`${facilityId}:${ownerOrganizationId}`);if(c.authority!=='cargoorbit_foundation')fail(409,'EXTERNAL_WMS_AUTHORITY','Inventory posting belongs to the approved external WMS');}
export async function create(l:LaunchContext,kind:string,fields:Record<string,unknown>,id=randomUUID()){if(await l.tx.get(kind,id))fail(409,'DUPLICATE','Record already exists');const value={id,...fields,createdAt:l.now,createdBy:l.ctx.userId};await l.tx.put(kind,value);await l.tx.audit(`${kind}.created`,id,{});return value as RecordEntity;}
export async function operation(l:LaunchContext,kind:string,key:string,input:unknown,run:()=>Promise<unknown>){const id=`${kind}:${key}`,prior=await l.tx.get<RecordEntity>('expansion_operations',id);if(prior){if(prior.payloadHash!==digest(input))fail(409,'IDEMPOTENCY_CONFLICT','Operation ID was used with different input');return prior.result;}const result=await run();await l.tx.put('expansion_operations',{id,payloadHash:digest(input),result,completedAt:l.now});return result;}
export const stockSnapshot=(s:RecordEntity)=>digest({id:s.id,quantity:s.quantity,reserved:s.reserved,updatedAt:s.updatedAt??null});
export const stockKey=(s:Record<string,unknown>)=>digest({facilityId:s.facilityId,ownerOrganizationId:s.ownerOrganizationId,sku:s.sku,bin:s.bin,unit:s.unit,lot:s.lot||'',condition:s.condition});
/** An intra-owner/site movement retains paired ledger legs and never changes aggregate physical stock. */
export async function moveStock(l:LaunchContext,stock:RecordEntity,quantity:bigint,destination:{bin:string;condition:string},reference:string,reserved=false){
 await authority(l,String(stock.facilityId),String(stock.ownerOrganizationId));
 if(quantity<=0n||quantity>decimal(stock.quantity)-(reserved?0n:decimal(stock.reserved))||reserved&&quantity>decimal(stock.reserved))fail(409,'INSUFFICIENT_STOCK','Stock is unavailable for this movement');
 const fields={facilityId:stock.facilityId,ownerOrganizationId:stock.ownerOrganizationId,sku:stock.sku,unit:stock.unit,lot:stock.lot||'',bin:destination.bin,condition:destination.condition},id=stockKey(fields);
 if(id===stock.id||destination.bin===stock.bin&&destination.condition===stock.condition)fail(400,'SAME_LOCATION','Movement must change bin or stock condition');
 const target=await l.tx.get<RecordEntity>('stock',id)??{id,...fields,quantity:'0',reserved:'0'};
 stock.quantity=formatted(decimal(stock.quantity)-quantity);if(reserved)stock.reserved=formatted(decimal(stock.reserved)-quantity);stock.updatedAt=l.now;
 target.quantity=formatted(decimal(target.quantity)+quantity);target.updatedAt=l.now;await l.tx.put('stock',stock);await l.tx.put('stock',target);
 const groupId=randomUUID();const movements=[];
 for(const [row,direction] of [[stock,'out'],[target,'in']] as const)movements.push(await create(l,'inventory_movements',{stockId:row.id,facilityId:row.facilityId,ownerOrganizationId:row.ownerOrganizationId,direction,quantity:formatted(quantity),reason:'warehouse_transfer',sourceReference:reference,groupId,postedToErp:false}));
 return {targetStockId:id,movements};
}
export async function alert(l:LaunchContext,key:string,fields:Record<string,unknown>){const prior=await l.tx.get<RecordEntity>('alert_deduplication',key);if(prior)return required(l,'alerts',String(prior.alertId));const value=await create(l,'alerts',{...fields,status:'new',history:[],notificationStatus:'awaiting_approved_schedule'});await l.tx.put('alert_deduplication',{id:key,alertId:value.id});await l.tx.emit('telemetry.alert.created',value.id,{alertId:value.id,ownerUserId:value.ownerUserId});return value;}
export function assigned(l:LaunchContext,task:RecordEntity){scoped(l,task.facilityId,task.ownerOrganizationId);if(l.ctx.role!=='owner'&&task.assignedTo!==l.ctx.userId)fail(403,'TASK_ASSIGNEE','Task is assigned to another operator');}
export function boundedStrings(value:unknown,label:string,max=500){if(!Array.isArray(value)||value.length>max||value.some(v=>typeof v!=='string'||!v.trim()||v.length>200)||new Set(value).size!==value.length)fail(400,'INVALID_LIST',`${label} must be a bounded list of unique identifiers`);return value as string[];}
export function approvalReference(i:Record<string,unknown>){return text(i,'approvalReference');}
