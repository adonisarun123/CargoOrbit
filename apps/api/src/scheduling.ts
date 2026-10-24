import {z} from 'zod';

const shiftFields={timeZone:z.string().max(80),weekdays:z.array(z.number().int().min(0).max(6)).min(1).max(7),startHour:z.number().int().min(0).max(23),endHour:z.number().int().min(0).max(24),holidays:z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(400).default([]),channel:z.enum(['email','sms']),contact:z.string().min(5).max(254)};
const tier=z.object({afterMinutes:z.number().int().min(0).max(525600),channel:shiftFields.channel,contact:shiftFields.contact,ownerRole:z.enum(['owner','operations','finance','control_room'])}).strict();
const site=z.object({...shiftFields,id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),facilityId:z.string().min(1).max(100),ewayOffsetsMinutes:z.array(z.number().int().min(1).max(10080)).min(1).max(12).optional(),escalationTiers:z.array(tier).max(10).default([])}).strict();
export const schedulerSchema=z.object({...shiftFields,enabled:z.boolean(),receiverAfterMinutes:z.number().int().min(5).max(43200),ewayExpiryMinutes:z.number().int().min(1).max(10080),invoiceIssueReviewDays:z.number().int().min(1).max(365),siteSchedules:z.array(site).max(50).optional(),reason:z.string().min(5).max(1000)}).strict().superRefine((value,ctx)=>{
 const schedules=[value,...value.siteSchedules||[]];
 for(const schedule of schedules){if(schedule.startHour===schedule.endHour)ctx.addIssue({code:'custom',message:'Shift start and end must differ; use 0 to 24 for a full day'});try{new Intl.DateTimeFormat('en',{timeZone:schedule.timeZone}).format()}catch{ctx.addIssue({code:'custom',message:'Use a valid IANA time zone'})}}
 if(value.siteSchedules?.some(s=>s.id==='tenant'))ctx.addIssue({code:'custom',message:'tenant is reserved for the workspace fallback schedule'});
 for(const schedule of value.siteSchedules||[])if(new Set(schedule.escalationTiers.map(t=>t.afterMinutes)).size!==schedule.escalationTiers.length)ctx.addIssue({code:'custom',message:'Escalation thresholds must be unique within a schedule'});
 if(new Set(value.siteSchedules?.map(s=>s.id)).size!==(value.siteSchedules?.length||0))ctx.addIssue({code:'custom',message:'Schedule identifiers must be unique'});
});

/** A shift crossing midnight belongs to its local start date, including its weekday. */
export function withinShift(now:Date,policy:Record<string,any>){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:policy.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23',weekday:'short'}).formatToParts(now);
 const read=(t:string)=>parts.find(p=>p.type===t)?.value||'';
 let day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(read('weekday'));
 const currentDate=`${read('year')}-${read('month')}-${read('day')}`,hour=Number(read('hour'));
 let date=currentDate;const overnight=policy.endHour<policy.startHour;
 if(overnight&&hour<policy.endHour){date=new Date(Date.parse(`${currentDate}T12:00:00Z`)-86400000).toISOString().slice(0,10);day=(day+6)%7;}
 const inHours=overnight?(hour>=policy.startHour||hour<policy.endHour):(hour>=policy.startHour&&hour<policy.endHour);
 return {eligible:!!policy.enabled&&policy.weekdays.includes(day)&&!(policy.holidays||[]).includes(date)&&!(policy.holidays||[]).includes(currentDate)&&inHours,date};
}
export function schedules(config:Record<string,any>){return [{...config,id:'tenant',facilityId:undefined,siteSchedules:undefined},...(config.siteSchedules||[]).map((s:any)=>({...config,...s,siteSchedules:undefined}))]}
export function matchingSchedules(config:Record<string,any>,facilityId?:string){const all=schedules(config),specific=all.filter(s=>s.facilityId&&s.facilityId===facilityId);return specific.length?specific:all.filter(s=>s.id==='tenant')}
export function ewayOffset(schedule:Record<string,any>,validUntil:string,now:Date){const offsets=[...new Set<number>(schedule.ewayOffsetsMinutes||[schedule.ewayExpiryMinutes])].sort((a,b)=>a-b);return offsets.find(offset=>Date.parse(validUntil)<=now.getTime()+offset*60000)}
export function escalationFor(schedule:Record<string,any>,openedAt:unknown,now:Date,enabled=true){const opened=Date.parse(String(openedAt));const age=Number.isFinite(opened)?Math.max(0,(now.getTime()-opened)/60000):0;return enabled?[...(schedule.escalationTiers||[])].sort((a:any,b:any)=>a.afterMinutes-b.afterMinutes).filter((t:any)=>age>=t.afterMinutes).at(-1):undefined}
export function scheduleFor(config:Record<string,any>,scheduleId:unknown){return schedules(config).find((s:any)=>s.id===(scheduleId||'tenant'))}
