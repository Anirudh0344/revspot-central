import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { activityFor } from '@/lib/queries';
import { Card, Empty } from '@/components/ui';
import { ActivityList } from '@/components/activity-list';

export const dynamic = 'force-dynamic';

const HIGH_IMPACT = new Set([
  'health',
  'health_reason',
  'stage',
  'close_reason',
  'monthly_value',
  'contract_value',
  'term_months',
  'archived_at',
]);

/** BA-3: everything the bot changed today, high-impact first, each with undo. */
export default async function BotDigestPage() {
  const me = await currentProfile();
  if (!me) redirect('/login');

  const rows = await activityFor(me, { botOnly: true, todayIST: true, limit: 200 });

  const isHigh = (r: (typeof rows)[number]) =>
    Object.keys(r.changes ?? {}).some((k) => HIGH_IMPACT.has(k));
  const high = rows.filter(isHigh);
  const rest = rows.filter((r) => !isHigh(r));

  const byDeal = new Map<string, typeof rest>();
  for (const r of rest) {
    const k = r.deal_title ? `${r.client_name} · ${r.deal_title}` : (r.client_name ?? 'Other');
    byDeal.set(k, [...(byDeal.get(k) ?? []), r]);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-semibold">
          Bot digest <span className="text-[var(--ink-faint)]">{rows.length} changes today</span>
        </h1>
        <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
          Every change the bot made since midnight IST. Undo works for seven days.
        </p>
      </div>

      <Card title="High impact" count={high.length} testId="digest-high">
        {high.length === 0 ? (
          <Empty>The bot changed no health, stage, value or term today.</Empty>
        ) : (
          <ActivityList rows={high} canUndo={me.role === 'admin'} showDeal />
        )}
      </Card>

      {[...byDeal.entries()].map(([deal, list]) => (
        <Card key={deal} title={deal} count={list.length}>
          <ActivityList rows={list} canUndo={me.role === 'admin'} />
        </Card>
      ))}

      {rows.length === 0 && (
        <Card title="Nothing yet">
          <Empty>The bot has not written anything today.</Empty>
        </Card>
      )}
    </div>
  );
}
