'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/deals', label: 'Deals' },
  { href: '/clients', label: 'Clients' },
  { href: '/tasks', label: 'My work' },
  { href: '/bot', label: 'Bot queue' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-0.5">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + '/');
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`rounded-md px-2.5 py-1 text-[13px] transition ${
              active
                ? 'bg-[var(--accent-100)] font-medium text-[var(--accent-deep)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--accent-50)] hover:text-[var(--accent-ink)]'
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
