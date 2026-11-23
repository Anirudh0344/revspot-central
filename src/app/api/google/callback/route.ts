import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { currentProfile } from '@/lib/auth';
import { appUrl, connectMailbox, signInWithCode, type Purpose } from '@/lib/gmail';
import { query } from '@/lib/db';
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

const to = (path: string, q: Record<string, string> = {}) =>
  Response.redirect(`${appUrl()}${path}${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ''}`);

/** One callback for Google sign-in and for connecting a mailbox; the state cookie says which. */
export async function GET(req: NextRequest) {
  const jar = await cookies();
  const saved = jar.get('cc_google_oauth')?.value ?? '';
  jar.delete({ name: 'cc_google_oauth', path: '/api/google' });

  const [state, purpose] = saved.split('.') as [string, Purpose | undefined];
  const p = req.nextUrl.searchParams;
  const back = purpose === 'signin' ? '/login' : '/settings';

  if (p.get('error')) return to(back, { error: `Google sign-in was not completed (${p.get('error')}).` });
  const code = p.get('code');
  if (!state || state !== p.get('state') || !code) {
    return to(back, { error: 'That sign-in link expired or did not start here. Try again.' });
  }

  if (purpose === 'signin') {
    try {
      const { email, name } = await signInWithCode(code);
      // A teammate's first sign-in creates a read-only profile; an admin raises it.
      let rows = await query<{ id: string; is_active: boolean }>(
        null, 'select id, is_active from profiles where lower(email) = $1', [email]);
      if (!rows[0]) {
        const [user] = await query<{ id: string }>(
          null,
          `insert into auth.users (email) values ($1)
           on conflict (email) do update set email = excluded.email returning id`,
          [email]);
        rows = await query<{ id: string; is_active: boolean }>(
          null,
          `insert into profiles (id, name, email, role) values ($1, $2, $3, 'viewer') returning id, is_active`,
          [user.id, name ?? email.split('@')[0], email]);
      }
      if (!rows[0].is_active) return to('/login', { error: 'This account has been switched off. Ask an admin.' });
      jar.set(SESSION_COOKIE, signSession(rows[0].id), {
        httpOnly: true,
        sameSite: 'lax',
        secure: appUrl().startsWith('https://'),
        path: '/',
        maxAge: SESSION_DAYS * 86400,
      });
      return to('/deals');
    } catch (e) {
      return to('/login', { error: (e as Error).message });
    }
  }

  const me = await currentProfile();
  if (!me) return to('/login');
  try {
    const email = await connectMailbox(code, purpose === 'send' ? 'send' : 'read', me.id);
    return to('/settings', { connected: email });
  } catch (e) {
    return to('/settings', { error: (e as Error).message });
  }
}
