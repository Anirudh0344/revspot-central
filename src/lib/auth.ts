import 'server-only';
import { cookies } from 'next/headers';
import { pool, type Actor } from './db';
import { googleSignInEnabled, readSession, SESSION_COOKIE } from './session';

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
 *  - With Google configured: a signed session cookie set after Google sign-in,
 *    restricted to the company domain.
 *  - Without it, on a developer's machine only: pick a profile on /login.
 * In production with neither, nobody can sign in, by design.
 */
export async function currentProfile(): Promise<Profile | null> {
  const jar = await cookies();
  let userId: string | null = null;

  if (googleSignInEnabled()) userId = readSession(jar.get(SESSION_COOKIE)?.value);
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
