import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
dotenv({ path: resolve(process.cwd(), '.env'), quiet: true });
dotenv({ path: resolve(process.cwd(), '../../.env'), quiet: true });
export const production = process.env.NODE_ENV === 'production';
function secret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters; set it in the environment`);
  return value;
}
export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: secret('JWT_SECRET'),
  otpSecret: secret('OTP_SECRET'),
  origin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  evidenceRoot: resolve(process.env.EVIDENCE_ROOT || '../../var/evidence'),
  storage: process.env.EVIDENCE_STORAGE || 'local',
  bucket: process.env.S3_BUCKET || '',
  region: process.env.AWS_REGION || 'ap-south-1',
  smsUrl: process.env.SMS_WEBHOOK_URL,
  smsToken: process.env.SMS_WEBHOOK_TOKEN,
  scannerHost: process.env.CLAMAV_HOST || '127.0.0.1',
  scannerPort: Number(process.env.CLAMAV_PORT || 3310),
  scanner: process.env.MALWARE_SCANNER || 'clamav',
};
if (production && (config.origin === '*' || !config.origin.startsWith('https://'))) throw new Error('Production WEB_ORIGIN must be an explicit HTTPS origin');
if (production && config.storage !== 's3') throw new Error('Production requires private versioned S3 evidence storage');
if (production && (!config.bucket || config.scanner !== 'clamav' || !config.smsUrl || !config.smsToken)) throw new Error('Production requires S3_BUCKET, CLAMAV scanner and SMS provider configuration');
if (config.smsUrl && !config.smsUrl.startsWith('https://') && production) throw new Error('Production SMS provider must use HTTPS');
