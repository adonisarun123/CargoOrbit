import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Context,DatabasePort,Entity,OutboxEvent} from '@cargoorbit/database';
import {OperationsError} from './operations-service.js';
const roles=['owner','operations','finance','control_room','auditor'];
const sources=['tasks','scheduled_tasks','ops_tasks'];
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function authorize(ctx:Context,write=false){if(!roles.includes(ctx.role)||write&&ctx.role==='auditor')throw new OperationsError(403,'FORBIDDEN','Operations task permission required')}
const reason=z.string().min(5).max(1000),priority=z.enum(['low','normal','high','urgent']);
export class TaskService{
 constructor(private db:DatabasePort,private now=()=>new Date()){}
 async page(ctx:Context,source:string,cursor?:string){authorize(ctx);if(!sources.includes(source))throw new OperationsError(404,'RESOURCE','Task source not found');return this.db.transaction(ctx,async tx=>{const page=await tx.page(source,{limit:100,cursor});const items=[];for(const task of page.items){const state=await tx.get('task_workflow',digest([source,task.id]));items.push({...task,...state,id:task.id,source,version:Number(state?.version||1),sourceStatus:task.status,status:source==='ops_tasks'?(state?.status||task.status):task.status,ageMinutes:Math.max(0,Math.floor((this.now().getTime()-Date.parse(String(task.createdAt||this.now().toISOString())))/60000))})}return {...page,items}})}
 async list(ctx:Context){authorize(ctx);return this.db.transaction(ctx,async tx=>{
  const result:Entity[]=[];for(const source of sources){const page=await tx.page(source,{limit:500});for(const task of page.items){const state=await tx.get('task_workflow',digest([source,task.id]));result.push({...task,...state,id:task.id,source,version:Number(state?.version||1),sourceStatus:task.status,status:source==='ops_tasks'?(state?.status||task.status):task.status,ageMinutes:Math.max(0,Math.floor((this.now().getTime()-Date.parse(String(task.createdAt||this.now().toISOString())))/60000))})}}
  return result.sort((a,b)=>String(a.dueAt||'9999').localeCompare(String(b.dueAt||'9999')));
 })}
 async create(ctx:Context,raw:unknown){authorize(ctx,true);const i=z.object({title:z.string().min(3).max(200),description:z.string().min(5).max(2000),ownerRole:z.enum(['owner','operations','finance','control_room']),assigneeId:z.string().min(1).optional(),dueAt:z.string().datetime({offset:true}),priority:priority.default('normal'),reference:z.string().min(3).max(200)}).strict().parse(raw);return this.db.transaction(ctx,async tx=>{
  if(i.assigneeId&&!await tx.lookupMember(i.assigneeId,i.ownerRole))throw new OperationsError(400,'ASSIGNEE','Assignee must be an active member with the selected role');
  const task={id:randomUUID(),...i,status:'open',createdBy:ctx.userId,createdAt:this.now().toISOString(),version:1};await tx.put('ops_tasks',task);await tx.audit('task.created',task.id,{ownerRole:i.ownerRole});return {...task,source:'ops_tasks'};
 })}
 async transition(ctx:Context,source:string,id:string,raw:unknown){authorize(ctx,true);if(!sources.includes(source))throw new OperationsError(404,'RESOURCE','Task source not found');const i=z.object({expectedVersion:z.number().int().positive(),status:z.enum(['open','in_progress','resolved']).optional(),assigneeId:z.string().min(1).nullable().optional(),dueAt:z.string().datetime({offset:true}).optional(),priority:priority.optional(),reason}).strict().parse(raw);return this.db.transaction(ctx,async tx=>{
  const task=await tx.get(source,id);if(!task)throw new OperationsError(404,'NOT_FOUND','Task not found');const stateId=digest([source,id]),prior=await tx.get('task_workflow',stateId);if(Number(prior?.version||1)!==i.expectedVersion)throw new OperationsError(409,'VERSION_CONFLICT','Task changed; refresh before applying your update');
  if(source!=='ops_tasks'&&i.status!==undefined)throw new OperationsError(409,'DOMAIN_CONTROLLED','Resolve the source workflow to close this generated task');
  if(i.assigneeId){const ownerRole=String(task.ownerRole||task.owner||'operations');const member=await tx.lookupMember(i.assigneeId,roles.includes(ownerRole)?ownerRole as Context['role']:undefined);if(!member||!roles.includes(member.role)||member.role==='auditor')throw new OperationsError(400,'ASSIGNEE','Assignee must have an active membership in the task owner role')}
  const {expectedVersion,...changes}=i;const state={...prior,...changes,id:stateId,taskId:id,source,version:expectedVersion+1,updatedBy:ctx.userId,updatedAt:this.now().toISOString()};await tx.put('task_workflow',state);await tx.put('task_history',{id:randomUUID(),source,taskId:id,version:state.version,changes,actorId:ctx.userId,createdAt:state.updatedAt});await tx.audit('task.updated',id,{source,version:state.version});return {...task,...state,id,source};
 })}
 async inbox(ctx:Context){return this.db.transaction(ctx,async tx=>(await tx.page('user_notifications',{where:{userId:ctx.userId},limit:200})).items)}
 async inboxPage(ctx:Context,cursor?:string){return this.db.transaction(ctx,tx=>tx.page('user_notifications',{where:{userId:ctx.userId},limit:100,cursor}))}
 async read(ctx:Context,id:string){return this.db.transaction(ctx,async tx=>{const n=await tx.get('user_notifications',id);if(!n||n.userId!==ctx.userId)throw new OperationsError(404,'NOT_FOUND','Notification not found');n.readAt=this.now().toISOString();await tx.put('user_notifications',n);return n})}
 async businessEvent(ctx:Context,event:OutboxEvent){const payload=event.payload as Record<string,any>;const messages:Record<string,string>={'trip.assigned':'A trip has been assigned to you.','trip.reassigned':'A trip assignment has changed.','receiver.granted':'You have a new receiver authorization.','receiver.revoked':'A receiver authorization has been revoked.','receiver.invited':'A delivery is awaiting your authorized review.'};if(!messages[event.type])return false;
  return this.db.transaction(ctx,async tx=>{const recipients=new Set([payload.driverId,payload.previousDriverId,payload.userId,payload.receiverUserId].filter(v=>typeof v==='string'&&v.length));for(const userId of recipients){const id=digest([event.id,userId]);if(await tx.get('user_notifications',id))continue;await tx.put('user_notifications',{id,userId,eventId:event.id,type:event.type,targetId:event.aggregateId,message:messages[event.type],createdAt:this.now().toISOString()});}return true});
 }
}
