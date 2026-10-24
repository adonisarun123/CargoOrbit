export interface DriverUser { id:string; name:string; email:string; role:string; tenantId:string; }
export interface Session { accessToken:string; user:DriverUser; }
export interface Line { id:string; description:string; quantity:string; unit:string; }
export interface Consignment { id:string; lrNumber:string; status:string; originId:string; destinationId:string; lines:Line[]; assignedDriverId?:string; invoiceReferences?:string[]; freightAmount?:string; }
export type OperationKind = 'event'|'draft'|'photo';
export type SyncState = 'pending'|'uploading'|'failed'|'synchronized';
export interface Operation { id:string; kind:OperationKind; consignmentId:string; payload:Record<string,unknown>; sha256:string|null; bytes:number; state:SyncState; attempts:number; error:string|null; serverId:string|null; createdAt:string; }
export interface QueueStats { pending:number; failed:number; synchronized:number; bytes:number; count:number; warning:boolean; }
export interface Disposition { lineId:string; accepted:string; damaged:string; rejected:string; short:string; }
