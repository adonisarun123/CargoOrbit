import { z } from 'zod';
export const id=z.string().trim().min(1).max(160);
export const text=z.string().trim().min(1).max(2000);
export const decimal=z.string().regex(/^\d{1,15}(\.\d{1,6})?$/,'Use a nonnegative decimal string with up to six decimal places');
export const money=z.string().regex(/^\d{1,15}(\.\d{1,2})?$/,'Use a nonnegative currency amount with up to two decimal places');
const date=z.string().datetime({offset:true});
const receipt=z.object({lineId:id,accepted:decimal,damaged:decimal,rejected:decimal,short:decimal}).strict();
const line=z.object({id:id.optional(),description:text,sku:text.optional(),quantity:decimal,unit:z.string().trim().min(1).max(30),packages:decimal.optional(),weight:decimal.optional()}).strict();
export const schemas:Record<string,z.ZodTypeAny>={
createOrganization:z.object({id:id.optional(),name:text,roles:z.array(z.enum(['transporter','consignor','consignee','payer','partner'])).min(1),address:text.optional(),gstin:z.string().max(30).optional(),active:z.boolean().default(true)}).strict(),
createFacility:z.object({id:id.optional(),organizationId:id,name:text,address:text,city:text,state:text,pinCode:z.string().regex(/^\d{6}$/),timeZone:z.string().default('Asia/Kolkata')}).strict(),
createPolicy:z.object({id:id.optional(),organizationId:id,requiresGrn:z.boolean().default(false),requiresNoExceptions:z.boolean().default(false),requiredDocuments:z.array(z.enum(['photo','work_copy','goods_invoice','grn','other'])).default([]),requiresOriginalPaper:z.boolean().default(false),paymentTrigger:z.enum(['delivery','grn','submission','acceptance']).default('acceptance'),paymentDays:z.number().int().min(0).max(365).default(60),declaration:text.optional(),privacyNoticeVersion:text.default('1'),effectiveAt:date.optional()}).strict(),
grantReceiver:z.object({id:id.optional(),userId:id,organizationId:id,facilityId:id,contact:z.string().trim().min(6).max(200),receiverName:text,validFrom:date.optional(),validUntil:date,consignmentId:id.optional()}).strict(),
revokeGrant:z.object({grantId:id,reason:text}).strict(),
createConsignment:z.object({id:id.optional(),lrNumber:z.string().trim().min(1).max(100),branch:z.string().trim().min(1).max(50).default('BLR'),financialYear:z.string().regex(/^\d{4}-\d{2}$/).default('2026-27'),consignorId:id,consigneeId:id,payerId:id,originId:id,destinationId:id,policyId:id.optional(),lines:z.array(line).min(1).max(500),goodsValue:money.default('0'),freightAmount:money,currency:z.literal('INR').default('INR'),invoiceReferences:z.array(text).default([]),ewayBills:z.array(z.object({number:z.string().regex(/^\d{12}$/),source:z.enum(['manual','official']).default('manual'),validUntil:date.optional(),verifiedAt:date.optional(),provenance:text.optional()}).strict()).default([])}).strict(),
createTrip:z.object({id:id.optional(),vehicleNumber:text,driverId:id,partnerId:id.optional(),originId:id.optional(),plannedRoute:text.optional(),plannedArrival:date.optional(),stops:z.array(z.object({id:id.optional(),facilityId:id,allocations:z.array(z.object({consignmentId:id,lines:z.array(z.object({lineId:id,quantity:decimal}).strict()).min(1)}).strict()).min(1)}).strict()).min(1).max(100)}).strict(),
recordEvent:z.object({consignmentId:id,attemptId:id.optional(),type:z.enum(['dispatched','arrived','unloading_started','unloading_completed','refused','return_required','cancelled','delay']),occurredAt:date,clientEventId:id,source:z.enum(['android','web','import']).default('web'),notes:text.optional(),location:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).optional(),remainingDistance:decimal.optional()}).strict(),
saveDraft:z.object({consignmentId:id,attemptId:id.optional(),podId:id.optional(),expectedVersion:z.number().int().min(0).default(0),clientEventId:id,lines:z.array(receipt).min(1).max(500),exceptions:z.array(z.object({reason:text,notes:text.optional()}).strict()).default([]),evidenceIds:z.array(id).default([]),refused:z.boolean().default(false)}).strict(),
issueChallenge:z.object({podId:id}).strict(),
acceptPod:z.object({podId:id,challengeId:id,code:z.string().regex(/^\d{6}$/),consent:z.literal(true),idempotencyKey:id}).strict(),
correctPod:z.object({podId:id,reason:text}).strict(),
recordEvidence:z.object({id:id.optional(),consignmentId:id,filename:z.string().min(1).max(255),mimeType:z.enum(['image/jpeg','image/png','application/pdf','image/webp']),size:z.number().int().positive().max(20*1024*1024),sha256:z.string().regex(/^[a-f0-9]{64}$/),objectKey:id,objectVersion:id,captureMethod:z.enum(['camera','upload','android','import']),capturedAt:date.optional(),documentType:z.enum(['photo','work_copy','goods_invoice','grn','other']).default('photo')}).strict(),
markEvidenceScanned:z.object({evidenceId:id,status:z.enum(['clean','quarantined','failed']),scannerReference:text}).strict(),
evaluateBilling:z.object({consignmentId:id}).strict(),
recordGrn:z.object({consignmentId:id,reference:text,originalPaperReceived:z.boolean().default(false)}).strict(),
createInvoice:z.object({id:id.optional(),number:text,payerId:id,consignmentIds:z.array(id).min(1).max(500),amount:money,currency:z.literal('INR').default('INR'),issueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),status:z.enum(['draft','issued']).default('issued'),accountingSource:text,taxTreatmentReference:text,paymentTrigger:z.enum(['delivery','grn','submission','acceptance']).optional(),paymentDays:z.number().int().min(0).max(365).optional()}).strict(),
submitInvoice:z.object({invoiceId:id,channel:text,reference:text,submittedAt:date.optional(),idempotencyKey:id}).strict(),
respondInvoice:z.object({invoiceId:id,status:z.enum(['acknowledged','accepted','rejected']),reference:text,reason:text.optional()}).strict(),
allocateReceipt:z.object({reference:text,receivedAt:date.optional(),idempotencyKey:id,allocations:z.array(z.object({invoiceId:id,kind:z.enum(['cash','withholding','credit','retention','disputed']),amount:money,verified:z.boolean().default(false),reason:text.optional()}).strict()).min(1).max(500)}).strict(),
createDispute:z.object({invoiceId:id,amount:money,reason:text,customerReference:text,owner:id,nextAction:text,podId:id.optional(),lineIds:z.array(id).default([])}).strict(),
createComplianceTask:z.object({consignmentId:id,reason:text,owner:id,location:text.optional(),remainingDistance:decimal.optional()}).strict(),
resolveComplianceTask:z.object({taskId:id,reference:text,outcome:z.enum(['recorded','officially_confirmed','failed']),officialValidUntil:date.optional(),source:text.optional()}).strict(),
importPreview:z.object({batchId:id,rows:z.array(z.unknown()).min(1).max(1000)}).strict(),
importCommit:z.object({batchId:id,previewHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
};
