import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Context, Transaction } from '@cargoorbit/database';

export const shipmentSearchTypes = ['all', 'lr', 'shipment', 'vehicle', 'goods_invoice', 'eway_bill', 'freight_invoice'] as const;
const querySchema = z.object({
  q: z.string().trim().min(2).max(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), 'Search cannot contain control characters'),
  type: z.enum(shipmentSearchTypes).default('all'),
  match: z.enum(['prefix', 'exact']).default('prefix'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(4096).optional(),
}).strict();

export class ShipmentSearchError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ShipmentSearchError'; }
}

/** Search returns shipment navigation references, never the underlying financial or receipt records. */
export async function searchShipments(tx: Transaction, ctx: Context, raw: unknown) {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) throw new ShipmentSearchError(400, 'SEARCH_VALIDATION', parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  const invoiceReaders = ['owner', 'operations', 'finance', 'auditor', 'customer_finance'];
  if (![...invoiceReaders, 'customer_admin', 'receiver', 'driver'].includes(ctx.role)) throw new ShipmentSearchError(403, 'SEARCH_FORBIDDEN', 'Your role cannot search shipments');
  if (parsed.data.type === 'freight_invoice' && !invoiceReaders.includes(ctx.role)) throw new ShipmentSearchError(403, 'SEARCH_FORBIDDEN', 'Your role cannot search freight invoices');
  // The database applies both reference and current actor scope filters before its keyset LIMIT.
  const page = await tx.searchConsignments(parsed.data);
  await tx.audit('shipment.search', 'workspace', {
    queryHash: createHash('sha256').update(parsed.data.q.toLowerCase()).digest('hex'),
    type: parsed.data.type,
    match: parsed.data.match,
    count: page.items.length,
  });
  return {
    items: page.items.map(item => ({
      id: item.id,
      lrNumber: item.lrNumber,
      branch: item.branch,
      financialYear: item.financialYear,
      status: item.status,
      originId: item.originId,
      destinationId: item.destinationId,
      matches: item.matches.map(reference => ({ type: reference.type, value: reference.value })),
      ...(item.matchesTruncated ? { matchesTruncated: true } : {}),
    })),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}
