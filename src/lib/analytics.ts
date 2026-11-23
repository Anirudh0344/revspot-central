import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';

/*
  One query per panel, every one honouring the same filters. Money is monthly
  recurring revenue (MRR) from retention deals; expansion is one-off bookings;
  collections come from bills and payments. Dates are IST calendar dates.
*/

export const PERIODS = [
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'fy', label: 'This financial year' },
  { key: '6m', label: 'Last 6 months' },
  { key: '12m', label: 'Last 12 months' },
] as const;
export type PeriodKey = (typeof PERIODS)[number]['key'];

export type Filters = {
  period: PeriodKey;
  owner?: string;
  client?: string;
  category?: 'pilot' | 'retention' | 'expansion';
};

/** Builds `and ...` conditions on a deals alias, plus their params, starting at $n. */
function dealWhere(f: Filters, alias: string, start: number, withCategory = true) {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (f.owner) {
    params.push(f.owner);
    parts.push(`${alias}.intern_owner = $${start + params.length - 1}`);
  }
  if (f.client) {
    params.push(f.client);
    parts.push(`${alias}.client_id = $${start + params.length - 1}`);
  }
  if (withCategory && f.category) {
    params.push(f.category);
    parts.push(`${alias}.category = $${start + params.length - 1}::deal_category`);
  }
  return { sql: parts.map((p) => ` and ${p}`).join(''), params };
}

// The period as SQL over today_ist(): [from, to], both inclusive.
const PERIOD_SQL: Record<PeriodKey, [string, string]> = {
  month: [`date_trunc('month', today_ist())::date`, `today_ist()`],
  last_month: [
    `(date_trunc('month', today_ist()) - interval '1 month')::date`,
    `(date_trunc('month', today_ist()) - interval '1 day')::date`,
  ],
  quarter: [`date_trunc('quarter', today_ist())::date`, `today_ist()`],
  // India's financial year starts on 1 April.
  fy: [
    `make_date(extract(year from today_ist() - interval '3 months')::int, 4, 1)`,
    `today_ist()`,
  ],
  '6m': [`(date_trunc('month', today_ist()) - interval '5 months')::date`, `today_ist()`],
  '12m': [`(date_trunc('month', today_ist()) - interval '11 months')::date`, `today_ist()`],
};

// A retention deal earns its monthly value on day d when it has started and not yet closed.
const ACTIVE_ON = (alias: string, day: string) =>
  `coalesce(${alias}.start_date, ${alias}.created_at::date) <= ${day}
   and (${alias}.closed_at is null or ${alias}.closed_at::date > ${day})
   and ${alias}.archived_at is null`;

export type Analytics = Awaited<ReturnType<typeof analytics>>;

