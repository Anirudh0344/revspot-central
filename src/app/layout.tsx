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
  { href: '/', label: 'Home' },
  { href: '/boards/pilot', label: 'Pilots' },
  { href: '/boards/retention', label: 'Retention' },
  { href: '/boards/expansion', label: 'Expansion' },
  { href: '/clients', label: 'Clients' },
  { href: '/deals', label: 'All deals' },
  { href: '/tasks', label: 'My work' },
  { href: '/bot', label: 'Bot queue' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentProfile();
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <header className="sticky top-0 z-40 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-neutral-800 dark:bg-neutral-900/90">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Revspot <span className="text-neutral-400">CS Command Center</span>
            </Link>
            {me && (
              <nav className="flex flex-wrap items-center gap-1">
                {NAV.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
                    className="rounded-md px-2.5 py-1 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  >
                    {n.label}
                  </Link>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-neutral-400 sm:inline">⌘K</span>
              {me && (
                <>
                  <span className="text-sm" data-testid="current-user">
                    {me.name}
                  </span>
                  <Badge tone={me.role === 'admin' ? 'violet' : me.role === 'bot' ? 'blue' : 'neutral'}>
                    {me.role}
                  </Badge>
                  <form action={signOut}>
                    <button className="text-xs text-neutral-500 underline-offset-2 hover:underline">
                      Sign out
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>
        {me && <CommandBar />}
      </body>
    </html>
  );
}
