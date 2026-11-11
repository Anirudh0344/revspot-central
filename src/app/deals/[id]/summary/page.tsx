import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { dealById, interactionsFor, lineItems, tasksFor } from '@/lib/queries';
import { inr, istDate, istDateTime } from '@/lib/format';
import { SC_FIELDS } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** AU-8: every field and the last 10 interactions on one plain screen. */
export default async function DealSummary({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const deal = await dealById(me, id);
  if (!deal) notFound();

  const [items, tasks, interactions] = await Promise.all([
    lineItems(me, deal.id),
    tasksFor(me, { dealId: deal.id }),
    interactionsFor(me, { dealId: deal.id, limit: 10 }),
  ]);

  const lines: string[] = [
    `DEAL: ${deal.title}`,
    `CODE: ${deal.code ?? '(none)'}`,
    `URL: /deals/${deal.id}`,
    `CLIENT: ${deal.client_name}`,
    `CATEGORY: ${deal.category}`,
    `STAGE: ${deal.stage_label} (${deal.stage}), ${deal.days_in_stage} days in stage, flag ${deal.stage_flag}`,
    `TERMINAL STAGE: ${deal.stage_is_terminal ? 'yes' : 'no'}`,
    `HEALTH: ${deal.health ?? '(not set)'}`,
    `HEALTH REASON: ${deal.health_reason ?? '(none)'}`,
    `HEALTH SET AT: ${deal.health_updated_at ? istDateTime(deal.health_updated_at) : '(never)'} (stale: ${deal.health_stale ? 'yes' : 'no'})`,
    `OWNER: ${deal.intern_owner_name ?? '(unassigned)'}`,
    `PRODUCT: ${deal.product ?? '(none)'}`,
    `PROJECTS: ${deal.projects?.join(', ') || '(none)'}`,
    `COMMERCIAL MODEL: ${deal.commercial_model ?? '(none)'}`,
    `TERM MONTHS: ${deal.term_months ?? '(none)'}`,
    `MONTHLY VALUE: ${inr(deal.monthly_value)}`,
    `CONTRACT VALUE: ${inr(deal.contract_value)}`,
    `START DATE: ${istDate(deal.start_date)}`,
    `END DATE: ${istDate(deal.end_date)}`,
    `NEXT STEP: ${deal.next_step ?? '(none)'}`,
    `NEXT STEP DUE: ${istDate(deal.next_step_due)}${deal.next_step_overdue ? ' (OVERDUE)' : ''}`,
    `CONTEXT DOC: ${deal.context_doc_url ?? '(none)'}`,
    `CLOSE REASON: ${deal.close_reason ?? '(none)'}`,
    `CRITERIA COMPLETE: ${deal.criteria_complete ? 'yes' : 'no'}`,
    '',
    'SUCCESS CRITERIA',
    ...SC_FIELDS.map(
      (f) => `  ${f.label.toUpperCase()}: ${(deal[f.key] as string | null) ?? '(EMPTY)'}`,
    ),
    '',
    `MISSING TO ENTER THIS STAGE: ${
      (deal.exit_requirements ?? [])
        .filter((r) => !(deal as unknown as Record<string, unknown>)[r])
        .join(', ') || '(none)'
    }`,
    '',
    `LINE ITEMS (total ${inr(deal.total_value)}, delivery ${deal.delivery_progress ?? 0}%)`,
    ...(items.length
      ? items.map(
          (li) =>
            `  ${li.description} — ${Number(li.quantity)} ${li.unit ?? ''} @ ${inr(li.rate)} = ${inr(li.amount)}; delivered ${Number(li.delivered_quantity)}; billing ${li.billing_trigger ?? '(none)'}`,
        )
      : ['  (none)']),
    '',
    `OPEN TASKS (${tasks.length})`,
    ...(tasks.length
      ? tasks.map((t) => `  ${t.title} — due ${istDate(t.due_date)} — ${t.owner_name ?? 'unowned'}`)
      : ['  (none)']),
    '',
    `LAST ${interactions.length} INTERACTIONS`,
    ...(interactions.length
      ? interactions.map(
          (i) =>
            `  ${istDateTime(i.occurred_at)} [${i.channel}/${i.direction ?? 'outbound'}] ${i.summary}${i.next_step ? ` | next: ${i.next_step}` : ''}`,
        )
      : ['  (none)']),
  ];

  return (
    <div>
      <h1 className="mb-3 text-lg font-semibold">Deal summary</h1>
      <pre
        data-testid="deal-summary"
        className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 font-mono text-[12px] leading-relaxed"
      >
        {lines.join('\n')}
      </pre>
    </div>
  );
}