export async function analytics(me: Profile, f: Filters) {
  const actor = asActor(me);
  const [from, to] = PERIOD_SQL[f.period];
  const d = dealWhere(f, 'd', 1, false); // MRR is retention by definition
  const dc = dealWhere(f, 'd', 1, true);

  const [period, mrr, trend, retention, pilots, expansion, renewals, collections, health] = await Promise.all([
    query<{ from: string; to: string }>(actor, `select ${from} as "from", ${to} as "to"`),

    // Revenue now, and the movement inside the period.
    query<{ mrr_now: string; mrr_start: string; new_mrr: string; churned_mrr: string; live_retainers: number }>(
      actor,
      `select
         coalesce(sum(d.monthly_value) filter (where ${ACTIVE_ON('d', 'today_ist()')}), 0) as mrr_now,
         coalesce(sum(d.monthly_value) filter (where ${ACTIVE_ON('d', `(${from} - 1)`)}), 0) as mrr_start,
         coalesce(sum(d.monthly_value) filter (where coalesce(d.start_date, d.created_at::date) between ${from} and ${to}
                                                 and d.archived_at is null), 0) as new_mrr,
         coalesce(sum(d.monthly_value) filter (where d.stage = 'churned' and d.closed_at::date between ${from} and ${to}), 0) as churned_mrr,
         count(*) filter (where ${ACTIVE_ON('d', 'today_ist()')})::int as live_retainers
       from deals d
      where d.category = 'retention' and coalesce(d.monthly_value, 0) > 0 ${d.sql}`,
      d.params,
    ),

    // MRR at each month end (or today, for this month), last 12 months.
    query<{ month: string; mrr: string }>(
      actor,
      `select to_char(m, 'YYYY-MM') as month,
              coalesce(sum(d.monthly_value) filter (
                where ${ACTIVE_ON('d', `least((m + interval '1 month - 1 day')::date, today_ist())`)}), 0) as mrr
         from generate_series(date_trunc('month', today_ist()) - interval '11 months',
                              date_trunc('month', today_ist()), interval '1 month') m
         left join deals d on d.category = 'retention' and coalesce(d.monthly_value, 0) > 0 ${d.sql}
        group by m order by m`,
      d.params,
    ),

    // Gross and net revenue retention, measured per client across the period.
    query<{ start_mrr: string; kept: string; end_mrr: string; clients: number }>(
      actor,
      `with per_client as (
         select d.client_id,
                sum(d.monthly_value) filter (where ${ACTIVE_ON('d', `(${from} - 1)`)}) as s,
                sum(d.monthly_value) filter (where ${ACTIVE_ON('d', `${to}`)}) as e
           from deals d
          where d.category = 'retention' and coalesce(d.monthly_value, 0) > 0 ${d.sql}
          group by d.client_id)
       select coalesce(sum(s), 0) as start_mrr,
              coalesce(sum(least(coalesce(e, 0), s)), 0) as kept,
              coalesce(sum(coalesce(e, 0)), 0) as end_mrr,
              count(*)::int as clients
         from per_client where s > 0`,
      d.params,
    ),

    // Pilots.
    query<{ live: number; started: number; converted: number; stopped: number; avg_days: string | null }>(
      actor,
      `select
         count(*) filter (where d.closed_at is null and d.archived_at is null)::int as live,
         count(*) filter (where d.created_at::date between ${from} and ${to})::int as started,
         count(*) filter (where d.stage = 'converted' and d.closed_at::date between ${from} and ${to})::int as converted,
         count(*) filter (where d.stage = 'stopped' and d.closed_at::date between ${from} and ${to})::int as stopped,
         round(avg(d.closed_at::date - d.created_at::date) filter (
           where d.stage = 'converted' and d.closed_at::date between ${from} and ${to}), 0) as avg_days
       from deals d where d.category = 'pilot' ${d.sql}`,
      d.params,
    ),

    // Expansion: the open pipeline by stage, and what was won or lost in the period.
    query<{ stage: string; label: string; position: number; deals: number; value: string; kind: 'open' | 'won' | 'lost' }>(
      actor,
      `select s.key as stage, s.label, s.position,
              count(d.id)::int as deals, coalesce(sum(coalesce(d.contract_value, d.monthly_value)), 0) as value,
              'open' as kind
         from stages s
         left join deals d on d.category = 'expansion' and d.stage = s.key and d.archived_at is null ${d.sql}
        where s.category = 'expansion' and s.key in ('conversation_started', 'proposal_sent')
        group by s.key, s.label, s.position
       union all
       select 'won', 'Won', 90, count(*)::int, coalesce(sum(coalesce(d.contract_value, d.monthly_value)), 0), 'won'
         from deals d where d.category = 'expansion' and d.won_at::date between ${from} and ${to} ${d.sql}
       union all
       select 'lost', 'Lost', 91, count(*)::int, coalesce(sum(coalesce(d.contract_value, d.monthly_value)), 0), 'lost'
         from deals d where d.category = 'expansion' and d.stage = 'lost' and d.closed_at::date between ${from} and ${to} ${d.sql}
       order by position`,
      d.params,
    ),

    // Renewals coming up: term deals ending in the next 90 days.
    query<{ id: string; title: string; client_name: string; end_date: string; monthly_value: string | null; health: string | null; stage_label: string }>(
      actor,
      `select d.id, d.title, d.client_name, d.end_date, d.monthly_value, d.health, d.stage_label
         from deal_view d
        where d.category = 'retention' and not d.stage_is_terminal and d.archived_at is null
          and coalesce(d.term_months, 0) >= 3
          and d.end_date between today_ist() and today_ist() + 90 ${d.sql}
        order by d.end_date`,
      d.params,
    ),

    // Collections.
    query<{ billed: string; collected: string; outstanding: string; overdue: string; overdue_bills: number; avg_days_to_pay: string | null }>(
      actor,
      `select
         coalesce((select sum(bv.total) from bill_view bv join deals d on d.id = bv.deal_id
                    where bv.step not in ('draft', 'cancelled') and bv.pi_date between ${from} and ${to} ${dc.sql}), 0) as billed,
         coalesce((select sum(p.amount) from payments p join invoices i on i.id = p.invoice_id join deals d on d.id = i.deal_id
                    where p.received_on between ${from} and ${to} ${dc.sql}), 0) as collected,
         coalesce((select sum(bv.balance) from bill_view bv join deals d on d.id = bv.deal_id
                    where bv.step in ('pi_sent', 'po_received', 'partially_paid') ${dc.sql}), 0) as outstanding,
         coalesce((select sum(bv.balance) from bill_view bv join deals d on d.id = bv.deal_id
                    where bv.overdue ${dc.sql}), 0) as overdue,
         (select count(*)::int from bill_view bv join deals d on d.id = bv.deal_id where bv.overdue ${dc.sql}) as overdue_bills,
         (select round(sum((p.received_on - coalesce(i.pi_sent_on, i.pi_date)) * p.amount) / nullif(sum(p.amount), 0), 0)
            from payments p join invoices i on i.id = p.invoice_id join deals d on d.id = i.deal_id
           where p.received_on between ${from} and ${to} ${dc.sql}) as avg_days_to_pay`,
      dc.params,
    ),

    // Health of live deals, by count and by monthly value.
    query<{ health: string; deals: number; mrr: string }>(
      actor,
      `select coalesce(d.health::text, 'none') as health, count(*)::int as deals,
              coalesce(sum(d.monthly_value), 0) as mrr
         from deal_view d
        where not d.stage_is_terminal and d.archived_at is null ${dc.sql}
        group by 1`,
      dc.params,
    ),
  ]);

  const r = retention[0];
  const start = Number(r.start_mrr);
  return {
    period: period[0],
    mrr: mrr[0],
    trend: trend.map((t) => ({ month: t.month, mrr: Number(t.mrr) })),
    grr: start > 0 ? Number(r.kept) / start : null,
    nrr: start > 0 ? Number(r.end_mrr) / start : null,
    retentionClients: r.clients,
    pilots: pilots[0],
    expansion,
    renewals,
    collections: collections[0],
    health,
  };
}
