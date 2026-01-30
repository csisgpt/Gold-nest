import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const DEFAULT_DESTINATION_KEY = 'dev-only-destination-key';

function resolveKey(): Buffer {
  const raw = process.env.DESTINATION_ENCRYPTION_KEY || DEFAULT_DESTINATION_KEY;
  return createHash('sha256').update(raw).digest();
}

export function normalizeDestinationValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function hashDestinationValue(normalizedValue: string): string {
  return createHash('sha256').update(normalizedValue).digest('hex');
}

export function maskDestinationValue(normalizedValue: string): string {
  const trimmed = normalizedValue.trim();
  if (!trimmed) return '****';
  const last4 = trimmed.slice(-4);
  return `****${last4}`;
}

export function maskOwnerName(ownerName?: string | null): string | null {
  if (!ownerName) return null;
  const trimmed = ownerName.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}***${trimmed.slice(-1)}`;
}

export function encryptDestinationValue(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`;
}

export function decryptDestinationValue(ciphertext: string): string {
  const key = resolveKey();
  const [ivB64, tagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted destination format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
