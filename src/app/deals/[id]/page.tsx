import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import {
  activityFor,
  dealById,
  healthHistory,
  lineItems,
  profiles,
  stages,
  tasksFor,
  contactsForDeal,
} from '@/lib/queries';
import { inr, istDate, relativeDue } from '@/lib/format';
import { Badge, Card, CategoryTag, Code, Empty, Field, HealthDot, TermTag } from '@/components/ui';
import { ActivityList } from '@/components/activity-list';
import { CompleteTask } from '@/components/task-widgets';
import { AddLineItemForm, AddTaskForm, LogInteractionForm } from '@/components/client-forms';
import { DealControls, CriteriaPanel, SnapshotEditor } from '@/components/deal-controls';
import { billingAccountsFor, billsForDeal, dealBilling } from '@/lib/billing';
import { BillList, BillingStateBadge } from '@/components/billing-view';
import { AddBillingAccountForm, BillToPicker, NewBillForm } from '@/components/billing';
import { Disclosure } from '@/components/forms';
import { playbooksFor, runsForDeal } from '@/lib/playbooks';
import { RunPanel, StartPlaybook } from '@/components/playbooks';
import { dealTimeline, BLOCKER_LABEL } from '@/lib/timeline';
import { Timeline } from '@/components/timeline';
import { AskForm, AskLink, BlockerForm, CrmToggle } from '@/components/questions';
import { query } from '@/lib/db';
import { asActor } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  const deal = await dealById(me, id);
  if (!deal) notFound();

  const [stageList, items, tasks, history, activity, people, contacts, bills, billing, accounts, runs, playbookChoices, timeline, signals, mailboxes] =
    await Promise.all([
      stages(me, deal.category),
      lineItems(me, deal.id),
      tasksFor(me, { dealId: deal.id }),
      healthHistory(me, deal.id),
      activityFor(me, { dealId: deal.id, limit: 30 }),
      profiles(me),
      contactsForDeal(me, deal.id),
      billsForDeal(me, deal.id),
      dealBilling(me, deal.id),
      billingAccountsFor(me, deal.client_id),
      runsForDeal(me, deal.id),
      playbooksFor(me, deal.category),
      dealTimeline(me, deal.id),
      query<{ blocked_on: string | null; blocker_note: string | null; blocked_since: string | null; open_questions: number }>(
        asActor(me), 'select blocked_on, blocker_note, blocked_since, open_questions from deal_signals where deal_id = $1', [deal.id]),
      query<{ n: number }>(asActor(me), `select count(*)::int as n from mail_accounts where can_read and status = 'connected'`),
    ]);
  const signal = signals[0];
  const askable = people.filter((p) => p.role !== 'bot');
  const openRuns = runs.filter((r) => r.status === 'in_progress');

  return (
    <div className="space-y-5">
      {/* DL-12 header */}
      <header className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <HealthDot health={deal.health} size={14} />
          <Link href={`/clients/${deal.client_id}`} className="text-[13px] text-[var(--ink-muted)] hover:underline">
            {deal.client_name}
          </Link>
          <span className="text-[var(--line-strong)]">/</span>
          <h1
            className="text-[18px] font-semibold tracking-[-0.01em]"
            data-testid="deal-title"
          >
            {deal.title}
          </h1>
          {deal.code && (
            <span data-testid="deal-code">
              <Code>{deal.code}</Code>
            </span>
          )}
          <CategoryTag category={deal.category} />
          <Badge dot>{deal.stage_label}</Badge>
          {deal.category === 'retention' && <TermTag months={deal.term_months} />}
          {!deal.criteria_complete && (
            <Badge tone="warn" testId="criteria-incomplete">Criteria incomplete</Badge>
          )}
          {deal.health_stale && <Badge testId="health-stale">Health stale</Badge>}
          {signal?.blocked_on && (
            <Badge tone="bad" testId="deal-stuck">Stuck on {BLOCKER_LABEL[signal.blocked_on]}</Badge>
          )}
          {signal?.open_questions > 0 && (
            <a href="#ask"><Badge tone="warn">{signal.open_questions} open {signal.open_questions === 1 ? 'question' : 'questions'}</Badge></a>
          )}
          {deal.stage_flag !== 'ok' && (
            <Badge tone={deal.stage_flag === 'red' ? 'bad' : 'warn'}>
              {deal.days_in_stage} days in stage
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-3">
            {deal.context_doc_url && (
              <a
                href={deal.context_doc_url}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-[var(--accent-ink)] hover:underline"
                data-testid="context-doc"
              >
                Context doc ↗
              </a>
            )}
            <Link
              href={`/deals/${deal.id}/summary`}
              className="text-[12px] text-[var(--accent-ink)] hover:underline"
              data-testid="summary-link"
            >
              Plain summary
            </Link>
          </div>
        </div>
        <dl className="mt-3.5 grid gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-7">
          <Field label="Owner">
            {deal.intern_owner_name ?? <span className="font-medium text-[var(--red)]">No owner</span>}
          </Field>
          <Field label="CRM integration required?">
            <CrmToggle dealId={deal.id} value={deal.crm_required} />
          </Field>
          <Field label="Product">{deal.product ?? '—'}</Field>
          <Field label="Term">{deal.term_months ? `${deal.term_months} months` : '—'}</Field>
          <Field label="Monthly">{inr(deal.monthly_value)}</Field>
          <Field label="Start">{istDate(deal.start_date)}</Field>
          <Field label="End">{istDate(deal.end_date)}</Field>
        </dl>
        {billing && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-3 text-[12px] text-[var(--ink-muted)]">
            <span className="t-label">Billing</span>
            <BillingStateBadge state={billing.billing_state} testId="deal-billing-state" />
            {billing.bills > 0 && (
              <span className="tabular-nums">
                {inr(billing.billed)} billed · {inr(billing.paid)} collected
                {Number(billing.outstanding) > 0 && <> · {inr(billing.outstanding)} outstanding</>}
              </span>
            )}
            {billing.overdue_bills > 0 && (
              <Badge tone="bad">{inr(billing.overdue_amount)} overdue</Badge>
            )}
            {billing.paid_awaiting_ti > 0 && <Badge tone="warn">TI to issue</Badge>}
          </div>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* left column */}
        <div className="space-y-5 lg:col-span-2">
          <Card title="Activity history" testId="panel-activity" count={timeline.items.length}>
            <Timeline
              dealId={deal.id}
              items={timeline.items}
              upcoming={timeline.upcoming}
              counts={timeline.counts}
              meId={me.id}
              mailboxes={mailboxes[0]?.n ?? 0}
            />
            {me.role === 'admin' && (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <Disclosure label="Raw audit log, with undo">
                  <ActivityList rows={activity} canUndo />
                </Disclosure>
              </div>
            )}
          </Card>

          <Card title="Playbooks" testId="panel-playbooks" count={openRuns.length || undefined}>
            {runs.length > 0 && (
              <div className="mb-3 space-y-2">
                {runs.map((r, i) => (
                  <RunPanel key={r.id} run={r} dealId={deal.id} open={i === 0 && r.status === 'in_progress'} />
                ))}
              </div>
            )}
            {runs.length === 0 && (
              <p className="mb-3 text-[13px] text-[var(--ink-faint)]">
                No playbook running. Some start by themselves when the deal changes stage or turns red.
              </p>
            )}
            <StartPlaybook dealId={deal.id} playbooks={playbookChoices} />
          </Card>

          <Card title="Success criteria" testId="panel-criteria" action={<AskLink dealId={deal.id} anchor="criteria" />}>
            <CriteriaPanel deal={deal} />
          </Card>

          <Card title="Snapshot" testId="panel-snapshot" action={<AskLink dealId={deal.id} anchor="snapshot" />}>
            <SnapshotEditor deal={deal} people={people} />
          </Card>

          <Card
            title="Billing"
            testId="panel-billing"
            count={bills.length}
            action={
              <span className="flex items-center gap-3">
                {billing && <BillingStateBadge state={billing.billing_state} />}
                <AskLink dealId={deal.id} anchor="billing" />
              </span>
            }
          >
            {bills.length === 0 ? (
              <Empty>
                {billing?.billing_state === 'not_yet'
                  ? 'Not invoiced. Expansion deals are billed once they close.'
                  : billing?.billing_state === 'no_value'
                    ? 'Not invoiced. Set a monthly or contract value to know what to bill.'
                    : 'Not invoiced yet. Add the PI once it is raised in Zoho.'}
              </Empty>
            ) : (
              <BillList bills={bills} />
            )}
            {billing?.bills_monthly && billing.billing_state === 'not_invoiced' && bills.length > 0 && (
              <p className="mt-3 rounded-md bg-[var(--amber-soft)] px-2.5 py-1.5 text-[12px] text-[var(--amber)]">
                No PI covers this month yet.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 border-t border-[var(--line)] pt-3">
              <Disclosure label="Add a PI" testId="add-bill">
                <NewBillForm
                  dealId={deal.id}
                  accounts={accounts}
                  defaultAccountId={billing?.billing_account_id ?? null}
                  monthly={Boolean(billing?.bills_monthly)}
                  suggestedAmount={
                    billing?.bills_monthly
                      ? Number(deal.monthly_value)
                      : deal.contract_value
                        ? Math.max(0, Number(deal.contract_value) - Number(billing?.billed ?? 0) / 1.18)
                        : null
                  }
                />
              </Disclosure>
              <div className="flex items-center gap-2">
                <span className="t-label whitespace-nowrap">Bill to</span>
                <BillToPicker dealId={deal.id} accounts={accounts} current={billing?.billing_account_id ?? null} />
              </div>
            </div>
            {accounts.length === 0 && (
              <div className="mt-3">
                <Disclosure label="Add a bill-to party">
                  <AddBillingAccountForm clientId={deal.client_id} dealId={deal.id} />
                </Disclosure>
              </div>
            )}
          </Card>

          <Card title="Line items" testId="panel-line-items" count={items.length}>
            {items.length === 0 ? (
              <Empty>No line items yet.</Empty>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="t-label text-left">
                  <tr>
                    <th className="pb-1 font-medium">Description</th>
                    <th className="pb-1 text-right font-medium">Qty</th>
                    <th className="pb-1 text-right font-medium">Rate</th>
                    <th className="pb-1 text-right font-medium">Amount</th>
                    <th className="pb-1 text-right font-medium">Delivered</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {items.map((li) => (
                    <tr key={li.id}>
                      <td className="py-1.5">
                        {li.description}
                        {li.unit && <span className="ml-1 text-[12px] text-[var(--ink-faint)]">{li.unit}</span>}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{Number(li.quantity)}</td>
                      <td className="py-1.5 text-right tabular-nums">{inr(li.rate)}</td>
                      <td className="py-1.5 text-right tabular-nums">{inr(li.amount)}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {Number(li.delivered_quantity)}
                        <span className="ml-1 text-[12px] text-[var(--ink-faint)]">
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
            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <AddLineItemForm dealId={deal.id} />
            </div>
          </Card>

          <Card title="Contacts" count={contacts.length} action={<AskLink dealId={deal.id} anchor="contacts" />}>
            <ul className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[13px]"
                >
                  {c.name}
                  <span className="ml-1.5 text-[12px] text-[var(--ink-muted)]">{c.role.replaceAll('_', ' ')}</span>
                </li>
              ))}
              {contacts.length === 0 && (
                <Empty>
                  No one linked to this deal yet. The client&rsquo;s contacts are on its page.
                </Empty>
              )}
            </ul>
          </Card>


        </div>

        {/* right column */}
        <div className="space-y-5">
          <section id="ask" className="scroll-mt-4">
            <Card title="Ask a question" testId="panel-ask" count={signal?.open_questions || undefined}>
              <AskForm
                key={`${sp.ask ?? ''}-${sp.about ?? ''}`}
                dealId={deal.id}
                people={askable}
                anchor={sp.ask}
                about={sp.about}
                defaultTo={deal.intern_owner}
              />
              <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
                The person you ask sees it in My work. Answers appear in the activity history.
              </p>
            </Card>
          </section>

          {!deal.stage_is_terminal && (
            <Card title="Stuck?" testId="panel-blocker">
              {signal?.blocked_on && (
                <p className="mb-2 rounded-md bg-[var(--red-soft)] px-2.5 py-1.5 text-[12px] text-[var(--red)]">
                  Waiting on {BLOCKER_LABEL[signal.blocked_on]} since {istDate(signal.blocked_since)}: {signal.blocker_note}
                </p>
              )}
              <BlockerForm dealId={deal.id} blockedOn={signal?.blocked_on ?? null} note={signal?.blocker_note ?? null} />
            </Card>
          )}

          <Card title="Health" testId="panel-health">
            <DealControls deal={deal} stages={stageList} />
            {history.length > 0 && (
              <ol className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">
                {history.map((h, i) => (
                  <li key={i} className="flex gap-2 text-[12px]">
                    <HealthDot health={h.health as 'red' | 'amber' | 'green'} />
                    <div className="min-w-0">
                      <p className="text-[var(--ink)]">{h.reason}</p>
                      <p className="text-[var(--ink-faint)]">
                        {istDate(h.set_at)} · {h.set_by_name ?? 'system'}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Next step" testId="panel-next-step" action={<AskLink dealId={deal.id} anchor="next_step" />}>
            {deal.next_step ? (
              <>
                <p className="text-[13px]">{deal.next_step}</p>
                <p
                  className={`mt-1 text-[12px] ${deal.next_step_overdue ? 'font-semibold text-[var(--red)]' : 'text-[var(--ink-muted)]'}`}
                >
                  Due {istDate(deal.next_step_due)} · {relativeDue(deal.next_step_due)}
                </p>
              </>
            ) : (
              <Empty>No next step set.</Empty>
            )}
          </Card>

          <Card title="Tasks" testId="panel-tasks" count={tasks.length} action={<AskLink dealId={deal.id} anchor="tasks" />}>
            <ul className="divide-y divide-[var(--line)]">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate text-[13px]">{t.title}</span>
                  <span className="shrink-0 text-[12px] text-[var(--ink-muted)]">{relativeDue(t.due_date)}</span>
                  <CompleteTask taskId={t.id} dealId={deal.id} />
                </li>
              ))}
              {tasks.length === 0 && <Empty>No open tasks.</Empty>}
            </ul>
            <div className="mt-3 border-t border-[var(--line)] pt-3">
              <AddTaskForm dealId={deal.id} clientId={deal.client_id} people={people} />
            </div>
          </Card>

          <Card title="Log a call, meeting or note" testId="panel-interactions">
            <p className="mb-2 text-[12px] text-[var(--ink-faint)]">
              Pick a future time to schedule it; it shows under Upcoming in the activity history.
            </p>
            <LogInteractionForm clientId={deal.client_id} dealId={deal.id} deals={[]} />
          </Card>
        </div>
      </div>
    </div>
  );
}
