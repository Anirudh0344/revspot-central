import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, dealList, profiles } from '@/lib/queries';
import { inr, istDate, relativeDue } from '@/lib/format';
import { Badge, HealthDot, Owner } from '@/components/ui';
import { btnPrimary } from '@/components/forms';

export const dynamic = 'force-dynamic';

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const perPage = 50;

  const [all, people, clients] = await Promise.all([
    dealList(me, {
      category: sp.category,
      health: sp.health,
      intern: sp.intern,
      product: sp.product,
      client: sp.client,
      q: sp.q,
      includeTerminal: sp.closed === 'on',
    }),
    profiles(me),
    clientList(me),
  ]);

  const pages = Math.max(1, Math.ceil(all.length / perPage));
  const deals = all.slice((page - 1) * perPage, page * perPage);
  const qs = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set('page', String(p));
    return `/deals?${u}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          All deals <span className="text-neutral-400">{all.length}</span>
        </h1>
        <Link href="/deals/new" className={btnPrimary} data-testid="new-deal">
          New deal
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Text name="q" label="Search" value={sp.q} />
        <Select
          name="category"
          label="Category"
          value={sp.category}
          options={[
            ['pilot', 'Pilot'],
            ['retention', 'Retention'],
            ['expansion', 'Expansion'],
          ]}
        />
        <Select
          name="health"
          label="Health"
          value={sp.health}
          options={[
            ['red', 'Red'],
            ['amber', 'Amber'],
            ['green', 'Green'],
          ]}
        />
        <Select
          name="intern"
          label="Intern"
          value={sp.intern}
          options={people.filter((p) => p.role !== 'viewer').map((p) => [p.id, p.name])}
        />
        <Select
          name="client"
          label="Client"
          value={sp.client}
          options={clients.map((c) => [c.id, c.name] as [string, string])}
        />
        <Text name="product" label="Product" value={sp.product} />
        <label className="flex items-center gap-1.5 pb-1.5 text-xs">
          <input type="checkbox" name="closed" defaultChecked={sp.closed === 'on'} />
          Include closed
        </label>
        <button className={btnPrimary}>Apply</button>
        <Link href="/deals" className="pb-1.5 text-xs text-neutral-500 hover:underline">
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm" data-testid="deals-table">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-3 py-2 font-medium">Deal</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Health</th>
              <th className="px-3 py-2 font-medium">Next step</th>
              <th className="px-3 py-2 text-right font-medium">Monthly</th>
              <th className="px-3 py-2 font-medium">Owner</th>
              <th className="px-3 py-2 font-medium">Ends</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {deals.map((d) => (
              <tr key={d.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-3 py-2">
                  <Link href={`/deals/${d.id}`} className="font-medium hover:underline">
                    {d.title}
                  </Link>
                  <span className="ml-2 text-xs text-neutral-500">{d.client_name}</span>
                  {!d.criteria_complete && !d.stage_is_terminal && (
                    <span className="ml-2">
                      <Badge tone="amber">Criteria incomplete</Badge>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={d.stage_flag === 'red' ? 'red' : d.stage_flag === 'amber' ? 'amber' : 'neutral'}>
                    {d.stage_label}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  <HealthDot health={d.health} />
                </td>
                <td className="px-3 py-2">
                  <span className="block max-w-xs truncate text-xs">{d.next_step ?? '—'}</span>
                  <span
                    className={`text-xs ${d.next_step_overdue ? 'font-semibold text-rose-600' : 'text-neutral-400'}`}
                  >
                    {relativeDue(d.next_step_due)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(d.monthly_value, true)}</td>
                <td className="px-3 py-2">
                  <Owner name={d.intern_owner_name} />
                </td>
                <td className="px-3 py-2 text-xs text-neutral-500">{istDate(d.end_date)}</td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No deals match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AU-6: visible page numbers, no infinite scroll */}
      {pages > 1 && (
        <nav className="flex gap-1" data-testid="pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={qs(p)}
              className={`rounded-md border px-2.5 py-1 text-sm ${
                p === page
                  ? 'border-neutral-900 font-medium dark:border-white'
                  : 'border-neutral-200 text-neutral-500 dark:border-neutral-800'
              }`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

function Text({ name, label, value }: { name: string; label: string; value?: string }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        name={name}
        defaultValue={value ?? ''}
        data-testid={`filter-${name}`}
        className="mt-1 w-36 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      />
    </label>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        data-testid={`filter-${name}`}
        className="mt-1 w-36 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
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
