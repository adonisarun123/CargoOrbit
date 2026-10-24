import { HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Context, Entity } from '@cargoorbit/database';
import { hashPayload } from '@cargoorbit/domain';
import { database, workflow } from './runtime.js';
import { readObject, sha256, sniffMime, storeObject } from './storage.js';

const uploadSchema = z.object({
  consignmentId: z.string().min(1).max(100),
  attemptId: z.string().min(1).max(100).optional(),
  clientOperationId: z.string().uuid(),
  documentType: z.enum(['photo', 'work_copy', 'goods_invoice', 'grn', 'other']).default('photo'),
  capturedAt: z.string().datetime({ offset: true }).optional(),
  captureMethod: z.enum(['camera', 'upload', 'android', 'import']).default('upload'),
  sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export async function uploadEvidence(actor: Context, file: Express.Multer.File | undefined, body: unknown) {
  if (!['owner', 'operations', 'driver', 'receiver', 'customer_admin'].includes(actor.role)) throw new HttpException('Evidence upload permission required', 403);
  const input = uploadSchema.parse(body);
  if (!file || !file.buffer.length) throw new HttpException('Attach one nonempty image or PDF', 400);
  if (file.buffer.length > 10 * 1024 * 1024 || file.size !== file.buffer.length) throw new HttpException('Invalid file size; maximum 10 MB', 413);
  const mime = sniffMime(file.buffer);
  if (!mime) throw new HttpException('Only JPEG, PNG, WebP or PDF evidence is supported', 415);
  const hash = sha256(file.buffer);
  if (input.sha256 && input.sha256 !== hash) throw new HttpException('Evidence checksum does not match captured bytes', 400);
  await workflow.query(actor, 'consignments', input.consignmentId);
  const operationId = `${actor.userId}:${input.clientOperationId}`;
  const id = createHash('sha256').update(`${actor.tenantId}:${operationId}`).digest('hex');
  const descriptorHash = hashPayload({ ...input, sha256: hash });
  const prior = await database.transaction(actor, tx => tx.get<Entity>('uploadOperations', operationId));
  if (prior) {
    if (prior.descriptorHash !== descriptorHash) throw new HttpException('Upload identifier was reused with different evidence or metadata', 409);
    return workflow.query(actor, 'evidence', String(prior.evidenceId));
  }
  // Immutable object versions can leave an unreferenced orphan after a crash; an inventory reconciliation handles these, never an overwrite.
  const stored = await storeObject(`${actor.tenantId}/originals/${id}`, file.buffer, mime);
  const evidence = await workflow.execute(actor, 'recordEvidence', {
    id, consignmentId: input.consignmentId, filename: file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'evidence',
    mimeType: mime, size: file.size, ...stored, captureMethod: input.captureMethod,
    capturedAt: input.capturedAt, documentType: input.documentType, attemptId: input.attemptId,
  });
  await database.transaction(actor, async tx => {
    const existing = await tx.get<Entity>('uploadOperations', operationId);
    if (existing && existing.descriptorHash !== descriptorHash) throw new HttpException('Concurrent upload metadata conflict', 409);
    if (!existing) await tx.put('uploadOperations', { id: operationId, evidenceId: id, sha256: hash, descriptorHash, consignmentId: input.consignmentId });
  });
  // The durable outbox worker owns scan transitions. Upload cannot self-assert a clean result.
  return evidence;
}

export async function evidenceDownload(actor: Context, id: string) {
  const evidence = await workflow.query(actor, 'evidence', id) as Record<string, unknown>;
  if (evidence.scanStatus !== 'clean') throw new HttpException('Evidence is unavailable until its scan is clean', 409);
  const bytes = await readObject(String(evidence.objectKey), String(evidence.objectVersion), String(evidence.sha256));
  await database.transaction(actor, tx => tx.audit('evidence.download', id, { sha256: evidence.sha256 }));
  return { bytes, mime: String(evidence.mimeType), filename: String(evidence.filename) };
}
export async function packetDownload(actor: Context, id: string, manifest = false) {
  await workflow.query(actor, 'pods', id);
  const packet = await database.transaction(actor, tx => tx.get<Entity>('packets', id));
  if (!packet) throw new HttpException('Evidence packet is pending worker processing', 409);
  await database.transaction(actor, tx => tx.audit('packet.download', id, { format: manifest ? 'manifest' : 'pdf' }));
  if (manifest) return { bytes: Buffer.from(JSON.stringify(packet.manifest, null, 2)), mime: 'application/json', filename: `POD-${id}.json` };
  return { bytes: await readObject(String(packet.objectKey), String(packet.objectVersion), String(packet.sha256)), mime: 'application/pdf', filename: `POD-${id}.pdf` };
}
