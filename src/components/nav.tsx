'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/deals', label: 'Deals' },
  { href: '/pilots', label: 'Pilots' },
  { href: '/clients', label: 'Clients' },
  { href: '/finance', label: 'Finance' },
  { href: '/playbooks', label: 'Playbooks' },
  { href: '/tasks', label: 'My work' },
  { href: '/bot', label: 'Bot queue' },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="scroll-x order-last -mx-1 flex w-full items-center gap-0.5 overflow-x-auto px-1 sm:order-none sm:mx-0 sm:w-auto sm:px-0">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(n.href + '/');
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1 text-[13px] transition ${
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
