import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, dealList, dealMonths, profiles, stages } from '@/lib/queries';
import { moveStageAction } from '@/lib/actions';
import { inr, istDate, relativeDue } from '@/lib/format';
import type { DealRow } from '@/lib/types';
import { Badge, CategoryTag, Code, HealthDot, Owner, TermTag } from '@/components/ui';
import { Board } from '@/components/board';
import { btnPrimary } from '@/components/forms';
import { Filters, MonthPicker, ViewTabs } from './controls';
import { billingStates, type BillingState } from '@/lib/billing';
import { BillingStateBadge } from '@/components/billing-view';
import { analytics, PERIODS, type Filters as AnalyticsFilterValues, type PeriodKey } from '@/lib/analytics';
import { AnalyticsDashboard } from '@/components/analytics-view';
import { AnalyticsFilters } from '@/components/analytics';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'all', label: 'All deals' },
  { key: 'pilot', label: 'Pilot' },
  { key: 'retention', label: 'Retention' },
  { key: 'expansion', label: 'Expansion' },
  { key: 'analytics', label: 'Analytics' },
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
  const category = view === 'all' || view === 'analytics' ? undefined : view;

  // The month a deal was added, in India time. Defaults to this month.
  const thisMonth = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date());
  const month = sp.month === 'all' || /^\d{4}-\d{2}$/.test(sp.month ?? '') ? sp.month! : thisMonth;
  const inMonth = month === 'all' ? undefined : month;

  const filters = {
    health: sp.health,
    intern: sp.intern,
    product: sp.product,
    client: sp.client,
    q: sp.q,
  };

  const analyticsFilters: AnalyticsFilterValues = {
    period: (PERIODS.find((p) => p.key === sp.period)?.key ?? 'month') as PeriodKey,
    owner: sp.owner || undefined,
    client: sp.client || undefined,
    category: (['pilot', 'retention', 'expansion'] as const).find((c) => c === sp.category),
  };

  const [all, scoped, months, people, clients, stageList, billing, dashboard] = await Promise.all([
    // Every live deal added in the month, so the tabs carry honest counts whatever the other filters say.
    dealList(me, { month: inMonth }),
    // Live deals only. A closed deal leaves this module and stays on its client's page.
    dealList(me, { ...filters, category, month: inMonth }),
    dealMonths(me),
    profiles(me),
    clientList(me),
    category ? stages(me, category) : Promise.resolve([]),
    billingStates(me),
    view === 'analytics' ? analytics(me, analyticsFilters) : Promise.resolve(null),
  ]);
  const liveStages = stageList.filter((st) => !st.is_terminal);

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
        <h1 className="text-[18px] font-semibold tracking-tight">Deals</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/handover"
            className="text-[12px] font-medium text-[var(--accent-ink)] underline-offset-2 hover:underline"
          >
            Pilot handover
          </Link>
          <Link href="/deals/new" className={btnPrimary} data-testid="new-deal">
            New deal
          </Link>
        </div>
      </div>

      <ViewTabs views={VIEWS} current={view} counts={counts} />

      {dashboard ? (
        <>
          <AnalyticsFilters
            periods={PERIODS}
            people={people.filter((p) => p.role !== 'viewer' && p.role !== 'bot').map((p) => ({ id: p.id, name: p.name }))}
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
            values={analyticsFilters}
          />
          <AnalyticsDashboard data={dashboard} filters={analyticsFilters} />
        </>
      ) : (
      <>

      <MonthPicker months={months.includes(thisMonth) ? months : [...months, thisMonth]} current={month} />

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
        values={{ ...filters, view, month }}
      />

      {category ? (
        <Board stages={liveStages} deals={scoped} move={moveStageAction} />
      ) : (
        <>
          <DealTable rows={rows} billing={billing} />
          {pages > 1 && (
            <nav className="flex gap-1" data-testid="pagination">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={href(p)}
                  className={`rounded-md border px-2.5 py-1 text-[12px] tabular-nums transition ${
                    p === page
                      ? 'border-[var(--ink)] bg-[var(--accent-100)] font-medium text-[var(--accent-deep)]'
                      : 'border-[var(--line)] text-[var(--ink-muted)] hover:border-[var(--accent-200)] hover:bg-[var(--accent-50)]'
                  }`}
                >
                  {p}
                </Link>
              ))}
            </nav>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

function DealTable({ rows, billing }: { rows: DealRow[]; billing: Map<string, BillingState> }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius)] border border-[var(--line)] px-4 py-12 text-center text-[13px] text-[var(--ink-faint)]">
        No deals match these filters.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
      <table className="w-full border-collapse text-[13px]" data-testid="deals-table">
        <thead>
          <tr className="border-b border-[var(--line)] bg-[var(--paper-tint)] text-left">
            <th className="t-label px-3 py-2">Deal</th>
            <th className="t-label px-3 py-2">Category</th>
            <th className="t-label px-3 py-2">Stage</th>
            <th className="t-label px-3 py-2">Next step</th>
            <th className="t-label px-3 py-2 text-right">Monthly</th>
            <th className="t-label px-3 py-2">Billing</th>
            <th className="t-label px-3 py-2">Owner</th>
            <th className="t-label px-3 py-2">Added</th>
            <th className="t-label px-3 py-2">Ends</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr
              key={d.id}
              className="border-b border-[var(--line)] align-top transition last:border-0 hover:bg-[var(--accent-50)]"
            >
              <td className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="mt-[7px]">
                    <HealthDot health={d.health} />
                  </span>
                  <div className="min-w-0">
                    <Link
                      href={`/deals/${d.id}`}
                      className="font-medium text-[var(--ink)] transition hover:text-[var(--accent-ink)]"
                    >
                      {d.title}
                    </Link>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--ink-muted)]">
                      {d.client_name}
                      {d.code && <Code>{d.code}</Code>}
                      {d.category === 'retention' && <TermTag months={d.term_months} />}
                      {!d.criteria_complete && !d.stage_is_terminal && (
                        <Badge tone="warn">Criteria incomplete</Badge>
                      )}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <CategoryTag category={d.category} />
              </td>
              <td className="px-3 py-2.5">
                <Badge dot tone={d.stage_flag === 'ok' ? 'neutral' : 'warn'}>
                  {d.stage_label}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                <p className="max-w-[22rem] truncate text-[13px] text-[var(--ink)]">
                  {d.next_step ?? '—'}
                </p>
                <p
                  className={`text-[11px] ${d.next_step_overdue ? 'font-medium text-[var(--red)]' : 'text-[var(--ink-faint)]'}`}
                >
                  {relativeDue(d.next_step_due)}
                </p>
              </td>
              <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                {inr(d.monthly_value, true)}
              </td>
              <td className="px-3 py-2.5">
                <BillingStateBadge state={billing.get(d.id) ?? 'not_invoiced'} />
              </td>
              <td className="px-3 py-2.5">
                <Owner name={d.intern_owner_name} />
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[12px] text-[var(--ink-muted)]">
                {istDate(d.created_at)}
              </td>
              <td className="px-3 py-2.5 text-[12px] text-[var(--ink-muted)]">
                {istDate(d.end_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
