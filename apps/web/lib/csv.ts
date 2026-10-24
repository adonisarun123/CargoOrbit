/** RFC4180-style parser, including quoted commas/newlines and escaped quotes. */
export function parseCsv(text:string):Record<string,string>[] {
 text=text.replace(/^\uFEFF/,'');
 const rows:string[][]=[];let row:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}if(c==='"'){if(cell||closed)throw new Error('Unexpected quote in CSV');quoted=true;}else if(c===','){row.push(cell);cell='';closed=false;}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';closed=false;}else{if(closed&&!/\s/.test(c))throw new Error('Unexpected characters after quoted field');if(!closed)cell+=c;}}
 if(quoted)throw new Error('CSV contains an unclosed quoted field');row.push(cell);if(row.some(Boolean))rows.push(row);if(!rows.length)return [];
 const headers=rows.shift()!.map((v,i)=>(i===0?v.replace(/^\uFEFF/,''):v).trim());if(new Set(headers).size!==headers.length||headers.some(v=>!v))throw new Error('CSV headers must be unique and nonempty');return rows.map((r,index)=>{if(r.length!==headers.length)throw new Error(`CSV row ${index+2} has ${r.length} columns; expected ${headers.length}`);return Object.fromEntries(headers.map((h,i)=>[h,r[i]!]))});
}
export function importRows(text:string){return parseCsv(text).map(r=>{const result:any={...r};for(const k of ['lines','invoiceReferences','ewayBills'])if(r[k])result[k]=JSON.parse(r[k]!);else delete result[k];if(!result.lines){result.lines=[{description:r.description,quantity:r.quantity,unit:r.unit||'pcs'}];delete result.description;delete result.quantity;delete result.unit;}for(const k of Object.keys(result))if(result[k]==='')delete result[k];return result})}
/** Quote every cell and neutralize spreadsheet formulas, including leading whitespace. */
export function serializeCsv(rows:Record<string,unknown>[]):string {
 const keys=[...new Set(rows.flatMap(Object.keys))];
 const cell=(value:unknown)=>{let text=typeof value==='object'&&value!==null?JSON.stringify(value):String(value??'');if(/^\s*[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
 return '\uFEFF'+[keys.map(cell).join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
}
