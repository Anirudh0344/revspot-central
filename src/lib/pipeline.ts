import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';
import { dealList } from './queries';
import type { DealRow } from './types';
import { BLOCKER_LABEL } from './timeline';

/*
  Pilots and implementation in one place: every live pilot, every retention
  deal still onboarding, and for each one the reasons it is stuck, if any.
*/

export type Signal = {
  deal_id: string;
  blocked_on: string | null;
  blocker_note: string | null;
  blocked_since: string | null;
  last_touch_at: string | null;
  open_questions: number;
  oldest_open_question_at: string | null;
};

export type Reason = { key: string; text: string; severity: 'red' | 'amber' };
export type PipelineDeal = DealRow & { signal: Signal | null; reasons: Reason[]; idleDays: number | null };

const QUIET_DAYS = 7;
const QUESTION_DAYS = 2;

const daysSince = (at: string | null) => (at ? Math.floor((Date.now() - new Date(at).getTime()) / 86400000) : null);

function reasonsFor(d: DealRow, s: Signal | null): Reason[] {
  const out: Reason[] = [];
  if (s?.blocked_on) out.push({ key: 'blocked', severity: 'red', text: `Waiting on ${BLOCKER_LABEL[s.blocked_on]}: ${s.blocker_note}` });
  if (!d.intern_owner) out.push({ key: 'owner', severity: 'red', text: 'No owner' });
  if (d.stage_flag !== 'ok')
    out.push({ key: 'slow', severity: d.stage_flag === 'red' ? 'red' : 'amber',
               text: `${d.days_in_stage} days in ${d.stage_label} (aim: ${d.stage_max_days})` });
  if (!d.next_step) out.push({ key: 'next', severity: 'red', text: 'No next step' });
  else if (d.next_step_overdue) {
    const late = daysSince(d.next_step_due);
    out.push({ key: 'next', severity: (late ?? 0) > 3 ? 'red' : 'amber', text: `Next step ${late} ${late === 1 ? 'day' : 'days'} overdue` });
  }
  const idle = daysSince(s?.last_touch_at ?? d.created_at);
  if (idle !== null && idle >= QUIET_DAYS) out.push({ key: 'quiet', severity: idle >= QUIET_DAYS * 2 ? 'red' : 'amber', text: `Nothing logged for ${idle} days` });
  const q = daysSince(s?.oldest_open_question_at ?? null);
  if (q !== null && q >= QUESTION_DAYS) out.push({ key: 'question', severity: 'amber', text: `A question unanswered for ${q} days` });
  if (d.category === 'pilot' && d.crm_required === null)
    out.push({ key: 'crm', severity: 'amber', text: 'CRM integration required? Not answered' });
  if (d.health === 'red') out.push({ key: 'health', severity: 'red', text: `Health red${d.health_reason ? `: ${d.health_reason}` : ''}` });
  return out;
}

export type PipelineFilters = { owner?: string; client?: string; stuck?: boolean };

