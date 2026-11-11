import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, profiles } from '@/lib/queries';
import { inr, istDate } from '@/lib/format';
import { Badge, HealthDot, Owner } from '@/components/ui';
import { btnPrimary } from '@/components/forms';

export const dynamic = 'force-dynamic';

const STATUSES = ['Pilot', 'Active', 'Paused', 'Churned', 'Prospect'];

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const [clients, people] = await Promise.all([
    clientList(me, {
      status: sp.status,
      health: sp.health,
      intern: sp.intern,
      segment: sp.segment,
      q: sp.q,
    }),
    profiles(me),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          Clients <span className="text-neutral-400">{clients.length}</span>
        </h1>
        <Link href="/clients/new" className={btnPrimary} data-testid="new-client">
          New client
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Filter name="q" label="Search" defaultValue={sp.q} type="text" />
        <Select name="status" label="Status" value={sp.status} options={STATUSES.map((s) => [s, s])} />
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
        <Filter name="segment" label="Segment" defaultValue={sp.segment} type="text" />
        <button className={btnPrimary} data-testid="apply-filters">
          Apply
        </button>
        <Link href="/clients" className="pb-1.5 text-xs text-neutral-500 hover:underline">
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm" data-testid="clients-table">
          <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800">
            <tr>
              <th className="px-4 py-2 font-medium">Client</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Health</th>
              <th className="px-4 py-2 font-medium">Open deals</th>
              <th className="px-4 py-2 text-right font-medium">Monthly</th>
              <th className="px-4 py-2 font-medium">Owner</th>
              <th className="px-4 py-2 font-medium">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {clients.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                <td className="px-4 py-2">
                  <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.single_threaded && (
                    <span className="ml-2">
                      <Badge tone="amber" testId={`single-threaded-${c.id}`}>
                        Single-threaded
                      </Badge>
                    </span>
                  )}
                  {c.city && <span className="ml-2 text-xs text-neutral-400">{c.city}</span>}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    tone={
                      c.status === 'Active' ? 'green' : c.status === 'Churned' ? 'red' : 'neutral'
                    }
                  >
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <HealthDot health={c.health} />
                </td>
                <td className="px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {[
                    Number(c.open_pilots) ? `${c.open_pilots} pilot` : null,
                    Number(c.open_retention) ? `${c.open_retention} retention` : null,
                    Number(c.open_expansion) ? `${c.open_expansion} expansion` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{inr(c.monthly_value, true)}</td>
                <td className="px-4 py-2">
                  <Owner name={c.intern_owner_name} />
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500">
                  {istDate(c.last_interaction_at)}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-neutral-500">
                  No clients match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Filter({
  name,
  label,
  defaultValue,
  type,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
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
