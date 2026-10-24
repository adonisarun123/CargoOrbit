import type {Attempt,Consignment,Disposition,Operation,WorkSnapshot} from './types';
export const MAX_DRAFTS=100;
export const MAX_MEDIA_BYTES=300*1024*1024;
export const MAX_PHOTO_BYTES=8*1024*1024;
export const WARNING_RATIO=.8;
export const MAX_CACHE_AGE_MS=24*60*60*1000;
export const MAX_AUTOMATIC_ATTEMPTS=8;
export function assertCapacity(count:number,bytes:number,additionalBytes:number,isPhoto=false):void {
  if(!Number.isSafeInteger(count)||count<0||!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Device storage accounting is invalid. Contact support.');
  if (!isPhoto&&count >= MAX_DRAFTS) throw new Error('Device queue full (100 metadata drafts). Sync or contact operations before saving more.');
  if (!Number.isSafeInteger(additionalBytes)||additionalBytes<0||additionalBytes>MAX_PHOTO_BYTES) throw new Error('Photo exceeds the 8 MB capture limit. Take a smaller photo.');
  if (bytes+additionalBytes>MAX_MEDIA_BYTES) throw new Error('Encrypted media storage limit reached (300 MB). Sync before capturing more.');
}
export function hasCapacityWarning(count:number,bytes:number):boolean {return count>=MAX_DRAFTS*WARNING_RATIO || bytes>=MAX_MEDIA_BYTES*WARNING_RATIO;}
export function normalizeScan(value:string):string {
  const text=value.trim();
  if (!text || text.length>300) throw new Error('Label is empty or too long.');
  // Resolve identifier only. Never open or fetch a URL carried on a barcode.
  if (/^https?:\/\//i.test(text)) {const url=new URL(text);const id=decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'');if(!id||id.includes('/')||id.length>160)throw new Error('Label identifier is invalid.');return id;}
  return text;
}
export function validateQuantity(value:string):boolean {return /^\d{1,15}(\.\d{1,6})?$/.test(value);}
function quantity(value:string):bigint {if(!validateQuantity(value))throw new Error('Enter nonnegative quantities with up to six decimal places.');const [whole,fraction='']=value.split('.');return BigInt(whole!)*1000000n+BigInt(fraction.padEnd(6,'0'));}
export function validateDispositions(attempt:Attempt,lines:Disposition[],reason:string):void {
 if(new Set(lines.map(l=>l.lineId)).size!==lines.length||lines.length!==attempt.lines.length)throw new Error('Every allocated item must appear exactly once.');
 let exceptions=false;
 for(const line of lines){const allocation=attempt.lines.find(l=>l.lineId===line.lineId);if(!allocation)throw new Error('Item does not belong to this delivery attempt.');const received=quantity(line.accepted)+quantity(line.damaged)+quantity(line.rejected)+quantity(line.short);if(received!==quantity(allocation.quantity))throw new Error('Accepted, damaged, rejected and short quantities must equal the stop allocation.');if(quantity(line.damaged)+quantity(line.rejected)+quantity(line.short)>0n)exceptions=true;}
 if(exceptions&&!reason.trim())throw new Error('Record the reason for damaged, rejected or short quantities.');
}
export function attemptLines(consignment:Consignment,attempt:Attempt){return attempt.lines.map(allocation=>{const line=consignment.lines.find(l=>l.id===allocation.lineId);if(!line)throw new Error('An allocated item is missing. Refresh assignments before capture.');return {...line,quantity:allocation.quantity}});}
export function captureAllowed(snapshot:WorkSnapshot|null,now=Date.now()):boolean {if(!snapshot)return false;const at=Date.parse(snapshot.fetchedAt);return Number.isFinite(at)&&at<=now+300000&&now-at<=MAX_CACHE_AGE_MS;}
export function retryAt(attempts:number,now=Date.now()):string {return new Date(now+Math.min(300000,1000*2**Math.min(attempts,8))).toISOString();}
export function shouldRetry(op:Operation,now=Date.now(),manual=false):boolean {return !op.replacedBy&&op.state!=='synchronized'&&op.retryable!==false&&(manual||op.attempts<MAX_AUTOMATIC_ATTEMPTS)&&(!op.nextAttemptAt||manual||Date.parse(op.nextAttemptAt)<=now);}
export function errorMessage(value:unknown):string {return value instanceof Error ? value.message : 'The operation failed. Retry or contact operations.';}
