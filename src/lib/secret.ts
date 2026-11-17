import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mailbox tokens are encrypted before they reach the database, with a key that
 * lives only in the server's environment (MAIL_TOKEN_KEY, 32 bytes, base64).
 * Generate one with: openssl rand -base64 32
 */
function key(): Buffer {
  const raw = process.env.MAIL_TOKEN_KEY;
  if (!raw) throw new Error('MAIL_TOKEN_KEY is not set, so mailbox tokens cannot be stored.');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('MAIL_TOKEN_KEY must be 32 bytes, base64 encoded.');
  return k;
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString('base64')).join('.');
}

export function open(sealed: string): string {
  const [iv, tag, body] = sealed.split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString('utf8');
}
