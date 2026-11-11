import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentProfile } from '@/lib/auth';
import { signOut } from '@/lib/actions';
import { CommandBar } from '@/components/command-bar';
import { Nav } from '@/components/nav';
import { Badge } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Revspot CS Command Center',
  description: 'Every client, deal, health and next step in one place.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentProfile();
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <header className="app-header sticky top-0 z-40 backdrop-blur">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
            <Link href="/deals" className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <span
                aria-hidden
                className="inline-block h-[18px] w-[18px] rounded-[5px] bg-[var(--blue)] shadow-[var(--lift-blue)]"
              />
              <span>
                Revspot{' '}
                <span className="font-normal text-[var(--ink-faint)]">Command Center</span>
              </span>
            </Link>
            {me && <Nav />}
            <div className="ml-auto flex items-center gap-3">
              <kbd className="hidden rounded border border-[var(--line-blue)] bg-[var(--blue-50)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--blue-ink)] sm:inline">
                ⌘K
              </kbd>
              {me && (
                <>
                  <span className="text-[13px]" data-testid="current-user">
                    {me.name}
                  </span>
                  <Badge tone={me.role === 'intern' ? 'neutral' : 'brand'}>{me.role}</Badge>
                  <form action={signOut}>
                    <button className="text-[12px] text-[var(--ink-faint)] underline-offset-2 transition hover:text-[var(--blue-ink)] hover:underline">
                      Sign out
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1320px] px-5 py-7">{children}</main>
        {me && <CommandBar />}
      </body>
    </html>
  );
}