export async function pipeline(me: Profile, f: PipelineFilters) {
  const actor = asActor(me);
  const base = { intern: f.owner, client: f.client };
  const [pilots, retention, signals, outcomes, stageRows] = await Promise.all([
    dealList(me, { ...base, category: 'pilot' }),
    dealList(me, { ...base, category: 'retention', stage: 'onboarding' }),
    query<Signal>(actor, 'select * from deal_signals'),
    // What became of pilots that closed in the last 90 days, and how long they took.
    query<{ converted: number; stopped: number; started: number; avg_days: string | null }>(
      actor,
      `select count(*) filter (where stage = 'converted' and closed_at >= now() - interval '90 days')::int as converted,
              count(*) filter (where stage = 'stopped' and closed_at >= now() - interval '90 days')::int as stopped,
              count(*) filter (where created_at >= now() - interval '90 days')::int as started,
              round(avg(extract(epoch from closed_at - created_at) / 86400)
                    filter (where stage = 'converted' and closed_at >= now() - interval '90 days'), 0) as avg_days
         from deals where category = 'pilot' and archived_at is null
          ${f.owner ? 'and intern_owner = $1' : ''} ${f.client ? `and client_id = $${f.owner ? 2 : 1}` : ''}`,
      [f.owner, f.client].filter(Boolean),
    ),
    query<{ key: string; label: string; position: number; max_days: number | null; category: string }>(
      actor,
      `select key, label, position, max_days, category::text from stages
        where (category = 'pilot' and not is_terminal) or (category = 'retention' and key = 'onboarding')
        order by case category when 'pilot' then 0 else 1 end, position`,
    ),
  ]);

  const byDeal = new Map(signals.map((s) => [s.deal_id, s]));
  const enrich = (d: DealRow): PipelineDeal => {
    const s = byDeal.get(d.id) ?? null;
    return { ...d, signal: s, reasons: reasonsFor(d, s), idleDays: daysSince(s?.last_touch_at ?? d.created_at) };
  };
  let deals = [...pilots, ...retention].map(enrich);
  const all = deals;
  if (f.stuck) deals = deals.filter((d) => d.reasons.length > 0);

  const columns = stageRows.map((s) => ({
    key: s.category === 'retention' ? 'impl:onboarding' : s.key,
    stageKey: s.key,
    category: s.category,
    label: s.category === 'retention' ? 'Implementation' : s.label,
    maxDays: s.max_days,
    deals: deals.filter((d) => d.stage === s.key && d.category === s.category),
  }));

  const stuck = all.filter((d) => d.reasons.length > 0);
  const owners = new Map<string, { id: string | null; name: string; deals: number; stuck: number; overdue: number; questions: number; idle: number }>();
  for (const d of all) {
    const k = d.intern_owner ?? 'none';
    const o = owners.get(k) ?? { id: d.intern_owner, name: d.intern_owner_name ?? 'No owner', deals: 0, stuck: 0, overdue: 0, questions: 0, idle: 0 };
    o.deals++;
    if (d.reasons.length) o.stuck++;
    if (d.next_step_overdue || !d.next_step) o.overdue++;
    o.questions += d.signal?.open_questions ?? 0;
    o.idle = Math.max(o.idle, d.idleDays ?? 0);
    owners.set(k, o);
  }

  const reasonCounts = new Map<string, number>();
  for (const d of stuck) for (const r of d.reasons) {
    const label = r.key === 'blocked' ? `Waiting on ${BLOCKER_LABEL[d.signal!.blocked_on!]}` : REASON_LABEL[r.key];
    reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  }

  const o = outcomes[0];
  return {
    columns,
    deals,
    stuck: stuck.sort((a, b) => sev(b) - sev(a)),
    totals: {
      pilots: all.filter((d) => d.category === 'pilot').length,
      implementation: all.filter((d) => d.category === 'retention').length,
      stuck: stuck.length,
      noOwner: all.filter((d) => !d.intern_owner).length,
      questions: all.reduce((n, d) => n + (d.signal?.open_questions ?? 0), 0),
      crmNeeded: all.filter((d) => d.category === 'pilot' && d.crm_required).length,
      crmUnanswered: all.filter((d) => d.category === 'pilot' && d.crm_required === null).length,
      inCrm: all.filter((d) => d.stage === 'crm_integration').length,
      testing: all.filter((d) => d.stage === 'agent_testing' || d.stage === 'customer_testing').length,
      feedback: all.filter((d) => d.stage.startsWith('feedback_')).length,
    },
    outcomes: {
      started: o.started,
      converted: o.converted,
      stopped: o.stopped,
      rate: o.converted + o.stopped > 0 ? o.converted / (o.converted + o.stopped) : null,
      avgDays: o.avg_days === null ? null : Number(o.avg_days),
    },
    byStage: columns.map((c) => {
      const inCol = all.filter((d) => d.stage === c.stageKey && d.category === c.category);
      return {
        label: c.label,
        deals: inCol.length,
        over: inCol.filter((d) => d.stage_flag !== 'ok').length,
        stuck: inCol.filter((d) => d.reasons.length > 0).length,
        avgDays: inCol.length ? Math.round(inCol.reduce((n, d) => n + d.days_in_stage, 0) / inCol.length) : null,
        maxDays: c.maxDays,
      };
    }),
    byOwner: [...owners.values()].sort((a, b) => (a.id ? 1 : 0) - (b.id ? 1 : 0) || b.stuck - a.stuck),
    byReason: [...reasonCounts.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
  };
}

const sev = (d: PipelineDeal) => d.reasons.reduce((n, r) => n + (r.severity === 'red' ? 3 : 1), 0);

const REASON_LABEL: Record<string, string> = {
  owner: 'No owner',
  slow: 'Over time in stage',
  next: 'Next step missing or overdue',
  quiet: `Nothing logged for ${QUIET_DAYS}+ days`,
  question: 'Unanswered question',
  health: 'Health red',
  crm: 'CRM question not answered',
};
