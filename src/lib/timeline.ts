import 'server-only';
import { asActor, type Profile } from './auth';
import { query } from './db';
import { inr, istDate } from './format';

/*
  One history per deal, like a CRM record timeline: emails grouped into threads,
  calls, meetings and notes, questions with their answers, and every change
  from the audit log written as a sentence. Plus what is scheduled next.
*/

export type TimelineKind = 'email' | 'conversation' | 'note' | 'question' | 'task' | 'change';

type Person = string | null;

export type EmailMessage = {
  id: string;
  at: string;
  direction: string | null;
  participants: string[];
  summary: string;
  mailbox: string | null;
  /** Not filed on any deal: shown on every deal of the client until someone files it. */
  unfiled: boolean;
};

export type TimelineItem =
  | { kind: 'email'; key: string; at: string; subject: string; messages: EmailMessage[]; mailboxes: string[] }
  | {
      kind: 'conversation' | 'note';
      key: string;
      at: string;
      channel: string;
      direction: string | null;
      summary: string;
      participants: string[];
      by: Person;
      nextStep: string | null;
    }
  | {
      kind: 'question';
      key: string;
      id: string;
      at: string;
      anchor: string;
      anchorNote: string | null;
      body: string;
      by: Person;
      byId: string | null;
      to: Person;
      toId: string | null;
      status: 'open' | 'answered' | 'resolved';
      replies: { id: string; at: string; body: string; by: Person }[];
    }
  | { kind: 'task' | 'change'; key: string; at: string; title: string; detail: string | null; by: Person; reason: string | null; tone: 'neutral' | 'good' | 'bad' | 'warn' | 'brand' };

export type Upcoming = { key: string; date: string; title: string; detail: string | null; who: Person; overdue: boolean; kind: 'task' | 'next_step' | 'scheduled' | 'renewal' };

export const ANCHORS: { key: string; label: string }[] = [
  { key: 'general', label: 'The deal in general' },
  { key: 'stage', label: 'Stage and progress' },
  { key: 'next_step', label: 'Next step' },
  { key: 'criteria', label: 'Success criteria' },
  { key: 'snapshot', label: 'Deal details' },
  { key: 'billing', label: 'Billing' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'usage', label: 'Usage' },
  { key: 'timeline', label: 'An email or conversation' },
];
export const anchorLabel = (k: string) => ANCHORS.find((a) => a.key === k)?.label ?? k;

const FIELD: Record<string, string> = {
  title: 'title', code: 'code', monthly_value: 'monthly value', contract_value: 'contract value',
  intern_owner: 'owner', next_step: 'next step', next_step_due: 'next step due', start_date: 'start date',
  end_date: 'end date', term_months: 'term', product: 'product', category: 'category',
  commercial_model: 'commercial model', blocked_on: 'blocked on', blocker_note: 'blocker',
  health_reason: 'health reason', close_reason: 'close reason', context_doc_url: 'context doc',
  sc_business_outcome: 'business outcome', sc_targets: 'targets', sc_leading_indicators: 'leading indicators',
  sc_judged_by: 'judged by', sc_failure_line: 'failure line', sc_decision_statement: 'decision statement',
  billing_account_id: 'bill-to party', projects: 'projects', parent_deal_id: 'parent deal',
  crm_required: 'CRM integration required',
};
const QUIET = new Set([
  'stage_entered_at', 'health_updated_at', 'blocked_since', 'closed_at', 'won_at', 'id', 'client_id',
  'stage', 'health', 'archived_at', 'archive_reason', 'created_by', 'updated_by', 'crm_started_at',
]);
const MONEY = new Set(['monthly_value', 'contract_value', 'amount', 'total']);

/** Postgres hands back Date objects for timestamps; the page wants ISO strings. */
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

const normSubject = (s: string) =>
  s.replace(/^\s*((re|fwd?|fw)\s*:\s*)+/i, '').replace(/\s+/g, ' ').trim().toLowerCase();

