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
        <h1 className="text-[18px] font-semibold">
          Clients <span className="text-[var(--ink-faint)]">{clients.length}</span>
        </h1>
        <Link href="/clients/new" className={btnPrimary} data-testid="new-client">
          New client
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-3">
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
        <Link href="/clients" className="pb-1.5 text-[12px] text-[var(--ink-muted)] hover:underline">
          Clear
        </Link>
      </form>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--paper)]">
        <table className="w-full text-[13px]" data-testid="clients-table">
          <thead className="border-b border-[var(--line)] bg-[var(--paper-tint)] text-left">
            <tr>
              <th className="t-label px-4 py-2">Client</th>
              <th className="t-label px-4 py-2">Status</th>
              <th className="t-label px-4 py-2">Health</th>
              <th className="t-label px-4 py-2">Open deals</th>
              <th className="t-label px-4 py-2 text-right">Monthly</th>
              <th className="t-label px-4 py-2">Owner</th>
              <th className="t-label px-4 py-2">Last contact</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {clients.map((c) => (
              <tr key={c.id} className="transition hover:bg-[var(--accent-50)]">
                <td className="px-4 py-2">
                  <Link href={`/clients/${c.id}`} className="font-medium hover:underline">
                    {c.name}
                  </Link>
                  {c.single_threaded && (
                    <span className="ml-2">
                      <Badge tone="warn" testId={`single-threaded-${c.id}`}>
                        Single-threaded
                      </Badge>
                    </span>
                  )}
                  {c.city && <span className="ml-2 text-[12px] text-[var(--ink-faint)]">{c.city}</span>}
                </td>
                <td className="px-4 py-2">
                  <Badge
                    dot
                    tone={
                      c.status === 'Active' ? 'good' : c.status === 'Churned' ? 'bad' : 'neutral'
                    }
                  >
                    {c.status}
                  </Badge>
                </td>
                <td className="px-4 py-2">
                  <HealthDot health={c.health} />
                </td>
                <td className="px-4 py-2 text-[12px] text-[var(--ink-muted)]">
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
                <td className="px-4 py-2 text-[12px] text-[var(--ink-muted)]">
                  {istDate(c.last_interaction_at)}
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[13px] text-[var(--ink-muted)]">
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
      <span className="t-label block">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        data-testid={`filter-${name}`}
        className="mt-1 w-36 rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-[13px]"
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
      <span className="t-label block">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        data-testid={`filter-${name}`}
        className="mt-1 w-36 rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-[13px]"
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
