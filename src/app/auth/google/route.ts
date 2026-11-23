import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { appUrl, authUrl } from '@/lib/gmail';
import { googleSignInEnabled } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** Starts Google sign-in. Shares the mailbox callback, so Google needs one redirect address. */
export async function GET() {
  if (!googleSignInEnabled()) return Response.redirect(`${appUrl()}/login`);
  const state = randomBytes(16).toString('hex');
  (await cookies()).set('cc_google_oauth', `${state}.signin`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    path: '/api/google',
    maxAge: 600,
  });
  return Response.redirect(authUrl('signin', state));
}
