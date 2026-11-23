import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentProfile } from '@/lib/auth';
import { signOut } from '@/lib/actions';
import { CommandBar } from '@/components/command-bar';
import { Nav } from '@/components/nav';
import { Badge } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Revspot Central',
  description: 'Every client, deal, health and next step in one place.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentProfile();
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <header className="app-header sticky top-0 z-40 backdrop-blur">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 sm:px-5">
            <Link href="/deals" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <span
                aria-hidden
                className="inline-block h-[18px] w-[18px] rounded-[5px] bg-[var(--accent)] shadow-[var(--lift-accent)]"
              />
              <span>
                Revspot{' '}
                <span className="font-normal text-[var(--ink-faint)]">Central</span>
              </span>
            </Link>
            {me && <Nav />}
            <div className="ml-auto flex items-center gap-3">
              <kbd className="hidden rounded border border-[var(--line)] bg-[var(--paper-sunk)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--ink-faint)] sm:inline">
                ⌘K
              </kbd>
              {me && (
                <>
                  <span className="hidden text-[13px] sm:inline" data-testid="current-user">
                    {me.name}
                  </span>
                  <span className="hidden sm:inline-flex">
                    <Badge tone={me.role === 'intern' ? 'neutral' : 'brand'}>{me.role}</Badge>
                  </span>
                  <Link
                    href="/settings"
                    className="text-[12px] text-[var(--ink-faint)] underline-offset-2 transition hover:text-[var(--accent-ink)] hover:underline"
                  >
                    Settings
                  </Link>
                  <form action={signOut}>
                    <button className="text-[12px] text-[var(--ink-faint)] underline-offset-2 transition hover:text-[var(--accent-ink)] hover:underline">
                      Sign out
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1320px] px-4 py-5 sm:px-5 sm:py-7">{children}</main>
        {me && <CommandBar />}
      </body>
    </html>
  );
}
