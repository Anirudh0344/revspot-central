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
      className="scroll-x inline-flex max-w-full overflow-x-auto rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunk)] p-0.5"
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
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] transition ${
              active
                ? 'bg-[var(--accent)] font-medium text-[var(--on-accent)] shadow-[var(--lift-accent)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--accent-100)] hover:text-[var(--accent-ink)]'
            }`}
          >
            {v.label}
            {counts[v.key] !== undefined && (
              <span
                className={`tabular-nums ${active ? 'text-[var(--on-accent)] opacity-60' : 'text-[var(--ink-faint)]'}`}
              >
                {counts[v.key]}
              </span>
            )}
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
  view: string;
};

export function Filters({
  people,
  clients,
  values,
}: {
  people: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  values: FilterValues;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(
    Boolean(values.health || values.intern || values.product || values.client),
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
    <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper-sunk)]">
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
          className="rounded-md px-2 py-1.5 text-[12px] font-medium text-[var(--ink-muted)] transition hover:bg-[var(--accent-100)] hover:text-[var(--accent-ink)]"
          aria-expanded={open}
        >
          Filters
          {active > 0 && (
            <span className="ml-1.5 rounded bg-[var(--accent-100)] px-1 text-[11px] tabular-nums text-[var(--accent-ink)]">
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
