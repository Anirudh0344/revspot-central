import { pool } from '@/lib/db';
import { devAuthEnabled } from '@/lib/auth';
import { devSignIn } from '@/lib/actions';
import { btnPrimary } from '@/components/forms';

export default async function LoginPage() {
  if (!devAuthEnabled()) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="text-[18px] font-semibold">Sign in</h1>
        <p className="mt-2 text-[13px] text-[var(--ink-muted)]">
          Use your @revspot.ai Google account.
        </p>
        <a
          className={`${btnPrimary} mt-6`}
          href="/auth/google"
          data-testid="google-sign-in"
        >
          Continue with Google
        </a>
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
        Google sign-in is wired for the Supabase project. Locally, pick who you are.
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
