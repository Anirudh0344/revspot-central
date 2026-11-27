import type { ClientUsage, UsageDay, UsageTrend } from '@/lib/usage';
import type { UsageRange } from '@/lib/usage-range';
import { UsageTrend as UsageTrendChart } from './usage-trend';
import { istDateTime, pct, usageChangeText } from '@/lib/format';
import { Badge } from './ui';

const TREND: Record<UsageTrend, { label: string; tone: 'bad' | 'warn' | 'good' | 'neutral' }> = {
  stopped: { label: 'Usage stopped', tone: 'bad' },
  down: { label: 'Usage down', tone: 'warn' },
  up: { label: 'Usage up', tone: 'good' },
  steady: { label: 'Usage steady', tone: 'neutral' },
  new: { label: 'New usage', tone: 'neutral' },
  none: { label: 'No usage', tone: 'neutral' },
};

/** One chip: how this client's usage moved, last 30 days vs the 30 before. */
export function UsageBadge({ usage, quietWhenSteady }: { usage: ClientUsage | null | undefined; quietWhenSteady?: boolean }) {
  if (!usage) return null;
  if (quietWhenSteady && (usage.trend === 'steady' || usage.trend === 'new')) return null;
  const t = TREND[usage.trend];
  return (
    <span title={usageChangeText(usage)}>
      <Badge tone={t.tone} dot testId={`usage-trend-${usage.client_id}`}>
        {t.label}
        {usage.trend === 'down' && ` ${worst(usage)}`}
      </Badge>
    </span>
  );
}

function worst(u: ClientUsage) {
  const drops = [u.leads_prev >= 100 ? u.leads_change_pct : null, u.calls_prev >= 100 ? u.calls_change_pct : null]
    .filter((p): p is number => p !== null);
  return drops.length ? pct(Math.min(...drops)) : '';
}

/** Change in whole percent, or null when there is nothing to compare against. */
const changePct = (cur: number, prev: number) => (prev > 0 ? Math.round((100 * (cur - prev)) / prev) : null);

const shortDate = (d: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d));

/**
 * The chosen date range against the same number of days just before it, with a daily
 * trend per metric. The flag (badge) is separate: always last 30 days vs the 30 before.
 */
export function UsagePanel({
  usage,
  range,
  totals,
  days,
}: {
  usage: ClientUsage;
  range: UsageRange;
  totals: { prev_from: string; prev_to: string; leads: number; calls: number; leads_prev: number; calls_prev: number };
  days: UsageDay[];
}) {
  const rows = [
    { key: 'leads', label: 'Leads processed', cur: totals.leads, prev: totals.leads_prev },
    { key: 'calls', label: 'Bot calls', cur: totals.calls, prev: totals.calls_prev },
  ] as const;
  const span = (f: string, t: string) => (f === t ? shortDate(f) : `${shortDate(f)} – ${shortDate(t)}`);
  return (
    <div className="space-y-5" data-testid="usage-panel">
      <UsageTrendChart days={days} />

      <table className="w-full text-[13px]" data-testid="usage-range-table">
        <thead className="text-left">
          <tr>
            <th className="t-label pb-2">Metric</th>
            <th className="t-label pb-2 text-right">{span(range.from, range.to)}</th>
            <th className="t-label pb-2 text-right">{span(totals.prev_from, totals.prev_to)}</th>
            <th className="t-label pb-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((r) => {
            const change = changePct(r.cur, r.prev);
            return (
              <tr key={r.key} data-testid={`usage-row-${r.key}`}>
                <td className="py-2">{r.label}</td>
                <td className="py-2 text-right tabular-nums">{Number(r.cur).toLocaleString('en-IN')}</td>
                <td className="py-2 text-right tabular-nums text-[var(--ink-muted)]">{Number(r.prev).toLocaleString('en-IN')}</td>
                <td className={`py-2 text-right tabular-nums ${changeClass(change, r.prev)}`}>{pct(change)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-[12px] text-[var(--ink-faint)]">
        From the Revspot admin data. The usage flag always compares the last 30 days with the 30 before
        (leads {pct(usage.leads_change_pct)}, bot calls {pct(usage.calls_change_pct)}); it fires when a metric
        falls 20% or more from at least 100. Last synced {istDateTime(usage.synced_at)}.
      </p>
    </div>
  );
}

function changeClass(change: number | null, prev: number) {
  if (change === null || prev < 100) return 'text-[var(--ink-muted)]';
  if (change <= -20) return 'font-medium text-[var(--red)]';
  if (change >= 20) return 'text-[var(--green-ink)]';
  return '';
}
