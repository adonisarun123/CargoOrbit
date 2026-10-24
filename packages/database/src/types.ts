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
}

export interface Transaction {
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
