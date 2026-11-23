import Link from 'next/link';
import type { Analytics, Filters } from '@/lib/analytics';
import { inr, istDate } from '@/lib/format';
import { Card, Empty, HealthDot } from './ui';
import { BarChart } from './analytics';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const monthLabel = (ym: string) =>
  new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0">
      <p className="t-label">{label}</p>
      <p
        className={`mt-1 text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${
          tone === 'bad' ? 'text-[var(--red)]' : tone === 'good' ? 'text-[var(--green-ink)]' : ''
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{note}</p>}
    </div>
  );
}

const HEALTH_LABEL: Record<string, string> = { green: 'Green', amber: 'Amber', red: 'Red', none: 'Not set' };

export function AnalyticsDashboard({ data, filters }: { data: Analytics; filters: Filters }) {
  const c = filters.category;
  const show = {
    revenue: !c || c === 'retention',
    pilots: !c || c === 'pilot',
    expansion: !c || c === 'expansion',
  };
  const mrrNow = Number(data.mrr.mrr_now);
  const mrrStart = Number(data.mrr.mrr_start);
  const change = mrrNow - mrrStart;
  const span = `${istDate(data.period.from)} – ${istDate(data.period.to)}`;
  const decided = data.pilots.converted + data.pilots.stopped;
  const open = data.expansion.filter((e) => e.kind === 'open');
  const won = data.expansion.find((e) => e.kind === 'won');
  const lost = data.expansion.find((e) => e.kind === 'lost');
  const healthOrder = ['red', 'amber', 'green', 'none'];
  const health = healthOrder
    .map((h) => data.health.find((x) => x.health === h) ?? { health: h, deals: 0, mrr: '0' })
    .filter((h) => h.deals > 0 || h.health !== 'none');
  const totalDeals = health.reduce((s, h) => s + h.deals, 0);

  return (
    <div className="space-y-5" data-testid="analytics">
      <p className="text-[12px] text-[var(--ink-muted)]">{span}</p>

      {show.revenue && (
        <div className="grid grid-cols-2 gap-4 rounded-[var(--radius)] border border-[var(--line)] p-4 sm:grid-cols-3 lg:grid-cols-5">
          <Tile
            label="MRR now"
            value={inr(mrrNow, true)}
            note={`${change >= 0 ? '+' : '−'}${inr(Math.abs(change), true)} in the period · ${data.mrr.live_retainers} retainers`}
          />
          <Tile label="New MRR" value={inr(data.mrr.new_mrr, true)} note="Retainers that started" tone={Number(data.mrr.new_mrr) > 0 ? 'good' : undefined} />
          <Tile label="Churned MRR" value={inr(data.mrr.churned_mrr, true)} note="Retainers that ended" tone={Number(data.mrr.churned_mrr) > 0 ? 'bad' : undefined} />
          <Tile label="Net retention" value={pct(data.nrr)} note={`Across ${data.retentionClients} paying clients`} />
          <Tile label="Gross retention" value={pct(data.grr)} note="Kept, before any growth" />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {show.revenue && (
          <div className="lg:col-span-2">
            <Card title="Monthly recurring revenue">
              {data.trend.every((t) => t.mrr === 0) ? (
                <Empty>No retainers with a monthly value yet.</Empty>
              ) : (
                <BarChart
                  ariaLabel="Monthly recurring revenue, last 12 months"
                  highlightLast
                  data={data.trend.map((t) => ({
                    label: monthLabel(t.month),
                    value: t.mrr,
                    display: inr(t.mrr, true),
                    sub: monthLabel(t.month) + ' ' + t.month.slice(0, 4),
                  }))}
                />
              )}
              <p className="mt-2 text-[11px] text-[var(--ink-faint)]">
                Monthly value of retainers live at each month end, from their start and close dates.
              </p>
            </Card>
          </div>
        )}

        <div className={show.revenue ? '' : 'lg:col-span-1'}>
          <Card title="Health of live deals" count={totalDeals}>
            <ul className="space-y-2.5">
              {health.map((h) => (
                <li key={h.health} className="text-[13px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <HealthDot health={h.health === 'none' ? null : (h.health as 'red' | 'amber' | 'green')} />
                      {HEALTH_LABEL[h.health]}
                    </span>
                    <span className="tabular-nums text-[var(--ink-muted)]">
                      {h.deals} · {inr(h.mrr, true)}/mo
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[var(--paper-sunk)]">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${totalDeals ? (h.deals / totalDeals) * 100 : 0}%`,
                        background:
                          h.health === 'red' ? 'var(--red-dot)' : h.health === 'amber' ? 'var(--amber-dot)' : h.health === 'green' ? 'var(--green)' : 'var(--line-strong)',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className={show.revenue ? 'lg:col-span-2' : 'lg:col-span-2'}>
          <Card title="Collections">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Billed" value={inr(data.collections.billed, true)} note="PIs dated in the period" />
              <Tile label="Collected" value={inr(data.collections.collected, true)} tone="good" />
              <Tile label="Outstanding" value={inr(data.collections.outstanding, true)} note="Today" />
              <Tile
                label="Overdue"
                value={inr(data.collections.overdue, true)}
                note={`${data.collections.overdue_bills} bills`}
                tone={Number(data.collections.overdue) > 0 ? 'bad' : undefined}
              />
              <Tile
                label="Days to collect"
                value={data.collections.avg_days_to_pay ?? '—'}
                note="From PI to payment"
              />
            </div>
            <Link href="/finance" className="mt-3 inline-block text-[12px] text-[var(--accent-ink)] hover:underline">
              Open Finance
            </Link>
          </Card>
        </div>

        {show.pilots && (
          <Card title="Pilots">
            <div className="grid grid-cols-2 gap-4">
              <Tile label="Live" value={String(data.pilots.live)} />
              <Tile label="Started" value={String(data.pilots.started)} note="In the period" />
              <Tile label="Converted" value={String(data.pilots.converted)} tone={data.pilots.converted ? 'good' : undefined} />
              <Tile label="Stopped" value={String(data.pilots.stopped)} />
              <Tile label="Conversion" value={decided ? pct(data.pilots.converted / decided) : '—'} note="Of pilots decided" />
              <Tile label="Days to convert" value={data.pilots.avg_days ?? '—'} />
            </div>
          </Card>
        )}

        {show.expansion && (
          <div className="lg:col-span-2">
            <Card title="Expansion">
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="t-label">Open pipeline</p>
                  {open.every((o) => o.deals === 0) ? (
                    <Empty>No open expansion deals.</Empty>
                  ) : (
                    <div className="mt-3">
                      <BarChart
                        ariaLabel="Open expansion pipeline by stage"
                        height={110}
                        data={open.map((o) => ({
                          label: o.label,
                          value: Number(o.value),
                          display: `${inr(o.value, true)} · ${o.deals} deals`,
                        }))}
                      />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 content-start gap-4">
                  <Tile label="Won" value={inr(won?.value ?? 0, true)} note={`${won?.deals ?? 0} deals in the period`} tone={won?.deals ? 'good' : undefined} />
                  <Tile label="Lost" value={inr(lost?.value ?? 0, true)} note={`${lost?.deals ?? 0} deals`} />
                  <Tile
                    label="Win rate"
                    value={(won?.deals ?? 0) + (lost?.deals ?? 0) ? pct((won?.deals ?? 0) / ((won?.deals ?? 0) + (lost?.deals ?? 0))) : '—'}
                    note="Of deals decided"
                  />
                </div>
              </div>
            </Card>
          </div>
        )}

        {show.revenue && (
          <Card title="Renewals, next 90 days" count={data.renewals.length}>
            {data.renewals.length === 0 ? (
              <Empty>No term deals end in the next 90 days.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {data.renewals.map((r) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-[13px] first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="mt-[6px]">
                        <HealthDot health={r.health as 'red' | 'amber' | 'green' | null} />
                      </span>
                      <span className="min-w-0">
                        <Link href={`/deals/${r.id}`} className="font-medium hover:text-[var(--accent-ink)]">
                          {r.client_name}
                        </Link>
                        <span className="block truncate text-[12px] text-[var(--ink-muted)]">{r.title}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[12px] tabular-nums text-[var(--ink-muted)]">
                      {istDate(r.end_date)}
                      <span className="block">{inr(r.monthly_value, true)}/mo</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
