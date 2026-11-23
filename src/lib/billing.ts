import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';

/** Where a bill is in PI -> PO/RO -> payment -> TI. */
export type BillStep =
  | 'draft'
  | 'pi_sent'
  | 'po_received'
  | 'partially_paid'
  | 'paid'
  | 'ti_issued'
  | 'cancelled'
  | 'written_off';

export const STEP_LABEL: Record<BillStep, string> = {
  draft: 'PI not sent',
  pi_sent: 'Awaiting PO/RO',
  po_received: 'Awaiting payment',
  partially_paid: 'Part paid',
  paid: 'Paid · TI due',
  ti_issued: 'Closed',
  cancelled: 'Cancelled',
  written_off: 'Written off',
};

export type BillRow = {
  id: string;
  deal_id: string;
  client_id: string;
  billing_account_id: string | null;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  pi_number: string | null;
  pi_date: string | null;
  pi_sent_on: string | null;
  po_number: string | null;
  po_received_on: string | null;
  po_url: string | null;
  ti_number: string | null;
  ti_date: string | null;
  due_date: string | null;
  amount: string;
  gst: string;
  total: string;
  paid: string;
  balance: string;
  last_paid_on: string | null;
  status: string;
  step: BillStep;
  overdue: boolean;
  days_overdue: number;
  deal_title: string;
  deal_code: string | null;
  deal_category: string;
  client_name: string;
  bill_to_name: string | null;
  bill_to_is_intermediary: boolean | null;
  to_emails: string[];
  cc_emails: string[];
  notes: string | null;
};

export type BillingState = 'no_value' | 'not_yet' | 'not_invoiced' | 'invoiced' | 'paid';

export const BILLING_STATE_LABEL: Record<BillingState, string> = {
  no_value: 'No value set',
  not_yet: 'Not billable yet',
  not_invoiced: 'Not invoiced',
  invoiced: 'Invoiced',
  paid: 'Paid',
};

export type DealBilling = {
  deal_id: string;
  bills: number;
  billed: string;
  paid: string;
  outstanding: string;
  overdue_amount: string;
  overdue_bills: number;
  paid_awaiting_ti: number;
  last_pi_date: string | null;
  bills_monthly: boolean;
  billing_state: BillingState;
  billing_account_id: string | null;
};

export type ClientBilling = {
  client_id: string;
  bills_raised: number;
  bills_due: number;
  due_amount: string;
  bills_overdue: number;
  overdue_amount: string;
  collected: string;
  deals_invoiced: number;
  deals_not_invoiced: number;
};

export type BillingAccount = {
  id: string;
  client_id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  to_emails: string[];
  cc_emails: string[];
  is_intermediary: boolean;
  notes: string | null;
};

export type Reminder = {
  id: string;
  invoice_id: string;
  kind: 'po_chase' | 'pre_due' | 'due' | 'overdue' | 'manual';
  scheduled_for: string;
  status: 'queued' | 'sent' | 'skipped' | 'failed';
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body: string;
  sent_at: string | null;
  sent_from: string | null;
  error: string | null;
  client_name: string;
  client_id: string;
  deal_id: string;
  deal_title: string;
  pi_number: string | null;
  balance: string;
};

export type MailAccount = {
  id: string;
  email: string;
  can_send: boolean;
  can_read: boolean;
  status: string;
  last_error: string | null;
  connected_at: string;
  connected_by_name: string | null;
  last_synced_at: string | null;
  last_sync_count: number | null;
};

const BILL_ORDER = `order by
  case step when 'paid' then 0 when 'partially_paid' then 1 when 'po_received' then 2
            when 'pi_sent' then 3 when 'draft' then 4 else 5 end,
  due_date nulls last, pi_date desc nulls last`;

export async function billsForDeal(me: Profile, dealId: string) {
  return query<BillRow>(asActor(me), `select * from bill_view where deal_id = $1 ${BILL_ORDER}`, [dealId]);
}

export async function billsForClient(me: Profile, clientId: string) {
  return query<BillRow>(asActor(me), `select * from bill_view where client_id = $1 ${BILL_ORDER}`, [clientId]);
}

export async function dealBilling(me: Profile, dealId: string): Promise<DealBilling | null> {
  const rows = await query<DealBilling>(asActor(me), `select db.*, d.billing_account_id
       from deal_billing db join deals d on d.id = db.deal_id where db.deal_id = $1`, [dealId]);
  return rows[0] ?? null;
}