type Act = {
  id: string; entity_type: string; entity_id: string; action: string; changes: Record<string, [unknown, unknown]> | null;
  reason: string | null; created_at: string; actor_name: string | null;
};

export async function dealTimeline(me: Profile, dealId: string) {
  const actor = asActor(me);
  const [deal, stages, people, interactions, acts, questions, replies, tasks, bills] = await Promise.all([
    query<{ category: string; next_step: string | null; next_step_due: string | null; end_date: string | null;
            owner: string | null; terminal: boolean }>(actor,
      `select d.category, d.next_step, d.next_step_due, d.end_date, p.name as owner, s.is_terminal as terminal
         from deals d join stages s on s.category = d.category and s.key = d.stage
         left join profiles p on p.id = d.intern_owner where d.id = $1`, [dealId]),
    query<{ category: string; key: string; label: string }>(actor, 'select category, key, label from stages'),
    query<{ id: string; name: string }>(actor, 'select id, name from profiles'),
    query<{ id: string; channel: string; occurred_at: string; participants: string[] | null; summary: string;
            subject: string | null; direction: string | null; mailbox: string | null; thread_ref: string | null;
            next_step: string | null; by: string | null; deal_id: string | null }>(actor,
      `select i.id, i.channel, i.occurred_at, i.participants, i.summary, i.subject, i.direction, i.mailbox, i.deal_id,
              i.thread_ref, i.next_step, p.name as by
         from interactions i left join profiles p on p.id = i.logged_by
        where i.deal_id = $1
           -- Client email that could not be pinned to one deal still belongs in its history.
           or (i.deal_id is null and i.channel = 'email' and i.client_id = (select client_id from deals where id = $1))
        order by i.occurred_at desc limit 500`, [dealId]),
    query<Act>(actor,
      `select a.id::text, a.entity_type, a.entity_id, a.action, a.changes, a.reason, a.created_at, p.name as actor_name
         from activity a left join profiles p on p.id = a.actor
        where a.deal_id = $1 and a.undone_at is null
          and a.entity_type not in ('questions', 'question_replies', 'interactions')
        order by a.id desc limit 400`, [dealId]),
    query<{ id: string; created_at: string; anchor: string; anchor_note: string | null; body: string; status: 'open' | 'answered' | 'resolved';
            by: string | null; by_id: string | null; to_name: string | null; to_id: string | null }>(actor,
      `select q.id, q.created_at, q.anchor, q.anchor_note, q.body, q.status, a.name as by, q.created_by as by_id,
              t.name as to_name, q.asked_to as to_id
         from questions q left join profiles a on a.id = q.created_by left join profiles t on t.id = q.asked_to
        where q.deal_id = $1`, [dealId]),
    query<{ id: string; question_id: string; created_at: string; body: string; by: string | null }>(actor,
      `select r.id, r.question_id, r.created_at, r.body, p.name as by
         from question_replies r left join profiles p on p.id = r.created_by
        where r.deal_id = $1 order by r.created_at`, [dealId]),
    query<{ id: string; title: string; due_date: string | null; status: string; owner: string | null }>(actor,
      `select t.id, t.title, t.due_date, t.status, p.name as owner
         from tasks t left join profiles p on p.id = t.owner where t.deal_id = $1`, [dealId]),
    query<{ id: string; pi_number: string | null }>(actor, 'select id, pi_number from invoices where deal_id = $1', [dealId]),
  ]);
  for (const r of interactions) r.occurred_at = iso(r.occurred_at);
  for (const r of acts) r.created_at = iso(r.created_at);
  for (const r of questions) r.created_at = iso(r.created_at);
  for (const r of replies) r.created_at = iso(r.created_at);
  const d = deal[0];
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const billName = new Map(bills.map((b) => [b.id, b.pi_number ? `PI ${b.pi_number}` : 'a bill']));
  const stageLabel = (cat: string | undefined, key: unknown) =>
    stages.find((s) => s.key === key && (!cat || s.category === cat))?.label ??
    RETIRED_STAGES[String(key)] ?? String(key ?? '—');

  const now = Date.now();
  const items: TimelineItem[] = [];
  const upcoming: Upcoming[] = [];

  // ---- emails, grouped into conversations
  const threads = new Map<string, Extract<TimelineItem, { kind: 'email' }>>();
  for (const i of interactions) {
    if (new Date(i.occurred_at).getTime() > now) {
      upcoming.push({ key: `i-${i.id}`, date: i.occurred_at, title: `${cap(i.channel)} scheduled`, detail: i.summary,
                      who: i.by, overdue: false, kind: 'scheduled' });
      continue;
    }
    if (i.channel === 'email') {
      const subject = i.subject ?? i.summary.split('\n')[0].slice(0, 120);
      const key = `t-${normSubject(subject) || i.thread_ref || i.id}`;
      const msg = { id: i.id, at: i.occurred_at, direction: i.direction, participants: i.participants ?? [],
                    summary: i.summary, mailbox: i.mailbox, unfiled: i.deal_id === null };
      const t = threads.get(key);
      if (t) {
        t.messages.push(msg);
        t.subject = subject; // newest first, so this ends as the opening email's subject
        if (i.mailbox && !t.mailboxes.includes(i.mailbox)) t.mailboxes.push(i.mailbox);
      } else {
        const item = { kind: 'email' as const, key, at: i.occurred_at, subject, messages: [msg],
                       mailboxes: i.mailbox ? [i.mailbox] : [] };
        threads.set(key, item);
        items.push(item);
      }
      continue;
    }
    items.push({
      kind: i.channel === 'note' ? 'note' : 'conversation', key: `i-${i.id}`, at: i.occurred_at, channel: i.channel,
      direction: i.direction, summary: i.summary, participants: i.participants ?? [], by: i.by, nextStep: i.next_step,
    });
  }
  // Oldest message first inside a thread; the thread sits at its latest message.
  for (const t of threads.values()) {
    t.messages.sort((a, b) => a.at.localeCompare(b.at));
    t.at = t.messages[t.messages.length - 1].at;
  }

  // ---- questions
  for (const q of questions) {
    items.push({
      kind: 'question', key: `q-${q.id}`, id: q.id, at: q.created_at, anchor: q.anchor, anchorNote: q.anchor_note,
      body: q.body, by: q.by, byId: q.by_id, to: q.to_name, toId: q.to_id, status: q.status,
      replies: replies.filter((r) => r.question_id === q.id).map((r) => ({ id: r.id, at: r.created_at, body: r.body, by: r.by })),
    });
  }

  // ---- the audit log, as sentences
  const val = (k: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—';
    if (MONEY.has(k)) return inr(v as string);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (k === 'intern_owner' || k === 'owner') return nameOf.get(String(v)) ?? '—';
    if (/_date$|_due$/.test(k)) return istDate(String(v));
    if (Array.isArray(v)) return v.join(', ');
    const s = String(v);
    return s.length > 80 ? s.slice(0, 80) + '…' : s;
  };
  // Ids and uuids mean nothing to a reader (the record they point at is the page
  // they're on); a new value has no "before", so it reads as "field: value".
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const fieldList = (c: Record<string, [unknown, unknown]>) =>
    Object.entries(c)
      .filter(([k, [, b]]) => !QUIET.has(k) && k !== 'id' && !k.endsWith('_id') && !UUID.test(String(b ?? '')))
      .map(([k, [a, b]]) =>
        a === null || a === undefined
          ? `${FIELD[k] ?? k.replaceAll('_', ' ')}: ${val(k, b)}`
          : `${FIELD[k] ?? k.replaceAll('_', ' ')}: ${val(k, a)} → ${val(k, b)}`);

  for (const a of acts) {
    const c = a.changes ?? {};
    const base = { key: `a-${a.id}`, at: a.created_at, by: a.actor_name, reason: a.reason };
    if (a.entity_type === 'deals') {
      if (a.action === 'create') {
        items.push({ ...base, kind: 'change', tone: 'good', title: `Deal created in ${stageLabel(String(c.category?.[1] ?? d?.category), c.stage?.[1])}`, detail: null });
      } else if (a.action === 'archive') {
        items.push({ ...base, kind: 'change', tone: 'bad', title: 'Deal archived', detail: null });
      } else {
        if (c.stage) {
          const cat = c.category ? String(c.category[1]) : d?.category;
          const fromCat = c.category ? String(c.category[0]) : d?.category;
          items.push({ ...base, key: `${base.key}-s`, kind: 'change', tone: 'brand',
            title: c.category
              ? `Moved from ${cap(fromCat ?? '')} to ${cap(cat ?? '')}, ${stageLabel(cat, c.stage[1])}`
              : `Stage: ${stageLabel(cat, c.stage[0])} → ${stageLabel(cat, c.stage[1])}`,
            detail: c.close_reason?.[1] ? String(c.close_reason[1]) : null });
        }
        if (c.health) {
          items.push({ ...base, key: `${base.key}-h`, kind: 'change', tone: c.health[1] === 'red' ? 'bad' : c.health[1] === 'green' ? 'good' : 'warn',
            title: `Health set to ${c.health[1] ?? 'none'}`, detail: c.health_reason?.[1] ? String(c.health_reason[1]) : null });
        }
        if (c.blocked_on) {
          items.push({ ...base, key: `${base.key}-b`, kind: 'change', tone: c.blocked_on[1] ? 'warn' : 'good',
            title: c.blocked_on[1] ? `Marked stuck, waiting on ${BLOCKER_LABEL[String(c.blocked_on[1])] ?? c.blocked_on[1]}` : 'No longer stuck',
            detail: c.blocker_note?.[1] ? String(c.blocker_note[1]) : null });
        }
        const rest = fieldList(Object.fromEntries(Object.entries(c).filter(([k]) =>
          !['blocked_on', 'blocker_note', 'health_reason', 'close_reason', 'category'].includes(k))));
        if (rest.length) {
          items.push({ ...base, key: `${base.key}-f`, kind: 'change', tone: 'neutral',
            title: rest.length === 1 ? `Changed ${rest[0].split(':')[0]}` : `Changed ${rest.length} fields`, detail: rest.join('\n') });
        }
      }
    } else if (a.entity_type === 'tasks') {
      const title = String(c.title?.[1] ?? taskTitle.get(a.entity_id) ?? 'a task');
      if (a.action === 'create') {
        items.push({ ...base, kind: 'task', tone: 'neutral', title: `Task added: ${title}`,
          detail: [c.owner?.[1] ? `for ${val('owner', c.owner[1])}` : null, c.due_date?.[1] ? `due ${istDate(String(c.due_date[1]))}` : null].filter(Boolean).join(', ') || null });
      } else if (c.status?.[1] === 'done') {
        items.push({ ...base, kind: 'task', tone: 'good', title: `Task done: ${title}`, detail: null });
      } else if (c.status) {
        items.push({ ...base, kind: 'task', tone: 'neutral', title: `Task ${String(c.status[1]).replaceAll('_', ' ')}: ${title}`, detail: null });
      } else {
        const f = fieldList(c);
        if (f.length) items.push({ ...base, kind: 'task', tone: 'neutral', title: `Task changed: ${title}`, detail: f.join('\n') });
      }
    } else if (a.entity_type === 'invoices') {
      const name = billName.get(a.entity_id) ?? 'a bill';
      if (a.action === 'create') items.push({ ...base, kind: 'change', tone: 'brand', title: `Bill raised: ${name}`, detail: c.amount?.[1] ? inr(c.amount[1] as string) : null });
      else {
        const f = fieldList(c);
        if (f.length) items.push({ ...base, kind: 'change', tone: 'neutral', title: `Bill updated: ${name}`, detail: f.join('\n') });
      }
    } else if (a.entity_type === 'payments' && a.action === 'create') {
      items.push({ ...base, kind: 'change', tone: 'good', title: `Payment received: ${inr(c.amount?.[1] as string)}`, detail: null });
    } else if (a.entity_type === 'playbook_runs') {
      if (a.action === 'create') items.push({ ...base, kind: 'task', tone: 'brand', title: 'Playbook started', detail: null });
      else if (c.status) items.push({ ...base, kind: 'task', tone: c.status[1] === 'completed' ? 'good' : 'neutral', title: `Playbook ${c.status[1]}`, detail: null });
    } else if (a.entity_type === 'line_items' && a.action === 'create') {
      const qty = c.quantity?.[1], unit = c.unit?.[1], rate = c.rate?.[1], amount = c.amount?.[1];
      items.push({ ...base, kind: 'change', tone: 'neutral',
        title: `Added line item: ${String(c.description?.[1] ?? '')}`.trim().replace(/:$/, ''),
        detail: [qty !== undefined && qty !== null ? `${qty}${unit ? ` ${unit}` : ''}` : null,
                 rate ? `× ${inr(rate as string)}` : null,
                 amount ? `= ${inr(amount as string)}` : null].filter(Boolean).join(' ') || null });
    } else if (a.entity_type === 'deal_contacts') {
      items.push({ ...base, kind: 'change', tone: 'neutral',
        title: c.removed_at?.[1] ? 'Contact unlinked from the deal' : 'Contact linked to the deal', detail: null });
    } else {
      const f = fieldList(c);
      items.push({ ...base, kind: 'change', tone: 'neutral',
        title: `${a.action === 'create' ? 'Added' : 'Changed'} ${a.entity_type.replaceAll('_', ' ').replace(/s$/, '')}`,
        detail: f.length ? f.join('\n') : null });
    }
  }

  items.sort((a, b) => b.at.localeCompare(a.at));

  // ---- what is next
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'cancelled' || !t.due_date) continue;
    upcoming.push({ key: `t-${t.id}`, date: t.due_date, title: t.title, detail: null, who: t.owner,
                    overdue: new Date(t.due_date + 'T23:59:59+05:30').getTime() < now, kind: 'task' });
  }
  if (d && !d.terminal && d.next_step && d.next_step_due && !tasks.some((t) => t.title === d.next_step && t.status !== 'done')) {
    upcoming.push({ key: 'next', date: d.next_step_due, title: d.next_step, detail: 'Next step', who: d.owner,
                    overdue: new Date(d.next_step_due + 'T23:59:59+05:30').getTime() < now, kind: 'next_step' });
  }
  if (d?.end_date && !d.terminal) {
    const days = (new Date(d.end_date).getTime() - now) / 86400000;
    if (days >= 0 && days <= 90) upcoming.push({ key: 'end', date: d.end_date, title: 'Term ends', detail: 'Renewal decision due', who: d.owner, overdue: false, kind: 'renewal' });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  const counts: Record<TimelineKind | 'all', number> = { all: items.length, email: 0, conversation: 0, note: 0, question: 0, task: 0, change: 0 };
  for (const i of items) counts[i.kind]++;
  return { items, upcoming, counts };
}

// Pilot stages that no longer exist, so older history still reads well.
const RETIRED_STAGES: Record<string, string> = {
  kickoff: 'Kickoff (old stage)',
  setup: 'Setup (old stage)',
  live: 'Live (old stage)',
  readout: 'Readout (old stage)',
};

export const BLOCKER_LABEL: Record<string, string> = {
  us: 'us',
  client: 'the client',
  product: 'product or tech',
  data: 'data',
  commercial: 'commercials',
};

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
