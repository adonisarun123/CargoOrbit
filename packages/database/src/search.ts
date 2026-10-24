import {createHash} from 'node:crypto';
import type {Context,Entity,EntityPage,ShipmentSearchItem,ShipmentSearchQuery,ShipmentSearchType} from './types.js';
const allowedRoles=['owner','operations','finance','auditor','driver','customer_admin','receiver','customer_finance'];
const transport=['owner','operations','finance','auditor'];
const types:ShipmentSearchType[]=['all','lr','shipment','vehicle','goods_invoice','eway_bill','freight_invoice'];
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
export function searchBounds(ctx:Context,query:ShipmentSearchQuery){
 const q=typeof query.q==='string'?query.q.trim().toLowerCase():'',type=query.type??'all',match=query.match??'prefix',limit=query.limit??25;
 if(q.length<2||q.length>100||/[\u0000-\u001f\u007f]/.test(q)||!types.includes(type)||!['prefix','exact'].includes(match)||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(new Error('Invalid shipment search query'),{status:400,code:'SEARCH_VALIDATION'});
 if(!allowedRoles.includes(ctx.role)||type==='freight_invoice'&&!transport.includes(ctx.role)&&ctx.role!=='customer_finance')throw Object.assign(new Error('Shipment search is not allowed'),{status:403,code:'SEARCH_FORBIDDEN'});
 const fingerprint=createHash('sha256').update(JSON.stringify({q,type,match,tenant:ctx.tenantId,user:ctx.userId,membership:ctx.membershipId??null,role:ctx.role,org:ctx.organizationId??null,sites:[...new Set(ctx.facilityIds??[])].sort(),driver:ctx.assignedDriverId??ctx.userId})).digest('hex');
 let afterId:string|undefined;
 if(query.cursor){try{if(query.cursor.length>4096||!/^[A-Za-z0-9_-]+$/.test(query.cursor))throw new Error();const decoded=JSON.parse(Buffer.from(query.cursor,'base64url').toString('utf8'));if(decoded.version!==1||decoded.fingerprint!==fingerprint||typeof decoded.id!=='string'||!decoded.id||decoded.id.length>200)throw new Error();afterId=decoded.id;}catch{throw Object.assign(new Error('Invalid search cursor or changed query scope'),{status:400,code:'SEARCH_CURSOR'});}}
 return {q,type,match,limit,afterId,like:q.replace(/[\\%_]/g,'\\$&')+(match==='prefix'?'%':''),cursor:(id:string)=>Buffer.from(JSON.stringify({version:1,fingerprint,id})).toString('base64url')};
}
export function searchProjection(data:Entity,matches:ShipmentSearchItem['matches']):ShipmentSearchItem{
 const item:ShipmentSearchItem={id:data.id,matches:matches.slice(0,20),matchesTruncated:matches.length>20};
 for(const key of ['lrNumber','branch','financialYear','status','originId','destinationId'] as const)if(typeof data[key]==='string')item[key]=data[key];return item;
}
/** Test-adapter implementation. The deployed implementation uses indexed SQL below. */
export function memoryShipmentSearch(ctx:Context,query:ShipmentSearchQuery,rows:(kind:string)=>Entity[]):EntityPage<ShipmentSearchItem>{
 const bounds=searchBounds(ctx,query),all=transport.includes(ctx.role),sites=ctx.facilityIds??[],driver=ctx.assignedDriverId??ctx.userId;
 const attempts=rows('attempts'),trips=new Map(rows('trips').map(v=>[v.id,v])),docs=new Map(rows('goods_documents').map(v=>[v.id,v])),links=rows('goods_document_links'),invoices=rows('invoices');
 const allowedAttempt=(a:Entity)=>all||ctx.role==='customer_finance'||(ctx.role==='driver'?a.assignedDriverId===driver&&!['cancelled','transferred'].includes(String(a.status)):!sites.length||sites.includes(String(a.facilityId)));
 const items:ShipmentSearchItem[]=[];
 for(const c of rows('consignments').sort((a,b)=>compare(a.id,b.id))){
  if(bounds.afterId&&c.id<=bounds.afterId)continue;const own=attempts.filter(a=>a.consignmentId===c.id);
  const visible=all||(ctx.role==='driver'?(own.length?own.some(allowedAttempt):c.assignedDriverId===driver):!!ctx.organizationId&&(ctx.role==='customer_finance'?c.payerId===ctx.organizationId:c.consigneeId===ctx.organizationId&&(!sites.length||sites.includes(String(c.destinationId))||own.some(a=>sites.includes(String(a.facilityId))))));
  if(!visible)continue;
  const refs:ShipmentSearchItem['matches']=[];const add=(type:Exclude<ShipmentSearchType,'all'>,value:unknown)=>{if(typeof value!=='string'||bounds.type!=='all'&&bounds.type!==type)return;const normalized=value.trim().toLowerCase();if(bounds.match==='exact'?normalized===bounds.q:normalized.startsWith(bounds.q))refs.push({type,value});};
  add('shipment',c.id);add('lr',c.lrNumber);for(const value of Array.isArray(c.invoiceReferences)?c.invoiceReferences:[])add('goods_invoice',value);for(const value of Array.isArray(c.ewayBills)?c.ewayBills:[])add('eway_bill',value?.number);
  for(const link of links.filter(l=>l.consignmentId===c.id)){const doc=docs.get(String(link.documentId));if(doc&&['goods_invoice','eway_bill'].includes(String(doc.kind)))add(doc.kind as 'goods_invoice'|'eway_bill',doc.number);}
  for(const a of own.filter(allowedAttempt)){const trip=trips.get(String(a.tripId));if(ctx.role!=='driver'||trip?.driverId===driver)add('vehicle',trip?.vehicleNumber);}
  if(all||ctx.role==='customer_finance')for(const invoice of invoices)if((all||invoice.payerId===ctx.organizationId)&&Array.isArray(invoice.consignmentIds)&&invoice.consignmentIds.includes(c.id))add('freight_invoice',invoice.number);
  const unique=new Map<string,ShipmentSearchItem['matches'][number]>();for(const ref of refs){const key=ref.type+'\0'+ref.value.trim().toLowerCase(),old=unique.get(key);if(!old||compare(ref.value,old.value)<0)unique.set(key,ref);}
  const matched=[...unique.values()].sort((a,b)=>Number(b.value.trim().toLowerCase()===bounds.q)-Number(a.value.trim().toLowerCase()===bounds.q)||compare(a.type,b.type)||compare(a.value.trim().toLowerCase(),b.value.trim().toLowerCase())||compare(a.value,b.value));
  if(matched.length)items.push(searchProjection(c,matched));if(items.length>bounds.limit)break;
 }
 return {items:items.slice(0,bounds.limit),...(items.length>bounds.limit?{nextCursor:bounds.cursor(items[bounds.limit-1]!.id)}:{})};
}

// Only SQL identifiers fixed in source are interpolated. Query input is always parameterized.
export const shipmentSearchSql=`WITH refs AS MATERIALIZED (
 SELECT source_kind,source_id,reference_type,value FROM shipment_search_terms WHERE tenant_id=$1
 AND ($2::text='all' OR reference_type=$2) AND normalized_prefix LIKE $3::text ESCAPE '\\'
 AND (NOT $4::boolean OR normalize_shipment_reference(value)=$5::text)
 AND (reference_type<>'freight_invoice' OR $7::text IN ('owner','operations','finance','auditor','customer_finance'))
), candidates AS MATERIALIZED (
 SELECT source_id consignment_id,reference_type,value FROM refs WHERE source_kind='consignments'
 UNION ALL SELECT l.data->>'consignmentId',r.reference_type,r.value FROM refs r JOIN entities l
 ON l.tenant_id=$1 AND l.kind='goods_document_links' AND l.data->>'documentId'=r.source_id WHERE r.source_kind='goods_documents'
 UNION ALL SELECT a.data->>'consignmentId',r.reference_type,r.value FROM refs r JOIN entities t
 ON t.tenant_id=$1 AND t.kind='trips' AND t.id=r.source_id JOIN entities a
 ON a.tenant_id=$1 AND a.kind='attempts' AND a.data->>'tripId'=r.source_id WHERE r.source_kind='trips'
 AND ($7::text IN ('owner','operations','finance','auditor','customer_finance') OR
  ($7::text='driver' AND t.data->>'driverId'=$10 AND a.data->>'assignedDriverId'=$10 AND coalesce(a.data->>'status','') NOT IN ('cancelled','transferred')) OR
  ($7::text IN ('customer_admin','receiver') AND (cardinality($9::text[])=0 OR a.data->>'facilityId'=ANY($9::text[]))))
 UNION ALL SELECT linked.id,r.reference_type,r.value FROM refs r JOIN entities i
 ON i.tenant_id=$1 AND i.kind='invoices' AND i.id=r.source_id
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(i.data->'consignmentIds')='array' THEN i.data->'consignmentIds' ELSE '[]'::jsonb END) linked(id)
 WHERE r.source_kind='invoices' AND ($7::text IN ('owner','operations','finance','auditor') OR ($7::text='customer_finance' AND i.data->>'payerId'=$8))
), scoped AS (
 SELECT c.id,jsonb_strip_nulls(jsonb_build_object('id',c.id,'lrNumber',c.data->'lrNumber','branch',c.data->'branch','financialYear',c.data->'financialYear','status',c.data->'status','originId',c.data->'originId','destinationId',c.data->'destinationId')) data FROM entities c WHERE c.tenant_id=$1 AND c.kind='consignments' AND ($6::text IS NULL OR c.id>$6)
 AND EXISTS(SELECT 1 FROM candidates m WHERE m.consignment_id=c.id)
 AND ($7::text IN ('owner','operations','finance','auditor') OR
  ($7::text='driver' AND (EXISTS(SELECT 1 FROM entities a WHERE a.tenant_id=$1 AND a.kind='attempts' AND a.data->>'consignmentId'=c.id AND a.data->>'assignedDriverId'=$10 AND coalesce(a.data->>'status','') NOT IN ('cancelled','transferred'))
   OR (c.data->>'assignedDriverId'=$10 AND NOT EXISTS(SELECT 1 FROM entities a WHERE a.tenant_id=$1 AND a.kind='attempts' AND a.data->>'consignmentId'=c.id)))) OR
  ($7::text='customer_finance' AND c.data->>'payerId'=$8) OR
  ($7::text IN ('customer_admin','receiver') AND c.data->>'consigneeId'=$8 AND
   (cardinality($9::text[])=0 OR c.data->>'destinationId'=ANY($9::text[]) OR EXISTS(SELECT 1 FROM entities a WHERE a.tenant_id=$1 AND a.kind='attempts' AND a.data->>'consignmentId'=c.id AND a.data->>'facilityId'=ANY($9::text[])))))
 ORDER BY c.id LIMIT $11
)
SELECT s.id,s.data,matched.matches FROM scoped s CROSS JOIN LATERAL (
 SELECT jsonb_agg(jsonb_build_object('type',r.reference_type,'value',r.value) ORDER BY r.exact_rank,r.reference_type COLLATE "C",r.normalized COLLATE "C",r.value COLLATE "C") matches FROM (
  SELECT * FROM (SELECT reference_type,min(value COLLATE "C") value,normalize_shipment_reference(value) normalized,CASE WHEN normalize_shipment_reference(value)=$5 THEN 0 ELSE 1 END exact_rank
  FROM candidates WHERE consignment_id=s.id GROUP BY reference_type,normalize_shipment_reference(value)
  ) deduplicated
  ORDER BY exact_rank,reference_type COLLATE "C",normalized COLLATE "C",value COLLATE "C" LIMIT 21
 ) r
) matched ORDER BY s.id`;
