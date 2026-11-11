import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { currentProfile } from '@/lib/auth';
import { signOut } from '@/lib/actions';
import { CommandBar } from '@/components/command-bar';
import { Badge } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Revspot CS Command Center',
  description: 'Every client, deal, health and next step in one place.',
};

const NAV = [
  { href: '/deals', label: 'Deals' },
  { href: '/clients', label: 'Clients' },
  { href: '/tasks', label: 'My work' },
  { href: '/bot', label: 'Bot queue' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentProfile();
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--paper)] text-[var(--ink)]">
        <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
            <Link href="/deals" className="text-[13px] font-semibold tracking-tight">
              Revspot <span className="font-normal text-[var(--ink-faint)]">Command Center</span>
            </Link>
            {me && (
              <nav className="flex flex-wrap items-center gap-0.5">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className="rounded-md px-2.5 py-1 text-[13px] text-[var(--ink-muted)] transition hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3">
              <kbd className="hidden rounded border border-[var(--line)] bg-[var(--paper-sunk)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-faint)] sm:inline">
                ⌘K
              </kbd>
              {me && (
                <>
                  <span className="text-[13px]" data-testid="current-user">
                    {me.name}
                  </span>
                  <Badge tone={me.role === 'admin' ? 'brand' : me.role === 'bot' ? 'brand' : 'neutral'}>
                    {me.role}
                  </Badge>
                  <form action={signOut}>
                    <button className="text-[12px] text-[var(--ink-faint)] underline-offset-2 transition hover:text-[var(--ink)] hover:underline">
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
