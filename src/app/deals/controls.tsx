'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { btn, input, label } from '@/components/forms';

/** The three category views, plus everything, as one segmented control. */
export function ViewTabs({
  views,
  current,
  counts,
}: {
  views: readonly { key: string; label: string }[];
  current: string;
  counts: Record<string, number>;
}) {
  const sp = useSearchParams();

  const hrefFor = (key: string) => {
    const u = new URLSearchParams(sp.toString());
    u.delete('page');
    if (key === 'all') u.delete('view');
    else u.set('view', key);
    const q = u.toString();
    return q ? `/deals?${q}` : '/deals';
  };

  return (
    <div
      className="inline-flex rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunk)] p-0.5"
      data-testid="view-tabs"
      role="tablist"
    >
      {views.map((v) => {
        const active = v.key === current;
        return (
          <Link
            key={v.key}
            href={hrefFor(v.key)}
            role="tab"
            aria-selected={active}
            data-testid={`view-${v.key}`}
            className={`inline-flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[13px] transition ${
              active
                ? 'bg-[var(--paper)] font-medium text-[var(--ink)] shadow-[0_1px_2px_rgba(15,23,42,0.06)]'
                : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {v.label}
            <span
              className={`tabular-nums ${active ? 'text-[var(--ink-faint)]' : 'text-[var(--ink-faint)]'}`}
            >
              {counts[v.key] ?? 0}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

type FilterValues = {
  health?: string;
  intern?: string;
  product?: string;
  client?: string;
  q?: string;
  closed?: string;
  view: string;
};

export function Filters({
  people,
  clients,
  values,
  showClosed,
}: {
  people: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  values: FilterValues;
  showClosed: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(
    Boolean(values.health || values.intern || values.product || values.client || values.closed),
  );

  const active = [values.q, values.health, values.intern, values.product, values.client].filter(
    Boolean,
  ).length;

  function submit(form: FormData) {
    const u = new URLSearchParams();
    if (values.view !== 'all') u.set('view', values.view);
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string' && v.trim()) u.set(k, v.trim());
    }
    router.push(u.toString() ? `${pathname}?${u}` : pathname);
  }

  return (
    <div className="rounded-[var(--radius)] border border-[var(--line)]">
      <form action={submit} className="flex flex-wrap items-center gap-2 p-2">
        <div className="w-72">
          <input
            name="q"
            defaultValue={values.q ?? ''}
            placeholder="Search deals, clients, codes…"
            data-testid="filter-q"
            className={input}
          />
        </div>
        <button className={btn} data-testid="apply-filters">
          Search
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          data-testid="toggle-filters"
          className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] transition hover:bg-[var(--paper-sunk)] hover:text-[var(--ink)]"
          aria-expanded={open}
        >
          Filters
          {active > 0 && (
            <span className="ml-1.5 rounded bg-[var(--blue-soft)] px-1 text-[11px] tabular-nums text-[var(--blue-ink)]">
              {active}
            </span>
          )}
        </button>
        {active > 0 && (
          <Link
            href={values.view === 'all' ? '/deals' : `/deals?view=${values.view}`}
            className="text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
          >
            Clear
          </Link>
        )}

        {open && (
          <div className="flex w-full flex-wrap items-end gap-3 border-t border-[var(--line)] px-1 pb-1 pt-3">
            <Select
              name="health"
              text="Health"
              value={values.health}
              options={[
                ['red', 'Red'],
                ['amber', 'Amber'],
                ['green', 'Green'],
              ]}
            />
            <Select
              name="intern"
              text="Owner"
              value={values.intern}
              options={people.map((p) => [p.id, p.name] as [string, string])}
            />
            <Select
              name="client"
              text="Client"
              value={values.client}
              options={clients.map((c) => [c.id, c.name] as [string, string])}
            />
            <label className="block w-40">
              <span className={label}>Product</span>
              <input
                name="product"
                defaultValue={values.product ?? ''}
                data-testid="filter-product"
                className={`${input} mt-1`}
              />
            </label>
            {showClosed && (
              <label className="flex items-center gap-1.5 pb-2 text-[12px] text-[var(--ink-muted)]">
                <input type="checkbox" name="closed" defaultChecked={values.closed === 'on'} />
                Include closed
              </label>
            )}
            <button className={btn}>Apply</button>
          </div>
        )}
      </form>
    </div>
  );
}

function Select({
  name,
  text,
  value,
  options,
}: {
  name: string;
  text: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="block w-40">
      <span className={label}>{text}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        data-testid={`filter-${name}`}
        className={`${input} mt-1`}
      >
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
