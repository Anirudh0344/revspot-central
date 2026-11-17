import Link from 'next/link';
import { inr, istDate } from '@/lib/format';
import { BILLING_STATE_LABEL, STEP_LABEL, type BillRow, type BillStep, type BillingState } from '@/lib/billing';
import { Badge, Code } from './ui';
import { BillNextStep } from './billing';

const STEP_TONE: Record<BillStep, 'neutral' | 'brand' | 'good' | 'warn' | 'bad'> = {
  draft: 'neutral',
  pi_sent: 'brand',
  po_received: 'brand',
  partially_paid: 'warn',
  paid: 'warn',
  ti_issued: 'good',
  cancelled: 'neutral',
  written_off: 'neutral',
};

export function StepBadge({ bill }: { bill: Pick<BillRow, 'step' | 'overdue' | 'days_overdue' | 'status'> }) {
  if (bill.overdue) {
    return (
      <Badge dot tone="bad">
        Overdue {bill.days_overdue}d
      </Badge>
    );
  }
  if (bill.status === 'disputed') return <Badge dot tone="warn">Disputed</Badge>;
  return (
    <Badge dot tone={STEP_TONE[bill.step]}>
      {STEP_LABEL[bill.step]}
    </Badge>
  );
}

const STATE_TONE: Record<BillingState, 'neutral' | 'brand' | 'good' | 'warn' | 'bad'> = {
  no_value: 'neutral',
  not_yet: 'neutral',
  not_invoiced: 'warn',
  invoiced: 'brand',
  paid: 'good',
};

export function BillingStateBadge({ state, testId }: { state: BillingState; testId?: string }) {
  return (
    <Badge tone={STATE_TONE[state]} testId={testId}>
      {BILLING_STATE_LABEL[state]}
    </Badge>
  );
}

/** The PI -> PO/RO -> payment -> TI trail of one bill, as four small facts. */
function Trail({ b }: { b: BillRow }) {
  const parts: [string, string | null, string | null][] = [
    ['PI', b.pi_number, b.pi_sent_on ?? b.pi_date],
    ['PO/RO', b.po_number, b.po_received_on],
    ['Paid', Number(b.paid) > 0 ? inr(b.paid) : null, b.last_paid_on],
    ['TI', b.ti_number, b.ti_date],
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-[var(--ink-faint)]">
      {parts.map(([k, v, d]) => (
        <span key={k} className={v ? 'text-[var(--ink-muted)]' : ''}>
          <span className="font-medium">{k}</span>{' '}
          {v ? (
            <>
              {k === 'PO/RO' && b.po_url ? (
                <a href={b.po_url} target="_blank" rel="noreferrer" className="hover:underline">
                  {v} ↗
                </a>
              ) : (
                v
              )}
              {d && <span className="text-[var(--ink-faint)]"> · {istDate(d)}</span>}
            </>
          ) : (
            '—'
          )}
        </span>
      ))}
    </div>
  );
}

export function BillList({
  bills,
  showDeal,
  showClient,
  actions = true,
}: {
  bills: BillRow[];
  showDeal?: boolean;
  showClient?: boolean;
  actions?: boolean;
}) {
  return (
    <ul className="divide-y divide-[var(--line)]" data-testid="bill-list">
      {bills.map((b) => (
        <li key={b.id} className="py-3 first:pt-0 last:pb-0" data-testid="bill-row">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">{b.pi_number ?? 'PI without a number'}</span>
                <StepBadge bill={b} />
                {b.period_start && (
                  <span className="text-[12px] text-[var(--ink-muted)]">
                    {new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(
                      new Date(b.period_start),
                    )}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                {showClient && (
                  <Link href={`/clients/${b.client_id}`} className="hover:underline">
                    {b.client_name}
                  </Link>
                )}
                {showClient && showDeal && ' · '}
                {showDeal && (
                  <Link href={`/deals/${b.deal_id}`} className="hover:underline">
                    {b.deal_title}
                  </Link>
                )}
                {showDeal && b.deal_code && (
                  <span className="ml-1.5">
                    <Code>{b.deal_code}</Code>
                  </span>
                )}
                {(showDeal || showClient) && b.description && ' · '}
                {b.description}
                {b.bill_to_name && (
                  <span className="text-[var(--ink-faint)]">
                    {(showDeal || showClient || b.description) && ' · '}billed to {b.bill_to_name}
                  </span>
                )}
              </p>
              <Trail b={b} />
            </div>
            <div className="ml-auto text-right">
              <p className="text-[13px] font-medium tabular-nums">{inr(b.total)}</p>
              {Number(b.balance) > 0 && !['draft', 'cancelled', 'written_off'].includes(b.step) ? (
                <p className={`text-[11px] tabular-nums ${b.overdue ? 'font-medium text-[var(--red)]' : 'text-[var(--ink-muted)]'}`}>
                  {inr(b.balance)} due {b.due_date ? istDate(b.due_date) : ''}
                </p>
              ) : (
                <p className="text-[11px] text-[var(--ink-faint)]">incl. GST {inr(b.gst)}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="mt-2">
              <BillNextStep bill={b} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function Money({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'good' }) {
  return (
    <div>
      <p className="t-label">{label}</p>
      <p
        className={`mt-1 text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${
          tone === 'bad' ? 'text-[var(--red)]' : tone === 'good' ? 'text-[var(--green-ink)]' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
