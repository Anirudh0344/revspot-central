import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import {
  activityFor,
  dealById,
  healthHistory,
  interactionsFor,
  lineItems,
  profiles,
  stages,
  tasksFor,
  contactsFor,
} from '@/lib/queries';
import { inr, istDate, istDateTime, relativeDue } from '@/lib/format';
import { Badge, Card, Empty, Field, HealthDot } from '@/components/ui';
import { ActivityList } from '@/components/activity-list';
import { CompleteTask } from '@/components/task-widgets';
import { AddLineItemForm, AddTaskForm, LogInteractionForm } from '@/components/client-forms';
import { DealControls, CriteriaPanel, SnapshotEditor } from '@/components/deal-controls';

export const dynamic = 'force-dynamic';

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const deal = await dealById(me, id);
  if (!deal) notFound();

  const [stageList, items, tasks, history, interactions, activity, people, contacts] =
    await Promise.all([
      stages(me, deal.category),
      lineItems(me, deal.id),
      tasksFor(me, { dealId: deal.id }),
      healthHistory(me, deal.id),
      interactionsFor(me, { dealId: deal.id, limit: 8 }),
      activityFor(me, { dealId: deal.id, limit: 30 }),
      profiles(me),
      contactsFor(me, deal.client_id),
    ]);

  return (
    <div className="space-y-5">
      {/* DL-12 header */}
      <header className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-wrap items-center gap-2">
          <HealthDot health={deal.health} size={14} />
          <Link href={`/clients/${deal.client_id}`} className="text-sm text-neutral-500 hover:underline">
            {deal.client_name}
          </Link>
          <span className="text-neutral-300">/</span>
          <h1 className="text-lg font-semibold" data-testid="deal-title">
            {deal.title}
          </h1>
          {deal.code && <Badge tone="blue" testId="deal-code">{deal.code}</Badge>}
          <Badge tone="violet">{deal.category}</Badge>
          <Badge>{deal.stage_label}</Badge>
          {!deal.criteria_complete && (
            <Badge tone="amber" testId="criteria-incomplete">Criteria incomplete</Badge>
          )}
          {deal.health_stale && <Badge testId="health-stale">Health stale</Badge>}
          {deal.stage_flag !== 'ok' && (
            <Badge tone={deal.stage_flag === 'red' ? 'red' : 'amber'}>
              {deal.days_in_stage} days in stage
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-3">
            {deal.context_doc_url && (
              <a
                href={deal.context_doc_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-700 hover:underline dark:text-sky-400"
                data-testid="context-doc"
              >
                Context doc ↗
              </a>
            )}
            <Link
              href={`/deals/${deal.id}/summary`}
              className="text-xs text-sky-700 hover:underline dark:text-sky-400"
              data-testid="summary-link"
            >
              Plain summary
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Owner">{deal.intern_owner_name ?? 'Unassigned'}</Field>
          <Field label="Product">{deal.product ?? '—'}</Field>
          <Field label="Term">{deal.term_months ? `${deal.term_months} months` : '—'}</Field>
          <Field label="Monthly">{inr(deal.monthly_value)}</Field>
          <Field label="Start">{istDate(deal.start_date)}</Field>
          <Field label="End">{istDate(deal.end_date)}</Field>
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* left column */}
        <div className="space-y-5 lg:col-span-2">
          <Card title="Success criteria" testId="panel-criteria">
            <CriteriaPanel deal={deal} />
          </Card>

          <Card title="Snapshot" testId="panel-snapshot">
            <SnapshotEditor deal={deal} people={people} />
          </Card>

          <Card title="Line items" testId="panel-line-items" count={items.length}>
            {items.length === 0 ? (
              <Empty>No line items yet.</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="pb-1 font-medium">Description</th>
                    <th className="pb-1 text-right font-medium">Qty</th>
                    <th className="pb-1 text-right font-medium">Rate</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                    <th className="pb-1 text-right font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {items.map((li) => (
                    <tr key={li.id}>
                      <td className="py-1.5">
                        {li.description}
                        {li.unit && <span className="ml-1 text-xs text-neutral-400">{li.unit}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{Number(li.quantity)}</td>
                      <td className="py-1.5 text-right tabular-nums">{inr(li.rate)}</td>
                      <td className="py-1.5 text-right tabular-nums">{inr(li.amount)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {Number(li.delivered_quantity)}
                        <span className="ml-1 text-xs text-neutral-400">
                          {Number(li.quantity) > 0
                            ? `${Math.round((Number(li.delivered_quantity) / Number(li.quantity)) * 100)}%`
                            : ''}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="font-medium">
                    <td className="pt-2">Total</td>
                    <td />
                    <td />
                    <td className="pt-2 text-right tabular-nums">{inr(deal.total_value)}</td>
                    <td className="pt-2 text-right tabular-nums">
                      {deal.delivery_progress ? `${deal.delivery_progress}%` : '—'}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
            <div className="mt-4 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <AddLineItemForm dealId={deal.id} />
            </div>
          </Card>

          <Card title="Contacts" count={contacts.length}>
            <ul className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm dark:border-neutral-800"
                >
                  {c.name}
                  <span className="ml-1.5 text-xs text-neutral-500">{c.role.replace('_', ' ')}</span>
                </li>
              ))}
              {contacts.length === 0 && <Empty>No contacts on this client.</Empty>}
            </ul>
          </Card>

          <Card title="Activity" testId="panel-activity" count={activity.length}>
            <ActivityList rows={activity} canUndo={me.role === 'admin'} />
          </Card>
        </div>

        {/* right column */}
        <div className="space-y-5">
          <Card title="Health" testId="panel-health">
            <DealControls deal={deal} stages={stageList} />
            {history.length > 0 && (
              <ol className="mt-4 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <HealthDot health={h.health as 'red' | 'amber' | 'green'} />
                    <div className="min-w-0">
                      <p className="text-neutral-700 dark:text-neutral-300">{h.reason}</p>
                      <p className="text-neutral-400">
                        {istDate(h.set_at)} · {h.set_by_name ?? 'system'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Next step" testId="panel-next-step">
            {deal.next_step ? (
              <>
                <p className="text-sm">{deal.next_step}</p>
                <p
                  className={`mt-1 text-xs ${deal.next_step_overdue ? 'font-semibold text-rose-600' : 'text-neutral-500'}`}
                >
                  Due {istDate(deal.next_step_due)} · {relativeDue(deal.next_step_due)}
                </p>
              </>
            ) : (
              <Empty>No next step set.</Empty>
            )}
          </Card>

          <Card title="Tasks" testId="panel-tasks" count={tasks.length}>
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className="shrink-0 text-xs text-neutral-500">{relativeDue(t.due_date)}</span>
                  <CompleteTask taskId={t.id} dealId={deal.id} />
                </li>
              ))}
              {tasks.length === 0 && <Empty>No open tasks.</Empty>}
            </ul>
            <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <AddTaskForm dealId={deal.id} clientId={deal.client_id} people={people} />
            </div>
          </Card>

          <Card title="Recent interactions" testId="panel-interactions" count={interactions.length}>
            <ul className="space-y-2">
              {interactions.map((i) => (
                <li key={i.id} className="border-l-2 border-neutral-200 pl-2.5 dark:border-neutral-700">
                  <p className="text-xs text-neutral-500">
                    {istDateTime(i.occurred_at)} · {i.channel}
                  </p>
                  <p className="text-sm">{i.summary}</p>
                </li>
              ))}
              {interactions.length === 0 && <Empty>Nothing logged yet.</Empty>}
            </ul>
            <div className="mt-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <LogInteractionForm clientId={deal.client_id} dealId={deal.id} deals={[]} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