/** Billing state for every deal, for list views. */
export async function billingStates(me: Profile): Promise<Map<string, BillingState>> {
  const rows = await query<{ deal_id: string; billing_state: BillingState }>(
    asActor(me),
    'select deal_id, billing_state from deal_billing',
  );
  return new Map(rows.map((r) => [r.deal_id, r.billing_state]));
}

export async function clientBilling(me: Profile, clientId: string): Promise<ClientBilling | null> {
  const rows = await query<ClientBilling>(asActor(me), 'select * from client_billing where client_id = $1', [clientId]);
  return rows[0] ?? null;
}

export async function billingAccountsFor(me: Profile, clientId: string) {
  return query<BillingAccount>(
    asActor(me),
    `select id, client_id, name, legal_name, gstin, to_emails, cc_emails, is_intermediary, notes
       from billing_accounts where client_id = $1 and archived_at is null order by name`,
    [clientId],
  );
}

export async function remindersFor(me: Profile, opts: { status?: string; invoiceId?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    where.push(`r.status = $${params.length}`);
  }
  if (opts.invoiceId) {
    params.push(opts.invoiceId);
    where.push(`r.invoice_id = $${params.length}`);
  }
  params.push(opts.limit ?? 100);
  return query<Reminder>(
    asActor(me),
    `select r.id, r.invoice_id, r.kind, r.scheduled_for, r.status, r.to_emails, r.cc_emails,
            r.subject, r.body, r.sent_at, r.sent_from, r.error,
            bv.client_name, bv.client_id, bv.deal_id, bv.deal_title, bv.pi_number, bv.balance
       from billing_reminders r join bill_view bv on bv.id = r.invoice_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by coalesce(r.sent_at, r.created_at) desc
      limit $${params.length}`,
    params,
  );
}

export type NotInvoicedDeal = {
  id: string;
  title: string;
  code: string | null;
  client_id: string;
  client_name: string;
  category: string;
  stage_label: string;
  monthly_value: string | null;
  contract_value: string | null;
  bills_monthly: boolean;
  last_pi_date: string | null;
};

export async function financeOverview(me: Profile) {
  const actor = asActor(me);
  const [open, notInvoiced, totals] = await Promise.all([
    query<BillRow>(
      actor,
      `select * from bill_view where step not in ('ti_issued','cancelled','written_off') ${BILL_ORDER}`,
    ),
    query<NotInvoicedDeal>(
      actor,
      `select dv.id, dv.title, dv.code, dv.client_id, dv.client_name, dv.category, dv.stage_label,
              dv.monthly_value, dv.contract_value, db.bills_monthly, db.last_pi_date
         from deal_view dv join deal_billing db on db.deal_id = dv.id
        where dv.archived_at is null and not dv.stage_is_terminal and db.billing_state = 'not_invoiced'
        order by dv.client_name, dv.title`,
    ),
    query<{ outstanding: string; overdue: string; collected_month: string }>(
      actor,
      `select
         coalesce((select sum(balance) from bill_view where step in ('pi_sent','po_received','partially_paid')), 0) as outstanding,
         coalesce((select sum(balance) from bill_view where overdue), 0) as overdue,
         coalesce((select sum(amount) from payments
                    where received_on >= date_trunc('month', today_ist())::date), 0) as collected_month`,
    ),
  ]);
  return { open, notInvoiced, totals: totals[0] };
}

export async function mailAccounts(me: Profile) {
  return query<MailAccount>(
    asActor(me),
    `select m.id, m.email, m.can_send, m.can_read, m.status, m.last_error, m.connected_at,
            p.name as connected_by_name, m.last_synced_at, m.last_sync_count
       from mail_accounts m left join profiles p on p.id = m.connected_by
      order by m.can_send desc, m.email`,
  );
}

export type Reply = {
  id: string;
  replied_at: string;
  reply_snippet: string | null;
  subject: string;
  client_name: string;
  deal_id: string;
  pi_number: string | null;
  balance: string;
};

/** Clients who wrote back on a reminder and nobody has looked yet. */
export async function unseenReplies(me: Profile) {
  return query<Reply>(
    asActor(me),
    `select r.id, r.replied_at, r.reply_snippet, r.subject, bv.client_name, bv.deal_id, bv.pi_number, bv.balance
       from billing_reminders r join bill_view bv on bv.id = r.invoice_id
      where r.replied_at is not null and r.reply_seen_at is null
      order by r.replied_at desc`,
  );
}
