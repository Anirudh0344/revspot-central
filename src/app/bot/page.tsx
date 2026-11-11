import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { botWorkQueue } from '@/lib/queries';
import { Badge, Card, Empty } from '@/components/ui';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, { text: string; tone: 'red' | 'amber' | 'neutral' | 'blue' }> = {
  missing_criteria: { text: 'Success criteria incomplete', tone: 'amber' },
  missing_next_step: { text: 'No dated next step', tone: 'red' },
  overdue_next_step: { text: 'Next step overdue', tone: 'red' },
  stale_health: { text: 'Health not set this week', tone: 'neutral' },
  stale_stage: { text: 'Too long in its stage', tone: 'amber' },
  checkin_overdue: { text: 'Check-in overdue', tone: 'blue' },
};

const HOW: Record<string, string> = {
  missing_criteria: 'Open the deal, fill the six criteria fields, save.',
  missing_next_step: 'Open the deal, set a next step and a due date.',
  overdue_next_step: 'Chase the step, log what happened, then set the new next step.',
  stale_health: 'Set red, amber or green with a one-line reason.',
  stale_stage: 'Move the card, or say in the next step why it is still here.',
  checkin_overdue: 'Reach out, then log the interaction on the deal.',
};

/** AU-7: the bot works this list top to bottom. */
export default async function BotQueuePage() {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const items = await botWorkQueue(me);

  const grouped = new Map<string, typeof items>();
  for (const i of items) grouped.set(i.reason, [...(grouped.get(i.reason) ?? []), i]);
  const order = [...grouped.entries()].sort((a, b) => a[1][0].priority - b[1][0].priority);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          Bot work queue <span className="text-neutral-400">{items.length} items</span>
        </h1>
        <Link href="/bot/digest" className="text-sm text-sky-700 hover:underline dark:text-sky-400">
          Today&rsquo;s bot digest
        </Link>
      </div>

      {items.length === 0 && (
        <Card title="Clear">
          <Empty>Nothing needs doing. Every live deal is complete and current.</Empty>
        </Card>
      )}

      {order.map(([reason, list]) => (
        <Card
          key={reason}
          title={LABEL[reason]?.text ?? reason}
          count={list.length}
          testId={`queue-${reason}`}
        >
          <p className="mb-2 text-xs text-neutral-500">{HOW[reason]}</p>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {list.map((i) => (
              <li key={`${i.deal_id}-${reason}`} className="flex flex-wrap items-center gap-2 py-2">
                <Badge tone={LABEL[reason]?.tone ?? 'neutral'}>{reason.replace(/_/g, ' ')}</Badge>
                <Link href={`/deals/${i.deal_id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                  {i.client_name} · {i.title}
                </Link>
                {i.code && <Badge tone="blue">{i.code}</Badge>}
                <Link
                  href={`/deals/${i.deal_id}/summary`}
                  className="text-xs text-sky-700 hover:underline dark:text-sky-400"
                >
                  summary
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
