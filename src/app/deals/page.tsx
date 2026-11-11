import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, dealList, profiles, stages } from '@/lib/queries';
import { moveStageAction } from '@/lib/actions';
import { inr, istDate, relativeDue } from '@/lib/format';
import type { DealRow } from '@/lib/types';
import { Badge, Code, HealthDot, Owner } from '@/components/ui';
import { Board } from '@/components/board';
import { btnPrimary } from '@/components/forms';
import { Filters, ViewTabs } from './controls';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'all', label: 'All deals' },
  { key: 'pilot', label: 'Pilot' },
  { key: 'retention', label: 'Retention' },
  { key: 'expansion', label: 'Expansion' },
] as const;

type ViewKey = (typeof VIEWS)[number]['key'];

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;

  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'all') as ViewKey;
  const category = view === 'all' ? undefined : view;

  const filters = {
    health: sp.health,
    intern: sp.intern,
    product: sp.product,
    client: sp.client,
    q: sp.q,
  };

  const [all, scoped, people, clients, stageList] = await Promise.all([
    // Every live deal, so the tabs carry honest counts whatever the filters say.
    dealList(me, {}),
    dealList(me, {
      ...filters,
      category,
      includeTerminal: sp.closed === 'on' || !!category,
    }),
    profiles(me),
    clientList(me),
    category ? stages(me, category) : Promise.resolve([]),
  ]);

  const counts: Record<string, number> = {
    all: all.length,
    pilot: all.filter((d) => d.category === 'pilot').length,
    retention: all.filter((d) => d.category === 'retention').length,
    expansion: all.filter((d) => d.category === 'expansion').length,
  };

  const live = scoped.filter((d) => !d.stage_is_terminal);
  const monthly = live.reduce((s, d) => s + Number(d.monthly_value ?? 0), 0);
  const reds = live.filter((d) => d.health === 'red').length;
  const attention = live.filter((d) => !d.criteria_complete || d.next_step_overdue).length;

  const page = Math.max(1, Number(sp.page ?? 1));
  const perPage = 50;
  const pages = Math.max(1, Math.ceil(scoped.length / perPage));
  const rows = scoped.slice((page - 1) * perPage, page * perPage);
  const href = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set('page', String(p));
    return `/deals?${u}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[17px] font-semibold tracking-tight">Deals</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/handover"
            className="text-[12px] font-medium text-[var(--blue-ink)] underline-offset-2 hover:underline"
          >
            Pilot handover
          </Link>
          <Link href="/deals/new" className={btnPrimary} data-testid="new-deal">
            New deal
          </Link>
        </div>
      </div>

      <ViewTabs views={VIEWS} current={view} counts={counts} />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-[var(--ink-muted)]">
        <span>
          <span className="font-medium tabular-nums text-[var(--ink)]">{live.length}</span> live
        </span>
        <span>
          <span className="font-medium tabular-nums text-[var(--ink)]">{inr(monthly, true)}</span> a
          month
        </span>
        {reds > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <HealthDot health="red" />
            <span className="tabular-nums">{reds}</span> red
          </span>
        )}
        {attention > 0 && (
          <span className="tabular-nums">{attention} missing criteria or a next step</span>
        )}
      </div>

      <Filters
        people={people.filter((p) => p.role !== 'viewer').map((p) => ({ id: p.id, name: p.name }))}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        values={{ ...filters, closed: sp.closed, view }}
        showClosed={view === 'all'}
      />

      {category ? (
        <Board stages={stageList} deals={scoped} move={moveStageAction} />
      ) : (
        <>
          <DealTable rows={rows} />
          {pages > 1 && (
            <nav className="flex gap-1" data-testid="pagination">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={href(p)}
                  className={`rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition ${
                    p === page
                      ? 'border-[var(--ink)] font-medium text-[var(--ink)]'
                      : 'border-[var(--line)] text-[var(--ink-muted)] hover:bg-[var(--paper-sunk)]'
                  }`}
                >
                  {p}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function DealTable({ rows }: { rows: DealRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--line)] px-4 py-12 text-center text-sm text-[var(--ink-faint)]">
        No deals match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
      <table className="w-full border-collapse text-sm" data-testid="deals-table">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--paper-sunk)] text-left text-[10px] uppercase tracking-[0.06em] text-[var(--ink-faint)]">
            <th className="px-3 py-2 font-medium">Deal</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Stage</th>
            <th className="px-3 py-2 font-medium">Next step</th>
            <th className="px-3 py-2 text-right font-medium">Monthly</th>
            <th className="px-3 py-2 font-medium">Owner</th>
            <th className="px-3 py-2 font-medium">Ends</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              className="border-b border-[var(--line)] align-top transition last:border-0 hover:bg-[var(--paper-sunk)]"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-[7px]">
                    <HealthDot health={d.health} />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/deals/${d.id}`}
                      className="font-medium text-[var(--ink)] transition hover:text-[var(--blue-ink)]"
                    >
                      {d.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                      {d.client_name}
                      {d.code && <Code>{d.code}</Code>}
                      {!d.criteria_complete && !d.stage_is_terminal && (
                        <Badge tone="warn">Criteria incomplete</Badge>
                      )}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5 text-[12px] capitalize text-[var(--ink-muted)]">
                {d.category}
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={d.stage_flag === 'ok' ? 'neutral' : 'warn'}>{d.stage_label}</Badge>
              </td>
              <td className="px-3 py-2.5">
                <p className="max-w-[22rem] truncate text-[12px] text-[var(--ink)]">
                  {d.next_step ?? '—'}
                </p>
                <p
                  className={`text-[11px] ${d.next_step_overdue ? 'font-medium text-[var(--red)]' : 'text-[var(--ink-faint)]'}`}
                >
                  {relativeDue(d.next_step_due)}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right text-[12px] tabular-nums">
                {inr(d.monthly_value, true)}
              </td>
              <td className="px-3 py-2.5">
                <Owner name={d.intern_owner_name} />
              </td>
              <td className="px-3 py-2.5 text-[11px] text-[var(--ink-muted)]">
                {istDate(d.end_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
