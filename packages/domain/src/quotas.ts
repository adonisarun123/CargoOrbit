import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Context, DatabasePort, Transaction } from '@cargoorbit/database';

const limit = z.number().int().min(0).max(100_000_000);
const limitsSchema = z.object({ consignmentsPerMonth: limit.optional(), organizations: limit.optional(), facilities: limit.optional() }).strict();
const timestamp = z.string().datetime({ offset: true }).transform(value => new Date(value).toISOString());
/** Operator-provisioned entitlement. No tenant-facing endpoint may write this record. */
export const contractUsageCeilingSchema = z.object({
  id: z.literal('contract_usage_ceiling').default('contract_usage_ceiling'),
  limits: limitsSchema.refine(value => Object.keys(value).length > 0, 'At least one entitlement is required'),
  contractReference: z.string().trim().min(1).max(200),
  validFrom: timestamp,
  validUntil: timestamp,
}).strict().refine(value => value.validUntil > value.validFrom, 'Contract validity must end after it starts');
const selectedSchema = z.object({
  limits: limitsSchema,
  warningPercent: z.number().int().min(50).max(95).default(80),
  reason: z.string().trim().min(3).max(1000),
}).strict();
type Limits = z.infer<typeof limitsSchema>;
type Resource = keyof Limits;
type Ceiling = z.infer<typeof contractUsageCeilingSchema>;
const resources = ['consignmentsPerMonth', 'organizations', 'facilities'] as const;
const kinds = { consignmentsPerMonth: 'consignments', organizations: 'organizations', facilities: 'facilities' };
export class ContractUsageError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ContractUsageError'; }
}
const fail = (status: number, code: string, message: string): never => { throw new ContractUsageError(status, code, message); };

async function configuration(tx: Transaction) {
  const record = await tx.get('configuration', 'contract_usage_ceiling');
  let ceiling: Ceiling | undefined;
  if (record) {
    const parsed = contractUsageCeilingSchema.safeParse(record);
    if (!parsed.success) fail(503, 'CONTRACT_USAGE_CONFIGURATION', 'Operator contract usage configuration requires review');
    ceiling = parsed.data!;
  }
  const selected = await tx.get('configuration', 'usage_limits');
  const parsed = selectedSchema.safeParse(selected ? { limits: selected.limits, warningPercent: selected.warningPercent, reason: selected.reason } : { limits: {}, reason: 'Operator contract defaults' });
  if (!parsed.success) fail(503, 'CONTRACT_USAGE_CONFIGURATION', 'Tenant usage configuration requires review');
  return { ceiling, selected, preferences: parsed.data! };
}
function effectiveLimit(ceiling: Ceiling | undefined, selected: Limits, resource: Resource) {
  const maximum = ceiling?.limits[resource];
  return maximum === undefined ? undefined : Math.min(maximum, selected[resource] ?? maximum);
}
function periodFor(resource: Resource, at: string) { return resource === 'consignmentsPerMonth' ? at.slice(0, 7) : 'lifetime'; }
async function currentUsage(tx: Transaction, resource: Resource, at: string) {
  const period = periodFor(resource, at), id = `${resource}:${period}`;
  const counter = await tx.get('usage_counters', id);
  // Existing data is included when quotas are first enabled. Counters never fall after deletion.
  const actual = resource === 'consignmentsPerMonth'
    ? (await tx.list('consignments')).filter(row => String(row.createdAt).startsWith(period) || !Number.isFinite(Date.parse(String(row.createdAt)))).length
    : await tx.count(kinds[resource]);
  if (counter && (!Number.isSafeInteger(counter.used) || Number(counter.used) < 0)) fail(503, 'CONTRACT_USAGE_CONFIGURATION', 'Usage counter requires operator review');
  return { id, period, used: Math.max(Number(counter?.used ?? 0), actual) };
}
async function warning(tx: Transaction, resource: Resource, period: string, used: number, maximum: number, percent: number, ceiling: Ceiling, at: string) {
  if (used < Math.ceil(maximum * percent / 100)) return;
  const id = createHash('sha256').update(JSON.stringify([resource, period, maximum, percent, ceiling.contractReference])).digest('hex');
  if (await tx.get('usage_warnings', id)) return;
  const record = { id, resource, period, used, limit: maximum, warningPercent: percent, contractReference: ceiling.contractReference, createdAt: at };
  await tx.put('usage_warnings', record);
  await tx.audit('contractUsage.warning', resource, record);
}

