export function receiptVerificationMatches(result:{podId?:string;payloadHash?:string;integrity?:string},podId:string,expectedHash:string|null){
 return result.podId===podId&&result.integrity==='verified'&&typeof result.payloadHash==='string'&&/^[a-f0-9]{64}$/.test(result.payloadHash)&&(expectedHash===null||(/^[a-f0-9]{64}$/.test(expectedHash)&&expectedHash===result.payloadHash));
}
