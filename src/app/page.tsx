import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { homeScreen, activityFor } from '@/lib/queries';
import { inr, isOverdue, istDate, relativeDue, todayIST } from '@/lib/format';
import { Badge, Card, DealCard, Empty, HealthDot, Owner } from '@/components/ui';
import { CompleteTask } from '@/components/task-widgets';

export const dynamic = 'force-dynamic';

const HYGIENE_LABEL: Record<string, string> = {
  missing_criteria: 'Success criteria incomplete',
  missing_next_step: 'No dated next step',
  stale_health: 'Health not set this week',
  stale_stage: 'Sitting too long in its stage',
};

export default async function Home() {
  const me = await currentProfile();
  if (!me) redirect('/login');

  const [{ reds, dueToday, endingSoon, hygiene }, botToday] = await Promise.all([
    homeScreen(me),
    activityFor(me, { botOnly: true, sinceHours: 24, limit: 6 }),
  ]);

  const overdue = dueToday.filter((t) => isOverdue(t.due_date));
  const today = dueToday.filter((t) => t.due_date === todayIST());

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Good morning, {me.name.split(' ')[0]}</h1>
        <p className="text-sm text-neutral-500">
          {reds.length} red · {overdue.length} overdue · {hygiene.length} hygiene items
        </p>
      </div>

      {/* HM-1 */}
      <Card title="Red deals" testId="panel-reds" count={reds.length}>
        {reds.length === 0 ? (
          <Empty>Nothing is red. Confirm the ambers before you move on.</Empty>
        ) : (
          <ul className="space-y-2" data-testid="red-deal-list">
            {reds.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900 dark:bg-rose-950/30"
              >
                <HealthDot health="red" />
                <div className="min-w-0 flex-1">
                  <Link href={`/deals/${d.id}`} className="text-sm font-medium hover:underline">
                    {d.client_name} · {d.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">
                    {d.health_reason}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Next: {d.next_step ?? 'none set'} · {relativeDue(d.next_step_due)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500">
                  <span>{inr(d.monthly_value, true)}/mo</span>
                  <Owner name={d.intern_owner_name} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* HM-2 */}
        <Card title="Due today" testId="panel-due-today" count={overdue.length + today.length}>
          {overdue.length + today.length === 0 ? (
            <Empty>Nothing due today.</Empty>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {[...overdue, ...today].map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{t.title}</p>
                    <p className="truncate text-xs text-neutral-500">
                      {t.client_name ?? '—'}
                      {t.deal_title ? ` · ${t.deal_title}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs ${
                      isOverdue(t.due_date) ? 'font-semibold text-rose-600' : 'text-neutral-500'
                    }`}
                  >
                    {relativeDue(t.due_date)}
                  </span>
                  <CompleteTask taskId={t.id} dealId={t.deal_id} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* HM-3 */}
        <Card title="Pilots ending in 14 days" testId="panel-ending" count={endingSoon.length}>
          {endingSoon.length === 0 ? (
            <Empty>No pilot ends in the next two weeks.</Empty>
          ) : (
            <ul className="space-y-2">
              {endingSoon.map((d) => (
                <li key={d.id} className="flex items-center gap-3">
                  <HealthDot health={d.health} />
                  <Link href={`/deals/${d.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {d.client_name} · {d.title}
                  </Link>
                  {!d.criteria_complete && <Badge tone="amber">Criteria incomplete</Badge>}
                  <span className="shrink-0 text-xs text-neutral-500">{istDate(d.end_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* HM-4 */}
      <Card
        title="Hygiene"
        testId="panel-hygiene"
        count={hygiene.length}
        action={
          <Link href="/bot" className="text-xs text-sky-700 hover:underline dark:text-sky-400">
            Open the bot work queue
          </Link>
        }
      >
        {hygiene.length === 0 ? (
          <Empty>Every live deal has criteria, a next step and fresh health.</Empty>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {hygiene.map((h, i) => (
              <li key={`${h.deal_id}-${h.reason}-${i}`} className="flex items-center gap-2 text-sm">
                <Badge tone={h.reason === 'missing_criteria' ? 'amber' : 'neutral'}>
                  {HYGIENE_LABEL[h.reason] ?? h.reason}
                </Badge>
                <Link href={`/deals/${h.deal_id}`} className="min-w-0 truncate hover:underline">
                  {h.client_name} · {h.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* BA-3 */}
      <Card
        title="Bot digest"
        testId="panel-bot-digest"
        count={botToday.length}
        action={
          <Link href="/bot/digest" className="text-xs text-sky-700 hover:underline dark:text-sky-400">
            Full digest and undo
          </Link>
        }
      >
        {botToday.length === 0 ? (
          <Empty>The bot has not changed anything in the last day.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {botToday.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-sm">
                <Badge tone="blue">bot</Badge>
                <span className="min-w-0 flex-1 truncate">
                  {a.action.replace('_', ' ')} on {a.deal_title ?? a.client_name ?? a.entity_type}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{a.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {reds.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {reds.slice(0, 4).map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
        </div>
      )}
    </div>
  );
}
