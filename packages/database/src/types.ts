export type Role =
  | 'owner' | 'operations' | 'driver' | 'customer_admin' | 'receiver'
  | 'finance' | 'customer_finance' | 'auditor' | 'control_room'
  | 'warehouse' | 'sustainability' | 'platform_admin';

export interface Context {
  tenantId: string;
  userId: string;
  role: Role;
  organizationId?: string;
  facilityIds?: string[];
  assignedDriverId?: string;
  correlationId?: string;
  /** Present on interactive requests; trusted jobs omit these identity snapshots. */
  membershipId?: string;
  sessionId?: string;
  /** Separate owner exit session; never issued for normal business requests. */
  exitSessionId?: string;
  exitExportReceiptId?: string;
  sessionVersion?: number;
  userSessionVersion?: number;
}

export interface Entity {
  id: string;
  [key: string]: unknown;
}

export interface AuditEvent extends Entity {
  tenantId: string;
  actorId: string;
  role: Role;
  action: string;
  target: string;
  details: unknown;
  correlationId: string;
  createdAt: string;
}

export interface OutboxEvent extends Entity {
  tenantId: string;
  type: string;
  aggregateId: string;
  payload: unknown;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead';
  attempts: number;
  availableAt: string;
  createdAt: string;
  completedAt?: string;
  lastError?: string;
  leaseToken?: string;
}

export interface EntityQuery {
  where?: Record<string, unknown>;
  before?: {field:string;value:string};
  limit?: number;
  offset?: number;
}
export interface EntityPageQuery {where?:Record<string,unknown>;before?:{field:string;value:string};limit?:number;cursor?:string}
export interface EntityPage<T extends Entity> {items:T[];nextCursor?:string}
export interface TenantUsage {kind:string;records:string;metadataBytes:string;objectBytes:string}
export type ShipmentSearchType='all'|'lr'|'shipment'|'vehicle'|'goods_invoice'|'eway_bill'|'freight_invoice';
export interface ShipmentSearchQuery {q:string;type?:ShipmentSearchType;match?:'prefix'|'exact';limit?:number;cursor?:string}
export interface ShipmentSearchItem extends Entity {lrNumber?:string;branch?:string;financialYear?:string;status?:string;originId?:string;destinationId?:string;matches:{type:Exclude<ShipmentSearchType,'all'>;value:string}[];matchesTruncated:boolean}
export interface MemberIdentity {id:string;membershipId:string;name:string;email:string;verifiedContact?:string;role:Role;organizationId?:string;facilityIds:string[];status:'active'}
export interface Transaction {
  searchConsignments(query:ShipmentSearchQuery):Promise<EntityPage<ShipmentSearchItem>>;
  lookupMember(userId:string,role?:Role):Promise<MemberIdentity|undefined>;
  page<T extends Entity>(kind:string,query?:EntityPageQuery):Promise<EntityPage<T>>;
  usage():Promise<TenantUsage[]>;
  find<T extends Entity>(kind:string,query?:EntityQuery):Promise<T[]>;
  count(kind:string,where?:Record<string,unknown>):Promise<number>;
  get<T extends Entity>(kind: string, id: string): Promise<T | undefined>;
  list<T extends Entity>(kind: string): Promise<T[]>;
  put<T extends Entity>(kind: string, entity: T): Promise<void>;
  delete(kind: string, id: string): Promise<void>;
  audit(action: string, target: string, details?: unknown): Promise<void>;
  emit(type: string, aggregateId: string, payload: unknown): Promise<void>;
}

export interface DatabasePort {
  transaction<T>(context: Context, callback: (tx: Transaction) => Promise<T>): Promise<T>;
}
