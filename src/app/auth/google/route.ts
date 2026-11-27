import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { appUrl, authUrl } from '@/lib/gmail';
import { googleSignInEnabled } from '@/lib/session';
import { withBase } from '@/lib/base-path';

export const dynamic = 'force-dynamic';

/** Starts Google sign-in. Shares the mailbox callback, so Google needs one redirect address. */
export async function GET() {
  if (!googleSignInEnabled()) return Response.redirect(`${appUrl()}/login`);
  const state = randomBytes(16).toString('hex');
  (await cookies()).set('cc_google_oauth', `${state}.signin`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    // Scoped to the callback's real URL, prefix included (/p/{slug}/api/google on Marketplace),
    // or the browser never sends it back.
    path: withBase('/api/google'),
    maxAge: 600,
  });
  return Response.redirect(authUrl('signin', state));
}
