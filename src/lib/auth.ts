import 'server-only';
import { cookies } from 'next/headers';
import { pool, type Actor } from './db';

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'intern' | 'viewer' | 'bot';
  is_active: boolean;
};

const DEV_COOKIE = 'cc_dev_profile';

/**
 * In production the signed-in user comes from the Supabase session cookie
 * (Google sign-in, restricted to @revspot.ai). Without a Supabase project
 * configured, the app falls back to picking a profile directly, so the whole
 * thing is usable against a local database.
 */
export async function currentProfile(): Promise<Profile | null> {
  const jar = await cookies();
  let userId: string | null = null;

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const { createServerClient } = await import('@supabase/ssr');
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => jar.getAll(),
          setAll: () => {},
        },
      },
    );
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email ?? '';
    const domain = process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai';
    if (data.user && email.endsWith('@' + domain)) userId = data.user.id;
  } else {
    userId = jar.get(DEV_COOKIE)?.value ?? null;
  }

  if (!userId) return null;
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
export const devAuthEnabled = () => !process.env.NEXT_PUBLIC_SUPABASE_URL;
