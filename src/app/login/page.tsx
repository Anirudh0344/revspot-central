import { pool } from '@/lib/db';
import { devAuthEnabled } from '@/lib/auth';
import { devSignIn } from '@/lib/actions';
import { btnPrimary } from '@/components/forms';

export default async function LoginPage() {
  if (!devAuthEnabled()) {
    return (
      <div className="mx-auto max-w-md pt-16 text-center">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-500">
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
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Google sign-in is wired for the Supabase project. Locally, pick who you are.
      </p>
      <ul className="mt-6 space-y-2">
        {rows.map((p) => (
          <li key={p.id}>
            <form action={devSignIn.bind(null, p.id)}>
              <button
                data-testid={`sign-in-${p.role}`}
                className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition hover:border-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span>
                  <span className="block text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-neutral-500">{p.email}</span>
                </span>
                <span className="text-xs uppercase tracking-wide text-neutral-400">{p.role}</span>
              </button>
            </form>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-sm text-neutral-500">
            No profiles yet. Run <code>npm run db:seed</code> first.
          </li>
        )}
      </ul>
    </div>
  );
}
