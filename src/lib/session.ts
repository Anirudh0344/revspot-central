import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/*
  The signed-in session: a cookie holding the profile id and an expiry, signed
  with SESSION_SECRET (HMAC-SHA256). Nothing secret is inside it; the signature
  only proves the server issued it.
*/

export const SESSION_COOKIE = 'cc_session';
export const SESSION_DAYS = 30;

function secret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set to at least 32 characters.');
  return Buffer.from(s);
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signSession(profileId: string): string {
  const body = b64(JSON.stringify({ sub: profileId, exp: Date.now() + SESSION_DAYS * 86400_000 }));
  const sig = b64(createHmac('sha256', secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function readSession(token: string | undefined): string | null {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(body, 'base64url').toString()) as { sub: string; exp: number };
    return exp > Date.now() ? sub : null;
  } catch {
    return null;
  }
}

/** Google sign-in is on once the OAuth client and a session secret exist. */
export const googleSignInEnabled = () =>
  Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SESSION_SECRET);
