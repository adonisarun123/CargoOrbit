export interface DriverUser { id:string; name:string; email:string; role:string; tenantId:string; membershipId?:string; }
export interface Session { accessToken:string; refreshToken?:string; expiresIn?:number; user:DriverUser; }
export interface MembershipChoice { id:string; name:string; role:string; }
export interface Line { id:string; description:string; quantity:string; unit:string; }
export interface Consignment { id:string; lrNumber:string; status:string; originId:string; destinationId:string; lines:Line[]; assignedDriverId?:string; invoiceReferences?:string[]; }
export interface Attempt {id:string;consignmentId:string;facilityId:string;lines:{lineId:string;quantity:string}[];status:string;operationalStatus?:string;assignedDriverId?:string;}
export interface Pod {id:string;consignmentId:string;attemptId:string;version:number;status:string;lines:Disposition[];evidenceIds:string[];exceptions:{reason:string;notes?:string}[];}
export interface BarcodeMapping {id:string;code:string;symbology:string;consignmentIds:string[];}
export interface WorkSnapshot {consignments:Consignment[];attempts:Attempt[];pods:Pod[];barcodes?:BarcodeMapping[];fetchedAt:string;}
export type OperationKind = 'event'|'draft'|'photo';
export type SyncState = 'pending'|'uploading'|'failed'|'synchronized';
export interface Operation { id:string; kind:OperationKind; consignmentId:string; payload:Record<string,unknown>; sha256:string|null; bytes:number; state:SyncState; attempts:number; error:string|null; serverId:string|null; createdAt:string; retryable:boolean; nextAttemptAt:string|null; errorCode?:string|null;replacedBy?:string|null;escalationId?:string|null;escalationState?:string|null; }
export interface SyncEscalation {id:string;operationId:string;payload:Record<string,unknown>;state:'pending'|'failed'|'synchronized';attempts:number;nextAttemptAt:string|null;serverId:string|null;error:string|null;retryable:boolean;}
export interface QueueStats { pending:number; failed:number; synchronized:number; bytes:number; count:number; warning:boolean; }
export interface Disposition { lineId:string; accepted:string; damaged:string; rejected:string; short:string; }
export interface QueuePort {
 readonly owner:string;
 list():Promise<Operation[]>;
 get(id:string):Promise<Operation|undefined>;
 mediaBase64(id:string):Promise<string>;
 markUploading(id:string):Promise<void>;
 markFailed(id:string,error:string,options?:{retryable?:boolean;nextAttemptAt?:string|null;errorCode?:string|null}):Promise<void>;
 markSynced(id:string,serverId:string):Promise<void>;
 listEscalations?():Promise<SyncEscalation[]>;
 markEscalation?(id:string,result:{serverId?:string;error?:string;nextAttemptAt?:string|null;retryable?:boolean}):Promise<void>;
}
