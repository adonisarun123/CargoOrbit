/** Whitelisted import column mapping. It never evaluates expressions or arbitrary property paths. */
export function mapImportRows(kind:'consignments'|'invoices',rows:unknown[],mapping:Record<string,string>={},defaults:Record<string,unknown>={}){
 const common=['id','currency'],fields=kind==='consignments'?['lrNumber','branch','financialYear','consignorId','consigneeId','payerId','originId','destinationId','policyId','lines','goodsValue','freightAmount','invoiceReferences','ewayBills']:['number','payerId','consignmentIds','amount','issueDate','status','accountingSource','taxTreatmentReference','paymentTrigger','paymentDays','paymentCalendar','termsOverrideReason','chargeLines','taxData'];
 const nested=kind==='consignments'?['line.id','line.description','line.sku','line.quantity','line.unit','line.packages','line.weight']:['taxData.supplierGstin','taxData.payerGstin','taxData.placeOfSupply','taxData.sacCode','taxData.irn','taxData.ewayBillNumber'];
 const allowed=new Set([...common,...fields,...nested]),arrays=new Set(['lines','invoiceReferences','ewayBills','consignmentIds','chargeLines']),objects=new Set(['paymentCalendar','taxData']);
 const errors:{row:number;message:string}[]=[],keys=Object.keys(mapping);const invalid=keys.find(k=>!allowed.has(k))??Object.keys(defaults).find(k=>!allowed.has(k));
 const mapped=rows.map((row,index)=>{try{
  if(invalid)throw new Error(`Unsupported target column: ${invalid}`);if(!row||typeof row!=='object'||Array.isArray(row))throw new Error('Row must be an object');
  const source=row as Record<string,unknown>,out:Record<string,unknown>={...defaults};if(keys.length){for(const [target,column] of Object.entries(mapping)){if(!Object.hasOwn(source,column))throw new Error(`Source column missing: ${column}`);if(source[column]!==''&&source[column]!==undefined&&source[column]!==null)out[target]=source[column];}}else Object.assign(out,source);
  for(const k of Object.keys(out)){if(typeof out[k]==='string'){const v=(out[k] as string).trim();if(arrays.has(k))out[k]=v.startsWith('[')?JSON.parse(v):['consignmentIds','invoiceReferences'].includes(k)?v.split(/[|,]/).map(v=>v.trim()).filter(Boolean):JSON.parse(v);else if(objects.has(k))out[k]=JSON.parse(v);else if(k==='paymentDays')out[k]=Number(v);else out[k]=v;}}
  const line:Record<string,unknown>={},tax:Record<string,unknown>={};for(const k of Object.keys(out))if(k.startsWith('line.')){line[k.slice(5)]=out[k];delete out[k];}else if(k.startsWith('taxData.')){tax[k.slice(8)]=out[k];delete out[k];}
  if(Object.keys(line).length){if(out.lines)throw new Error('Use either a complete lines column or single-line columns');out.lines=[line];}if(Object.keys(tax).length)out.taxData={...(out.taxData as object??{}),...tax};return out;
 }catch(error){errors.push({row:index+1,message:error instanceof Error?error.message:'Invalid mapped row'});return null;}});
 return {rows:mapped,errors};
}