/** Call only for a new record, inside the same serialized transaction as its creation. */
export async function reserveCreationQuota(tx: Transaction, resource: Resource, at: string) {
  const { ceiling, preferences } = await configuration(tx);
  const maximum = effectiveLimit(ceiling, preferences.limits, resource);
  if (!ceiling || maximum === undefined) return;
  if (ceiling.validFrom > at || ceiling.validUntil <= at) fail(409, 'CONTRACT_USAGE_APPROVAL_EXPIRED', `Contract ${ceiling.contractReference} does not currently authorize new ${kinds[resource]}. Existing receipt and evidence workflows remain available.`);
  const usage = await currentUsage(tx, resource, at);
  if (usage.used >= maximum) fail(429, 'CONTRACT_USAGE_LIMIT', `New ${kinds[resource]} limit reached for ${usage.period}: ${usage.used} used, ${maximum} permitted. Ask the workspace owner to review the contract allowance. Existing records remain available.`);
  const used = usage.used + 1;
  await tx.put('usage_counters', { ...usage, resource, used, updatedAt: at });
  await warning(tx, resource, usage.period, used, maximum, preferences.warningPercent, ceiling, at);
}

export class ContractUsageService {
  constructor(private readonly db: DatabasePort, private readonly now: () => Date = () => new Date()) {}
  async configure(ctx: Context, raw: unknown) {
    if (ctx.role !== 'owner') fail(403, 'FORBIDDEN', 'Only the workspace owner can configure usage limits');
    const input = selectedSchema.parse(raw);
    return this.db.transaction(ctx, async tx => {
      const { ceiling, selected } = await configuration(tx), at = this.now().toISOString();
      if (!ceiling) fail(409, 'CONTRACT_USAGE_NOT_CONFIGURED', 'An operator-approved contract allowance is required before setting workspace limits');
      if (ceiling!.validFrom > at || ceiling!.validUntil <= at) fail(409, 'CONTRACT_USAGE_APPROVAL_EXPIRED', 'A current operator-approved contract allowance is required');
      for (const resource of resources) {
        const chosen = input.limits[resource], maximum = ceiling!.limits[resource];
        if (chosen !== undefined && (maximum === undefined || chosen > maximum)) fail(403, 'CONTRACT_USAGE_CEILING', `The ${resource} limit cannot exceed or introduce an operator entitlement`);
      }
      const record = { id: 'usage_limits', ...input, contractReference: ceiling!.contractReference, updatedAt: at, updatedBy: ctx.userId };
      await tx.put('configuration', record);
      await tx.audit('contractUsage.configure', record.id, { before: selected ?? null, after: record });
      for (const resource of resources) {
        const maximum = effectiveLimit(ceiling, input.limits, resource);
        if (maximum === undefined) continue;
        const usage = await currentUsage(tx, resource, at);
        await tx.put('usage_counters', { ...usage, resource, updatedAt: at });
        await warning(tx, resource, usage.period, usage.used, maximum, input.warningPercent, ceiling!, at);
      }
      return this.snapshot(tx, at);
    });
  }
  async status(ctx: Context) {
    if (!['owner', 'auditor'].includes(ctx.role)) fail(403, 'FORBIDDEN', 'Only the workspace owner or auditor can review contract usage');
    return this.db.transaction(ctx, tx => this.snapshot(tx, this.now().toISOString()));
  }
  private async snapshot(tx: Transaction, at: string) {
    const { ceiling, preferences, selected } = await configuration(tx);
    const usage = [];
    for (const resource of resources) {
      const current = await currentUsage(tx, resource, at), maximum = effectiveLimit(ceiling, preferences.limits, resource);
      usage.push({ resource, period: current.period, used: current.used, limit: maximum ?? null, operatorCeiling: ceiling?.limits[resource] ?? null, remaining: maximum === undefined ? null : Math.max(0, maximum - current.used), warning: maximum !== undefined && current.used >= Math.ceil(maximum * preferences.warningPercent / 100) });
    }
    return { configured: !!ceiling, active: !!ceiling && ceiling.validFrom <= at && ceiling.validUntil > at, contractReference: ceiling?.contractReference ?? null, validFrom: ceiling?.validFrom ?? null, validUntil: ceiling?.validUntil ?? null, limits: preferences.limits, warningPercent: preferences.warningPercent, configuredBy: selected?.updatedBy ?? null, usage, warnings: await tx.find('usage_warnings', { limit: 100 }), evaluatedAt: at, subscriptionBilling: 'not_configured' };
  }
}
