import type { ClientUsage, UsageTrend } from '@/lib/usage';
import { count, istDateTime, pct, usageChangeText } from '@/lib/format';
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

/** Last 30 days vs the 30 before, one row per metric, plus weekly bars. */
export function UsagePanel({
  usage,
  weeks,
}: {
  usage: ClientUsage;
  weeks: { week_start: string; leads: number; calls: number }[];
}) {
  const rows = [
    { key: 'leads', label: 'Leads processed', cur: usage.leads_30, prev: usage.leads_prev, change: usage.leads_change_pct },
    { key: 'calls', label: 'Bot calls', cur: usage.calls_30, prev: usage.calls_prev, change: usage.calls_change_pct },
  ] as const;
  return (
    <div className="space-y-4" data-testid="usage-panel">
      <table className="w-full text-[13px]">
        <thead className="text-left">
          <tr>
            <th className="t-label pb-2">Metric</th>
            <th className="t-label pb-2 text-right">Last 30 days</th>
            <th className="t-label pb-2 text-right">30 days before</th>
            <th className="t-label pb-2 text-right">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((r) => (
            <tr key={r.key} data-testid={`usage-row-${r.key}`}>
              <td className="py-2">{r.label}</td>
              <td className="py-2 text-right tabular-nums">{Number(r.cur).toLocaleString('en-IN')}</td>
              <td className="py-2 text-right tabular-nums text-[var(--ink-muted)]">{Number(r.prev).toLocaleString('en-IN')}</td>
              <td className={`py-2 text-right tabular-nums ${changeClass(r.change, r.prev)}`}>{pct(r.change)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="grid gap-4 sm:grid-cols-2">
        <Bars title="Leads per week" values={weeks.map((w) => ({ x: w.week_start, v: w.leads }))} />
        <Bars title="Bot calls per week" values={weeks.map((w) => ({ x: w.week_start, v: w.calls }))} />
      </div>

      <p className="text-[12px] text-[var(--ink-faint)]">
        From the Revspot admin data. A metric is flagged when it falls 20% or more from at least 100 the month
        before. Last synced {istDateTime(usage.synced_at)}.
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

/** Eight weekly bars, oldest on the left, one hue. */
function Bars({ title, values }: { title: string; values: { x: string; v: number }[] }) {
  const max = Math.max(1, ...values.map((d) => d.v));
  return (
    <div>
      <p className="t-label">{title}</p>
      <div className="mt-2 flex h-20 items-end gap-1" role="img" aria-label={`${title}, last 8 weeks`}>
        {values.map((d) => (
          <div key={d.x} className="flex h-full flex-1 flex-col justify-end" title={`Week of ${d.x}: ${d.v.toLocaleString('en-IN')}`}>
            <div
              className="rounded-t-[2px] bg-[var(--accent-200)]"
              style={{ height: `${d.v === 0 ? 0 : Math.max(3, (100 * d.v) / max)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-[var(--ink-faint)]">
        <span>8 weeks ago</span>
        <span>{count(values.at(-1)?.v)} last week</span>
      </div>
    </div>
  );
}
