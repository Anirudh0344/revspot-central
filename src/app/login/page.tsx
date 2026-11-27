import { pool } from '@/lib/db';
import { devAuthEnabled } from '@/lib/auth';
import { devSignIn } from '@/lib/actions';
import { googleSignInEnabled } from '@/lib/session';
import { btnPrimary } from '@/components/forms';
import { withBase } from '@/lib/base-path';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  if (!devAuthEnabled()) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="text-[18px] font-semibold">Sign in to Revspot Central</h1>
        {googleSignInEnabled() ? (
          <>
            <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
              Use your @{process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai'} Google account.
            </p>
            <a className={`${btnPrimary} mt-6`} href={withBase('/auth/google')} data-testid="google-sign-in">
              Continue with Google
            </a>
          </>
        ) : (
          <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
            Sign-in is not set up on this server yet: it needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and
            SESSION_SECRET.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-[var(--red-soft)] px-3 py-2 text-[13px] text-[var(--red)]">{error}</p>
        )}
      </div>
    );
  }

  const { rows } = await pool.query<{ id: string; name: string; role: string; email: string }>(
    'select id, name, role, email from profiles where is_active order by role, name',
  );

  return (
    <div className="mx-auto max-w-md pt-12">
      <h1 className="text-[18px] font-semibold">Sign in</h1>
      <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
        Google sign-in is not set up, so on this machine you can pick who you are. This list disappears once
        Google is configured, and never appears in production.
      </p>
      <ul className="mt-6 space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <form action={devSignIn.bind(null, p.id)}>
              <button
                data-testid={`sign-in-${p.role}`}
                className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-left transition hover:border-[var(--line-strong)]"
              >
                <span>
                  <span className="block text-[13px] font-medium">{p.name}</span>
                  <span className="block text-[12px] text-[var(--ink-muted)]">{p.email}</span>
                </span>
                <span className="t-label">{p.role}</span>
              </button>
            </form>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-[13px] text-[var(--ink-muted)]">
            No profiles yet. Run <code>npm run db:seed</code> first.
          </li>
        )}
      </ul>
    </div>
  );
}
