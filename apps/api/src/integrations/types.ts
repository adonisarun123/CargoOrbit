import type {Context, DatabasePort, Entity} from '@cargoorbit/database';
export type IntegrationOperation = 'ulip.read'|'eway.read'|'eway.extend'|'erp.invoice.create'|'erp.invoice.lookup'|'wms.read'|'wms.movement.post'|'esign.request'|'esign.lookup';
export const WRITE_OPERATIONS = new Set<IntegrationOperation>(['eway.extend','erp.invoice.create','wms.movement.post','esign.request']);
export interface ProviderConfiguration {
  id:string;
  tenantId:string;
  provider:string;
  adapterId:string;
  enabled:boolean;
  purpose:string;
  approvalReference:string;
  contractTestReference:string;
  permittedOperations:IntegrationOperation[];
  permittedIdentifierTypes:string[];
  permittedDatasetIds:string[];
  validUntil:string;
  officialAuthorityApproved:boolean;
  maxCallsPerMinute:number;
  freshnessSeconds:number;
}
export interface ProviderRequest {
  operationId:string;operation:IntegrationOperation;purpose:string;identifierType:string;identifier:string;
  datasetId:string;parameters:Record<string,unknown>;
}
export interface ProviderResponse {
  status:'confirmed'|'pending'|'not_found'|'rejected';
  externalReference?:string;observedAt:string;data:Record<string,unknown>;
}
export interface ProviderAdapter {
  /** Adapter implements only the vendor contract it was tested against. */
  execute(request:ProviderRequest):Promise<ProviderResponse>;
  /** Lookup by original stable operation ID. Never retry a write as reconciliation. */
  reconcile?(request:ProviderRequest):Promise<ProviderResponse>;
}
export interface IntegrationCall extends Entity {
  id:string;configurationId:string;operation:IntegrationOperation;requestHash:string;requestedBy:string;
  requestedAt:string;status:'in_flight'|'confirmed'|'pending'|'uncertain'|'not_found'|'rejected';
  write:boolean;attempts:number;updatedAt:string;externalReference?:string;result?:ProviderResponse;
}
export class IntegrationError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);this.name='IntegrationError';}
}
export type IntegrationContext=Context;
export type IntegrationDatabase=DatabasePort;
