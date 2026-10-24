/** A locator for an authenticated receipt view, never a capability token or public-share link. */
export function buildReceiptVerificationUrl(origin:string,podId:string,payloadHash:string,secure=true):string{
 let base:URL;try{base=new URL(origin);}catch{throw new Error('Receipt verification requires a configured application origin');}
 if(base.origin!==origin||base.username||base.password||base.search||base.hash||(secure?base.protocol!=='https:':!['https:','http:'].includes(base.protocol)))throw new Error('Receipt verification application origin must be an explicit HTTPS origin without credentials, paths or query strings');
 if(!/^[A-Za-z0-9_-]{1,160}$/.test(podId)||!/^[a-f0-9]{64}$/.test(payloadHash))throw new Error('Receipt verification requires a valid immutable receipt identifier and SHA-256');
 const url=new URL(`/verify/receipts/${encodeURIComponent(podId)}`,base);url.searchParams.set('sha256',payloadHash);return url.toString();
}
