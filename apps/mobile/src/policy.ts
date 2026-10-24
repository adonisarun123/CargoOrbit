export const MAX_DRAFTS=100;
export const MAX_MEDIA_BYTES=300*1024*1024;
export const MAX_PHOTO_BYTES=8*1024*1024;
export const WARNING_RATIO=.8;
export function assertCapacity(count:number,bytes:number,additionalBytes:number):void {
  if (count >= MAX_DRAFTS) throw new Error('Device queue full (100 pending items). Sync or contact operations before saving more.');
  if (!Number.isSafeInteger(additionalBytes)||additionalBytes<0||additionalBytes>MAX_PHOTO_BYTES) throw new Error('Photo exceeds the 8 MB capture limit. Take a smaller photo.');
  if (bytes+additionalBytes>MAX_MEDIA_BYTES) throw new Error('Encrypted media storage limit reached (300 MB). Sync before capturing more.');
}
export function hasCapacityWarning(count:number,bytes:number):boolean {return count>=MAX_DRAFTS*WARNING_RATIO || bytes>=MAX_MEDIA_BYTES*WARNING_RATIO;}
export function normalizeScan(value:string):string {
  const text=value.trim();
  if (!text || text.length>300) throw new Error('Label is empty or too long.');
  if (/^https?:\/\//i.test(text)) {const url=new URL(text); return decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||'');}
  return text;
}
// Values remain strings across the wire. This validation never silently repairs a quantity.
export function validateQuantity(value:string):boolean {return /^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value);}
export function errorMessage(value:unknown):string {return value instanceof Error ? value.message : 'The operation failed. Retry or contact operations.';}
