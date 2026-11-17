import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { currentProfile } from '@/lib/auth';
import { appUrl, connectMailbox, type Purpose } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const back = (q: Record<string, string>) => Response.redirect(`${appUrl()}/settings?${new URLSearchParams(q)}`);

export async function GET(req: NextRequest) {
  const me = await currentProfile();
  if (!me) return Response.redirect(`${appUrl()}/login`);

  const jar = await cookies();
  const saved = jar.get('cc_google_oauth')?.value ?? '';
  jar.delete({ name: 'cc_google_oauth', path: '/api/google' });

  const p = req.nextUrl.searchParams;
  if (p.get('error')) return back({ error: `Google sign-in was not completed (${p.get('error')}).` });

  const [state, purpose] = saved.split('.');
  const code = p.get('code');
  if (!state || state !== p.get('state') || !code) {
    return back({ error: 'That sign-in link expired or did not start here. Try connecting again.' });
  }

  try {
    const email = await connectMailbox(code, purpose as Purpose, me.id);
    return back({ connected: email });
  } catch (e) {
    return back({ error: (e as Error).message });
  }
}
