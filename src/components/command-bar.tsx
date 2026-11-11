'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchAction } from '@/lib/actions';
import { input } from './forms';

type Hit = { href: string; label: string; sub: string; kind: string };

const ACTIONS: Hit[] = [
  { href: '/deals', label: 'All deals', sub: 'The whole pipeline', kind: 'Go' },
  { href: '/deals?view=pilot', label: 'Pilot view', sub: 'Pipeline board', kind: 'Go' },
  { href: '/deals?view=retention', label: 'Retention view', sub: 'Pipeline board', kind: 'Go' },
  { href: '/deals?view=expansion', label: 'Expansion view', sub: 'Pipeline board', kind: 'Go' },
  { href: '/clients', label: 'Clients', sub: 'All clients', kind: 'Go' },
  { href: '/tasks', label: 'My work', sub: 'Tasks by due date', kind: 'Go' },
  { href: '/bot', label: 'Bot work queue', sub: 'What needs doing', kind: 'Go' },
  { href: '/bot/digest', label: 'Bot digest', sub: "Today's bot changes", kind: 'Go' },
  { href: '/handover', label: 'New pilot handover', sub: 'Sales handover form', kind: 'Do' },
  { href: '/deals/new', label: 'New deal', sub: 'Create a deal', kind: 'Do' },
  { href: '/clients/new', label: 'New client', sub: 'Create a client', kind: 'Do' },
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState<{ term: string; hits: Hit[] }>({ term: '', hits: [] });
  const [active, setActive] = useState(0);
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => ref.current?.focus(), 10);
  }, [open]);

  const term = q.trim();

  useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    (async () => {
      const res = await searchAction(term);
      if (cancelled) return;
      setRemote({
        term,
        hits: [
          ...res.deals.map((d) => ({
            href: `/deals/${d.id}`,
            label: d.title,
            sub: `${d.client_name}${d.code ? ' · ' + d.code : ''}`,
            kind: 'Deal',
          })),
          ...res.clients.map((c) => ({
            href: `/clients/${c.id}`,
            label: c.name,
            sub: 'Client',
            kind: 'Client',
          })),
        ],
      });
      setActive(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [term]);

  // Derived during render: no cascading state for something this cheap.
  const local = term
    ? ACTIONS.filter((a) => a.label.toLowerCase().includes(term.toLowerCase()))
    : ACTIONS;
  const hits = term.length < 2 ? ACTIONS : [...(remote.term === term ? remote.hits : []), ...local];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(15,23,42,0.28)] p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
      data-testid="command-bar"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] shadow-[0_16px_48px_rgba(15,23,42,0.16)]"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={ref}
          data-testid="command-bar-input"
          className={`${input} rounded-none border-0 border-b border-[var(--line)] px-4 py-3 text-[15px] focus:border-[var(--line)]`}
          placeholder="Jump to a client or deal, or run an action…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
            if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            if (e.key === 'Enter' && hits[active]) {
              setOpen(false);
              router.push(hits[active].href);
            }
          }}
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {hits.slice(0, 20).map((h, i) => (
            <li key={h.href + h.label}>
              <button
                className={`flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] transition ${
                  i === active ? 'bg-[var(--blue-50)] text-[var(--blue-deep)]' : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  setOpen(false);
                  router.push(h.href);
                }}
              >
                <span className="w-12 shrink-0 text-[10px] uppercase tracking-[0.06em] text-[var(--blue-ink)]">
                  {h.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">{h.label}</span>
                <span className="truncate text-[11px] text-[var(--ink-faint)]">{h.sub}</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-4 py-3 text-[13px] text-[var(--ink-faint)]">No matches.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
