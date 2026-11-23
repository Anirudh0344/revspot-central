'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { input } from './forms';

/** One row of filters; every change rewrites the URL so a view can be shared. */
export function AnalyticsFilters({
  periods,
  people,
  clients,
  values,
}: {
  periods: readonly { key: string; label: string }[];
  people: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  values: { period: string; owner?: string; client?: string; category?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const u = new URLSearchParams(sp.toString());
    if (v) u.set(k, v);
    else u.delete(k);
    router.push(`${pathname}?${u}`);
  };
  const sel = `${input} sm:w-auto sm:min-w-[9rem]`;
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="analytics-filters">
      <select aria-label="Period" className={sel} value={values.period} onChange={(e) => set('period', e.target.value)}>
        {periods.map((p) => (
          <option key={p.key} value={p.key}>
            {p.label}
          </option>
        ))}
      </select>
      <select aria-label="Category" className={sel} value={values.category ?? ''} onChange={(e) => set('category', e.target.value)}>
        <option value="">All categories</option>
        <option value="pilot">Pilot</option>
        <option value="retention">Retention</option>
        <option value="expansion">Expansion</option>
      </select>
      <select aria-label="Owner" className={sel} value={values.owner ?? ''} onChange={(e) => set('owner', e.target.value)}>
        <option value="">Everyone</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select aria-label="Client" className={sel} value={values.client ?? ''} onChange={(e) => set('client', e.target.value)}>
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
  Single-series vertical bars in the accent colour: no legend (the card title
  names the series), thin bars with 4px rounded tops on a baseline, a 2px gap,
  a recessive baseline, and a tooltip on hover or focus.
*/
export function BarChart({
  data,
  height = 140,
  highlightLast,
  ariaLabel,
}: {
  data: { label: string; value: number; display: string; sub?: string }[];
  height?: number;
  highlightLast?: boolean;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="relative" role="img" aria-label={ariaLabel}>
      <div className="flex items-end gap-[2px] border-b border-[var(--line)]" style={{ height }}>
        {data.map((d, i) => {
          const h = d.value > 0 ? Math.max(2, (d.value / max) * (height - 8)) : 0;
          const strong = hover === i || (hover === null && highlightLast && i === data.length - 1);
          return (
            <button
              key={d.label}
              type="button"
              className="group relative flex h-full flex-1 items-end justify-center outline-none"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${d.display}`}
            >
              <span
                className="block w-full max-w-[28px] rounded-t-[4px] transition-colors"
                style={{ height: h, background: strong ? 'var(--accent)' : 'var(--accent-200)' }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {data.map((d, i) => (
          <span
            key={d.label}
            className={`flex-1 text-center text-[11px] tabular-nums ${hover === i ? 'text-[var(--ink)]' : 'text-[var(--ink-faint)]'}`}
          >
            {d.label}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--paper)] px-2 py-1 text-[12px] shadow-[var(--lift)]"
          style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}
        >
          <span className="text-[var(--ink-muted)]">{data[hover].sub ?? data[hover].label}</span>{' '}
          <span className="font-medium tabular-nums text-[var(--ink)]">{data[hover].display}</span>
        </div>
      )}
    </div>
  );
}
