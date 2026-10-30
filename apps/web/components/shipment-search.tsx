'use client';
import {useEffect,useMemo,useState,type FormEvent} from 'react';
import {query,request,type Row,type Session} from '@/lib/api';
import {invoiceSearchRoles,SearchRequestGate,searchCsvRows,searchPath,searchSessionKey,searchTypes,type SearchCriteria,type ShipmentSearchItem,type ShipmentSearchPage,type SearchType} from '@/lib/shipment-search';
import {Badge,DownloadCsv,Empty,ErrorNotice,Field,Info,Table} from './ui';
import {Icon} from './icons';

type PageRequest={criteria:SearchCriteria;index:number;cursors:(string|undefined)[]};
export function ShipmentSearch({session,site,onOpen}:{session:Session;site:(id?:string)=>string;onOpen:(record:Row)=>void}){
 const [q,setQ]=useState(''),[type,setType]=useState<SearchType>('all'),[match,setMatch]=useState<'prefix'|'exact'>('prefix'),[limit,setLimit]=useState(25);
 const [result,setResult]=useState<ShipmentSearchPage|null>(null),[active,setActive]=useState<PageRequest|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const scope=searchSessionKey(session),gate=useMemo(()=>new SearchRequestGate(session),[scope]);
 useEffect(()=>()=>gate.invalidate(),[gate]);
 function reset(){gate.invalidate();setResult(null);setActive(null);setError('');setBusy(false)}
 async function load(target:PageRequest){
  const ticket=gate.begin();setBusy(true);setError('');setResult(null);setActive(target);
  try{const page=await request<ShipmentSearchPage>(searchPath(target.criteria,target.cursors[target.index]),session.accessToken);if(gate.current(ticket))setResult(page)}
  catch(e){if(gate.current(ticket))setError(e instanceof Error?e.message:'Search could not be completed.')}
  finally{if(gate.current(ticket))setBusy(false)}
 }
 function submit(event:FormEvent){event.preventDefault();void load({criteria:{q:q.trim(),type,match,limit},index:0,cursors:[undefined]})}
 async function open(item:ShipmentSearchItem){
  const ticket=gate.begin();setBusy(true);setError('');
  try{const record=await query(session.accessToken,'consignments',item.id);if(gate.current(ticket))onOpen(record)}
  catch(e){if(gate.current(ticket))setError(e instanceof Error?e.message:'The shipment is no longer available.')}
  finally{if(gate.current(ticket))setBusy(false)}
 }
 return <>
  <Info>Search the references you are authorized to view in this workspace. Results reflect current access and records; CSV exports contain this page only.</Info>
  <section className="panel shipment-search" aria-label="Cross-reference search">
   <form className="shipment-search-form" onSubmit={submit}>
    <Field label="Reference to find" hint="Enter 2–100 characters. Prefix matches the start of a reference; % and _ are literal characters."><input autoFocus required minLength={2} maxLength={100} placeholder="LR, shipment ID, vehicle or invoice reference" value={q} onChange={event=>{reset();setQ(event.target.value)}}/></Field>
    <div className="shipment-search-options">
     <Field label="Reference type"><select value={type} onChange={event=>{reset();setType(event.target.value as SearchType)}}>{Object.entries(searchTypes).filter(([key])=>key!=='freight_invoice'||invoiceSearchRoles.includes(session.user.role)).map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></Field>
     <Field label="Match method"><select value={match} onChange={event=>{reset();setMatch(event.target.value as 'prefix'|'exact')}}><option value="prefix">Starts with</option><option value="exact">Exact reference</option></select></Field>
     <Field label="Results per page"><select value={limit} onChange={event=>{reset();setLimit(Number(event.target.value))}}>{[10,25,50,100].map(size=><option key={size} value={size}>{size}</option>)}</select></Field>
     <button className="button primary" disabled={busy||q.trim().length<2} type="submit"><Icon name="search" size={17}/>Search references</button>
    </div>
   </form>
   {error&&<ErrorNotice message={error} onRetry={active&&!result?()=>void load(active):undefined}/>}
   <div role="status" aria-live="polite" className="shipment-search-summary">{busy?'Searching or opening the authorized shipment…':result&&active?`${result.items.length} shipment${result.items.length===1?'':'s'} on page ${active.index+1} for “${active.criteria.q}”`:''}</div>
   {result&&active?<>
    <div className="panel-heading"><div><h2>Matching shipments</h2><p>Each shipment appears once per page. Matching references explain the connection.</p></div><DownloadCsv label="Export this page" disabled={busy} rows={searchCsvRows(result.items)} filename={`freytara-search-page-${active.index+1}.csv`}/></div>
    {result.items.length?<Table headers={['Shipment / LR','Route','Matching references','Status','']}>{result.items.map(item=><tr key={item.id}>
     <td><strong>{item.lrNumber}</strong><small>{[item.branch,item.financialYear].filter(Boolean).join(' · ')}</small><small className="search-shipment-id">{item.id}</small></td>
     <td><strong>{site(item.originId)}</strong><small>To {site(item.destinationId)}</small></td>
     <td><ul className="search-references">{item.matches.map((reference,index)=><li key={`${reference.type}:${index}`}><small>{searchTypes[reference.type]}</small><span>{reference.value}</span></li>)}</ul>{item.matchesTruncated&&<small>Additional matching references exist. Open the shipment to review its records.</small>}</td>
     <td><Badge value={item.status}/></td><td><button className="row-link" disabled={busy} onClick={()=>void open(item)} aria-label={`Open shipment ${item.lrNumber}`}>Open <Icon name="arrow" size={14}/></button></td>
    </tr>)}</Table>:<Empty icon="search" title="No matching shipments" description="Try a different reference or match method. Only shipments and reference types within your current access can appear."/>}
    <div className="table-footer"><span>Page {active.index+1} · {result.items.length} authorized shipment{result.items.length===1?'':'s'}</span><div className="search-pagination" aria-label="Search result pages"><button className="button secondary small" disabled={busy||active.index===0} onClick={()=>void load({...active,index:active.index-1})}>Previous page</button><button className="button secondary small" disabled={busy||!result.nextCursor} onClick={()=>void load({criteria:active.criteria,index:active.index+1,cursors:[...active.cursors.slice(0,active.index+1),result.nextCursor]})}>Next page</button></div></div>
   </>:!busy&&!error?<Empty icon="search" title="Find a shipment by its references" description="Search across LR numbers, shipment IDs, assigned vehicles and linked document references."/>:null}
  </section>
 </>
}
