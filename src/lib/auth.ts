import 'server-only';
import { cookies } from 'next/headers';
import { pool, type Actor } from './db';
import { readSession, SESSION_COOKIE, googleSignInEnabled } from './session';

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'intern' | 'viewer' | 'bot';
  is_active: boolean;
};

const DEV_COOKIE = 'cc_dev_profile';

/**
 * Who is signed in.
 *  - A signed session cookie, set after Google sign-in (restricted to the company
 *    domain) or, until Google is set up, after the shared ACCESS_CODE.
 *  - On a developer's machine only: pick a profile on /login (unsigned cookie).
 * In production with neither Google nor an access code, nobody can sign in, by design.
 */
export async function currentProfile(): Promise<Profile | null> {
  const jar = await cookies();
  let userId: string | null = null;

  // readSession only trusts a cookie this server signed (needs SESSION_SECRET).
  userId = readSession(jar.get(SESSION_COOKIE)?.value);
  if (!userId && devAuthEnabled()) userId = jar.get(DEV_COOKIE)?.value ?? null;

  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const { rows } = await pool.query<Profile>(
    'select id, name, email, role, is_active from profiles where id = $1',
    [userId],
  );
  const p = rows[0];
  return p && p.is_active ? p : null;
}

export async function requireProfile(): Promise<Profile> {
  const p = await currentProfile();
  if (!p) throw new Error('UNAUTHENTICATED');
  return p;
}

export function asActor(p: Profile | null): Actor {
  return p ? { id: p.id, role: p.role } : null;
}

export const DEV_PROFILE_COOKIE = DEV_COOKIE;

/** Picking a profile without a password: only off production, and only until Google is set up. */
export const devAuthEnabled = () =>
  process.env.NODE_ENV !== 'production' && !googleSignInEnabled();
