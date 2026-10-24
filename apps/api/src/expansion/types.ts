import type { Context, Entity, Transaction } from '@cargoorbit/database';

export type Phase = 'P2' | 'P3' | 'P4';
export type ExpansionContext = Context;
export type RecordEntity = Entity & Record<string, unknown>;
export type ExpansionTransaction = Transaction;

export class ExpansionError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ExpansionError'; }
}

export function fail(status: number, code: string, message: string): never { throw new ExpansionError(status, code, message); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(400, 'INVALID_INPUT', 'A JSON object is required');
  return value as Record<string, unknown>;
}
export function text(input: Record<string, unknown>, key: string, optional = false): string {
  const value = input[key];
  if (optional && (value === undefined || value === null || value === '')) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) return fail(400, 'INVALID_INPUT', `${key} must be a nonempty string of at most 2000 characters`);
  return value.trim();
}
export function choice<T extends string>(input: Record<string, unknown>, key: string, values: readonly T[]): T {
  const value = text(input, key);
  if (!values.includes(value as T)) return fail(400, 'INVALID_INPUT', `${key} must be one of ${values.join(', ')}`);
  return value as T;
}
export function date(input: Record<string, unknown>, key: string, optional = false): string {
  const value = text(input, key, optional);
  if (!value && optional) return '';
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return fail(400, 'INVALID_INPUT', `${key} must be an ISO timestamp with timezone`);
  if (!/(Z|[+-]\d\d:\d\d)$/.test(value)) return fail(400, 'INVALID_INPUT', `${key} must include a timezone`);
  return new Date(value).toISOString();
}
export function number(input: Record<string, unknown>, key: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail(400, 'INVALID_INPUT', `${key} is outside its permitted range`);
  return value;
}
/** Fixed six-place decimal values; persisted as decimal strings and never binary floats. */
export function decimal(value: unknown, label = 'quantity'): bigint {
  if (typeof value !== 'string' || !/^\d{1,16}(\.\d{1,6})?$/.test(value)) return fail(400, 'INVALID_DECIMAL', `${label} must be a nonnegative decimal string with at most six decimal places`);
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function formatted(value: bigint): string {
  const sign = value < 0 ? '-' : ''; const n = value < 0 ? -value : value;
  return `${sign}${n / 1000000n}.${(n % 1000000n).toString().padStart(6, '0')}`;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(k => (value as Record<string, unknown>)[k] !== undefined).map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
