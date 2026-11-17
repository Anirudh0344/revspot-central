import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { financeOverview, remindersFor } from '@/lib/billing';
import { sendingAccount } from '@/lib/gmail';
import { inr, istDate, istDateTime } from '@/lib/format';
import { Badge, Card, CategoryTag, Code, Empty } from '@/components/ui';
import { BillList, Money } from '@/components/billing-view';
import { QueueRemindersButton, ReminderCard } from '@/components/billing';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  po_chase: 'PO/RO chase',
  pre_due: 'Due soon',
  due: 'Due today',
  overdue: 'Overdue',
  manual: 'Manual',
};

const VIEWS = [
  { key: 'collect', label: 'To collect' },
  { key: 'not-invoiced', label: 'Not invoiced' },
  { key: 'ti', label: 'TI to issue' },
  { key: 'sent', label: 'Sent reminders' },
] as const;

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { view: raw } = await searchParams;
  const view = VIEWS.find((v) => v.key === raw)?.key ?? 'collect';

  const [{ open, notInvoiced, totals }, queued, sent, sender] = await Promise.all([
    financeOverview(me),
    remindersFor(me, { status: 'queued' }),
    view === 'sent' ? remindersFor(me, { status: 'sent', limit: 50 }) : Promise.resolve([]),
    sendingAccount(),
  ]);
  const failed = await remindersFor(me, { status: 'failed' });

  const toCollect = open.filter((b) => ['pi_sent', 'po_received', 'partially_paid', 'draft'].includes(b.step));
  const tiDue = open.filter((b) => b.step === 'paid');
  const overdueCount = open.filter((b) => b.overdue).length;
  const waiting = [...failed, ...queued];

  const counts: Record<string, number> = {
    collect: toCollect.length,
    'not-invoiced': notInvoiced.length,
    ti: tiDue.length,
    sent: 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[18px] font-semibold tracking-tight">Finance</h1>
        <p className="text-[12px] text-[var(--ink-muted)]">
          {sender ? (
            <>
              Sending from <span className="font-medium text-[var(--ink)]">{sender.email}</span>
            </>
          ) : (
            <>
              No sending mailbox.{' '}
              <Link href="/settings" className="font-medium text-[var(--accent-ink)] hover:underline">
                Connect finance@revspot.ai
              </Link>
            </>
          )}
        </p>
      </div>

      <div className="grid gap-4 rounded-[var(--radius)] border border-[var(--line)] p-4 sm:grid-cols-4">
        <Money label="Outstanding" value={inr(totals.outstanding, true)} />
        <Money label={`Overdue · ${overdueCount}`} value={inr(totals.overdue, true)} tone={Number(totals.overdue) > 0 ? 'bad' : undefined} />
        <Money label="Collected this month" value={inr(totals.collected_month, true)} tone="good" />
        <Money label="Live deals not invoiced" value={String(notInvoiced.length)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <nav className="flex gap-1 border-b border-[var(--line)]">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/finance?view=${v.key}`}
                data-testid={`finance-tab-${v.key}`}
                className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] ${
                  view === v.key
                    ? 'border-[var(--accent)] font-medium text-[var(--ink)]'
                    : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
                }`}
              >
                {v.label}
                {counts[v.key] > 0 && (
                  <span className="rounded bg-[var(--tag-bg)] px-1 text-[11px] tabular-nums text-[var(--ink-muted)]">
                    {counts[v.key]}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {view === 'collect' &&
            (toCollect.length === 0 ? (
              <Empty>Nothing waiting on a client. PIs you add on a deal show up here until they are paid.</Empty>
            ) : (
              <BillList bills={toCollect} showClient showDeal />
            ))}

          {view === 'ti' &&
            (tiDue.length === 0 ? (
              <Empty>No paid bills are waiting for a tax invoice.</Empty>
            ) : (
              <BillList bills={tiDue} showClient showDeal />
            ))}

          {view === 'not-invoiced' &&
            (notInvoiced.length === 0 ? (
              <Empty>Every live deal with a value is invoiced.</Empty>
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
                <table className="w-full text-[13px]" data-testid="not-invoiced-table">
                  <thead>
                    <tr className="border-b border-[var(--line)] bg-[var(--paper-tint)] text-left">
                      <th className="t-label px-3 py-2">Deal</th>
                      <th className="t-label px-3 py-2">Category</th>
                      <th className="t-label px-3 py-2">Why</th>
                      <th className="t-label px-3 py-2 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notInvoiced.map((d) => (
                      <tr key={d.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--accent-50)]">
                        <td className="px-3 py-2">
                          <Link href={`/deals/${d.id}`} className="font-medium hover:text-[var(--accent-ink)]">
                            {d.title}
                          </Link>
                          <p className="text-[11px] text-[var(--ink-muted)]">
                            {d.client_name} {d.code && <Code>{d.code}</Code>}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <CategoryTag category={d.category as 'pilot' | 'retention' | 'expansion'} />
                        </td>
                        <td className="px-3 py-2 text-[12px] text-[var(--ink-muted)]">
                          {d.bills_monthly
                            ? d.last_pi_date
                              ? `No PI this month · last ${istDate(d.last_pi_date)}`
                              : 'Monthly, never invoiced'
                            : 'No PI raised'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {d.bills_monthly ? `${inr(d.monthly_value, true)}/mo` : inr(d.contract_value ?? d.monthly_value, true)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

          {view === 'sent' &&
            (sent.length === 0 ? (
              <Empty>No reminders sent yet.</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {sent.map((r) => (
                  <li key={r.id} className="py-2.5 text-[13px]">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{r.subject}</span>
                      <Badge>{KIND_LABEL[r.kind]}</Badge>
                    </p>
                    <p className="text-[12px] text-[var(--ink-muted)]">
                      {r.client_name} · to {r.to_emails.join(', ')} · {istDateTime(r.sent_at)} from {r.sent_from}
                    </p>
                  </li>
                ))}
              </ul>
            ))}
        </div>

        <Card
          title="Reminders"
          count={waiting.length}
          testId="reminder-queue"
          action={<QueueRemindersButton />}
        >
          {waiting.length === 0 ? (
            <Empty>
              Nothing to send. Reminders appear here 3 days after a PI with no PO/RO, 3 days before a due date, on
              it, and weekly once overdue.
            </Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {waiting.map((r) => (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0" data-testid="reminder">
                  <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge tone={r.kind === 'overdue' ? 'bad' : r.kind === 'po_chase' ? 'brand' : 'warn'}>
                      {KIND_LABEL[r.kind]}
                    </Badge>
                    {r.status === 'failed' && <Badge tone="bad">Not sent</Badge>}
                    <Link href={`/deals/${r.deal_id}`} className="text-[var(--ink-muted)] hover:underline">
                      {r.client_name} · {r.pi_number ?? r.deal_title}
                    </Link>
                  </p>
                  <ReminderCard r={r} canSend={Boolean(sender)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
