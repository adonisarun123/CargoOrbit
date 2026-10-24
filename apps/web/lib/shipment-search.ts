import {readSession,type Session} from './api';

export const searchTypes={all:'All references',lr:'LR number',shipment:'Shipment ID',vehicle:'Vehicle number',goods_invoice:'Goods invoice',eway_bill:'E-way bill',freight_invoice:'Freight invoice'} as const;
export type SearchType=keyof typeof searchTypes;
export const shipmentSearchRoles=['owner','operations','finance','auditor','customer_finance','customer_admin','receiver','driver'];
export const invoiceSearchRoles=['owner','operations','finance','auditor','customer_finance'];
export type SearchCriteria={q:string;type:SearchType;match:'prefix'|'exact';limit:number};
export type ShipmentSearchItem={id:string;lrNumber:string;branch?:string;financialYear?:string;status:string;originId:string;destinationId:string;matches:{type:Exclude<SearchType,'all'>;value:string}[];matchesTruncated?:boolean};
export type ShipmentSearchPage={items:ShipmentSearchItem[];nextCursor?:string};
export function searchPath(criteria:SearchCriteria,cursor?:string){
 const q=criteria.q.trim();if(q.length<2||q.length>100||/[\u0000-\u001f\u007f]/.test(q))throw new Error('Enter between 2 and 100 characters without control characters.');
 if(!Number.isInteger(criteria.limit)||criteria.limit<1||criteria.limit>100)throw new Error('Choose a page size between 1 and 100.');
 const params=new URLSearchParams({q,type:criteria.type,match:criteria.match,limit:String(criteria.limit)});if(cursor)params.set('cursor',cursor);return '/search?'+params;
}
export function searchSessionKey(session:Session|null){return session?JSON.stringify([session.user.id,session.user.tenantId,session.user.membershipId,session.user.sessionId,session.user.role,session.user.organizationId,[...new Set(session.user.facilityIds||[])].sort(),session.user.assignedDriverId]):''}
/** A late page/detail request must not populate a different query or sign-in session. */
export class SearchRequestGate {
 private version=0;
 constructor(private readonly session:Session,private readonly active:()=>Session|null=readSession){}
 begin(){return ++this.version}
 invalidate(){this.version++}
 current(version:number){return version===this.version&&searchSessionKey(this.active())===searchSessionKey(this.session)}
}
export function searchCsvRows(items:ShipmentSearchItem[]){return items.map(item=>({
 'LR number':item.lrNumber,'Shipment ID':item.id,'Branch':item.branch||'','Financial year':item.financialYear||'','Status':item.status,'Origin ID':item.originId,'Destination ID':item.destinationId,
 'Matching references':item.matches.map(reference=>`${searchTypes[reference.type]}: ${reference.value}`).join('\n'),'More matching references':item.matchesTruncated?'Yes — open shipment to review':'No',
}))}
