import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { currentProfile } from '@/lib/auth';
import { appUrl, authUrl, setupGaps, type Purpose } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

/** Starts Google sign-in for a mailbox: ?purpose=send (finance) or ?purpose=read (your own). */
export async function GET(req: NextRequest) {
  const me = await currentProfile();
  if (!me) return Response.redirect(`${appUrl()}/login`);

  const purpose: Purpose = req.nextUrl.searchParams.get('purpose') === 'send' ? 'send' : 'read';
  if (purpose === 'send' && me.role !== 'admin') {
    return Response.redirect(`${appUrl()}/settings?error=${encodeURIComponent('Only an admin can connect the sending mailbox.')}`);
  }
  const gaps = setupGaps();
  if (gaps.length) {
    return Response.redirect(`${appUrl()}/settings?error=${encodeURIComponent(`Set ${gaps.join(', ')} first.`)}`);
  }

  const state = randomBytes(16).toString('hex');
  (await cookies()).set('cc_google_oauth', `${state}.${purpose}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    path: '/api/google',
    maxAge: 600,
  });
  const hint = purpose === 'send' ? `finance@${process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai'}` : (me.email ?? undefined);
  return Response.redirect(authUrl(purpose, state, hint));
}
