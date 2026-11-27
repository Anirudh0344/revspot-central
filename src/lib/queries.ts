import 'server-only';
import { query } from './db';
import { asActor, type Profile } from './auth';
import type { ClientRow, DealRow } from './types';

export type Stage = {
  category: string;
  key: string;
  label: string;
  position: number;
  max_days: number | null;
  is_terminal: boolean;
  exit_requirements: string[];
};

export async function stages(me: Profile, category?: string): Promise<Stage[]> {
  return query<Stage>(
    asActor(me),
    `select * from stages ${category ? 'where category = $1::deal_category' : ''}
      order by category, position`,
    category ? [category] : [],
  );
}

export async function profiles(me: Profile) {
  return query<{ id: string; name: string; role: string }>(
    asActor(me),
    `select id, name, role from profiles where is_active order by
       case role when 'admin' then 0 when 'intern' then 1 when 'bot' then 2 else 3 end, name`,
  );
}

export async function clientList(
  me: Profile,
  f: { status?: string; health?: string; intern?: string; segment?: string; q?: string } = {},
): Promise<ClientRow[]> {
  const where: string[] = ['archived_at is null'];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace('?', `$${vals.length}`));
  };
  if (f.status) add('status = ?', f.status);
  if (f.health) add('health = ?::health', f.health);
  if (f.intern) add('intern_owner = ?::uuid', f.intern);
  if (f.segment) add('segment = ?', f.segment);
  if (f.q) add('name ilike ?', `%${f.q}%`);
  return query<ClientRow>(
    asActor(me),
    `select * from client_view where ${where.join(' and ')}
      order by case health when 'red' then 0 when 'amber' then 1 when 'green' then 2 else 3 end,
               coalesce(monthly_value,0) desc, name`,
    vals,
  );
}

export async function clientById(me: Profile, id: string): Promise<ClientRow | null> {
  const rows = await query<ClientRow>(asActor(me), 'select * from client_view where id = $1', [id]);
  return rows[0] ?? null;
}

export async function dealList(
  me: Profile,
  f: {
    category?: string;
    health?: string;
    intern?: string;
    product?: string;
    client?: string;
    stage?: string;
    q?: string;
    /** 'YYYY-MM': only deals added that month (India time). */
    month?: string;
    includeTerminal?: boolean;
  } = {},
): Promise<DealRow[]> {
  const where: string[] = ['archived_at is null'];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replaceAll('?', `$${vals.length}`));
  };
  if (f.category) add('category = ?::deal_category', f.category);
  if (f.health) add('health = ?::health', f.health);
  if (f.intern) add('intern_owner = ?::uuid', f.intern);
  if (f.product) add('product = ?', f.product);
  if (f.client) add('client_id = ?::uuid', f.client);
  if (f.stage) add('stage = ?', f.stage);
  if (f.q) add('(title ilike ? or client_name ilike ? or coalesce(code,\'\') ilike ?)', `%${f.q}%`);
  if (f.month) add("to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = ?", f.month);
  if (!f.includeTerminal) where.push('not stage_is_terminal');
  return query<DealRow>(
    asActor(me),
    `select * from deal_view where ${where.join(' and ')}
      order by case health when 'red' then 0 when 'amber' then 1 when 'green' then 2 else 3 end,
               stage_position, coalesce(monthly_value,0) desc`,
    vals,
  );
}

/** Every month that has a live deal added in it, oldest first, as 'YYYY-MM'. */
export async function dealMonths(me: Profile): Promise<string[]> {
  const rows = await query<{ m: string }>(
    asActor(me),
    `select distinct to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as m
       from deal_view where archived_at is null and not stage_is_terminal order by 1`,
  );
  return rows.map((r) => r.m);
}

export async function dealById(me: Profile, id: string): Promise<DealRow | null> {
  const isUuid = /^[0-9a-f-]{36}$/i.test(id);
  const rows = await query<DealRow>(
    asActor(me),
    isUuid ? 'select * from deal_view where id = $1' : 'select * from deal_view where code = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function lineItems(me: Profile, dealId: string) {
  return query<{
    id: string;
    description: string;
    unit: string | null;
    quantity: string;
    rate: string;
    amount: string;
    delivered_quantity: string;
    billing_trigger: string | null;
  }>(asActor(me), 'select * from line_items where deal_id = $1 order by created_at', [dealId]);
}

export async function tasksFor(
  me: Profile,
  opts: { dealId?: string; owner?: string; open?: boolean } = {},
) {
  const where: string[] = [];
  const vals: unknown[] = [];
  if (opts.dealId) {
    vals.push(opts.dealId);
    where.push(`t.deal_id = $${vals.length}`);
  }
  if (opts.owner) {
    vals.push(opts.owner);
    where.push(`t.owner = $${vals.length}`);
  }
  if (opts.open !== false) where.push(`t.status = 'open'`);
  return query<{
    id: string;
    title: string;
    due_date: string | null;
    status: string;
    deal_id: string | null;
    client_id: string | null;
    owner: string | null;
    owner_name: string | null;
    deal_title: string | null;
    client_name: string | null;
  }>(
    asActor(me),
    `select t.*, p.name owner_name, d.title deal_title, coalesce(c.name, dc.name) client_name
       from tasks t
       left join profiles p on p.id = t.owner
       left join deals d on d.id = t.deal_id
       left join clients c on c.id = t.client_id
       left join clients dc on dc.id = d.client_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by t.due_date nulls last, t.created_at`,
    vals,
  );
}

export type ActivityRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  changes: Record<string, [unknown, unknown]> | null;
  reason: string | null;
  created_at: string;
  undone_at: string | null;
  actor_name: string | null;
  actor_role: string | null;
  deal_id: string | null;
  deal_title: string | null;
  client_name: string | null;
};

export async function activityFor(
  me: Profile,
  opts: {
    dealId?: string;
    clientId?: string;
    actor?: string;
    action?: string;
    limit?: number;
    /** Only rows from the last N hours. */
    sinceHours?: number;
    /** Only rows from today, by the IST calendar. */
    todayIST?: boolean;
    botOnly?: boolean;
  } = {},
): Promise<ActivityRow[]> {
  const where: string[] = [];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    vals.push(v);
    where.push(sql.replace('?', `$${vals.length}`));
  };
  if (opts.dealId) add('a.deal_id = ?::uuid', opts.dealId);
  if (opts.clientId) add('a.client_id = ?::uuid', opts.clientId);
  if (opts.actor) add('a.actor = ?::uuid', opts.actor);
  if (opts.action) add('a.action = ?', opts.action);
  if (opts.sinceHours) add("a.created_at >= now() - (? || ' hours')::interval", opts.sinceHours);
  if (opts.todayIST)
    where.push(
      "a.created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata'",
    );
  if (opts.botOnly) where.push(`p.role = 'bot'`);
  vals.push(opts.limit ?? 50);
  return query<ActivityRow>(
    asActor(me),
    `select a.*, p.name actor_name, p.role actor_role, d.title deal_title, c.name client_name
       from activity a
       left join profiles p on p.id = a.actor
       left join deals d on d.id = a.deal_id
       left join clients c on c.id = a.client_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by a.id desc limit $${vals.length}`,
    vals,
  );
}

export async function healthHistory(me: Profile, dealId: string) {
  return query<{ health: string; reason: string; set_at: string; set_by_name: string | null }>(
    asActor(me),
    `select h.health, h.reason, h.set_at, p.name set_by_name
       from health_history h left join profiles p on p.id = h.set_by
      where h.deal_id = $1 order by h.set_at desc limit 8`,
    [dealId],
  );
}

export async function interactionsFor(
  me: Profile,
  opts: { dealId?: string; clientId?: string; limit?: number },
) {
  const where: string[] = [];
  const vals: unknown[] = [];
  if (opts.dealId) {
    vals.push(opts.dealId);
    where.push(`i.deal_id = $${vals.length}`);
  }
  if (opts.clientId) {
    vals.push(opts.clientId);
    where.push(`i.client_id = $${vals.length}`);
  }
  vals.push(opts.limit ?? 10);
  return query<{
    id: string;
    channel: string;
    occurred_at: string;
    summary: string;
    next_step: string | null;
    direction: string | null;
    participants: string[] | null;
    logged_by_name: string | null;
    deal_id: string | null;
    deal_title: string | null;
    subject: string | null;
  }>(
    asActor(me),
    `select i.*, p.name logged_by_name, d.title deal_title from interactions i
       left join profiles p on p.id = i.logged_by
       left join deals d on d.id = i.deal_id
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by i.occurred_at desc limit $${vals.length}`,
    vals,
  );
}

export async function contactsFor(me: Profile, clientId: string) {
  return query<{
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    role: string;
    last_contacted_at: string | null;
    notes: string | null;
  }>(
    asActor(me),
    'select * from contacts where client_id = $1 and archived_at is null order by role, name',
    [clientId],
  );
}

/** The people on one deal, decision makers first. */
export async function contactsForDeal(me: Profile, dealId: string) {
  return query<{
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    role: string;
    last_contacted_at: string | null;
  }>(
    asActor(me),
    `select c.id, c.name, c.title, c.email, c.role, c.last_contacted_at
       from deal_contacts dc join contacts c on c.id = dc.contact_id
      where dc.deal_id = $1 and dc.removed_at is null and c.archived_at is null
      order by case c.role when 'decision_maker' then 0 when 'champion' then 1
                           when 'day_to_day' then 2 when 'tech' then 3 when 'finance' then 4 else 5 end,
               c.name`,
    [dealId],
  );
}

export type WorkItem = {
  reason: string;
  deal_id: string;
  code: string | null;
  client_name: string;
  title: string;
  priority: number;
};

export async function botWorkQueue(me: Profile): Promise<WorkItem[]> {
  return query<WorkItem>(
    asActor(me),
    'select * from bot_work_queue order by priority, client_name, title',
  );
}

/** HM-1..HM-4: everything the 15-minute check-in needs, in one round trip. */
export async function homeScreen(me: Profile) {
  const [reds, dueToday, endingSoon, hygiene] = await Promise.all([
    query<DealRow>(
      asActor(me),
      `select * from deal_view
        where archived_at is null and not stage_is_terminal and health = 'red'
        order by coalesce(monthly_value,0) desc`,
    ),
    tasksFor(me, { owner: me.id, open: true }),
    query<DealRow>(
      asActor(me),
      `select * from deal_view
        where archived_at is null and category = 'pilot' and not stage_is_terminal
          and end_date is not null and end_date <= current_date + 14
        order by end_date`,
    ),
    query<WorkItem>(
      asActor(me),
      `select * from bot_work_queue
        where reason in ('missing_criteria','missing_next_step','stale_health','stale_stage')
        order by priority, client_name limit 40`,
    ),
  ]);
  return { reds, dueToday, endingSoon, hygiene };
}

export async function searchAll(me: Profile, q: string) {
  if (!q.trim()) return { clients: [], deals: [] };
  const [clients, deals] = await Promise.all([
    query<{ id: string; name: string }>(
      asActor(me),
      `select id, name from clients where archived_at is null and name ilike $1 order by name limit 8`,
      [`%${q}%`],
    ),
    query<{ id: string; code: string | null; title: string; client_name: string }>(
      asActor(me),
      `select id, code, title, client_name from deal_view
        where archived_at is null
          and (title ilike $1 or client_name ilike $1 or coalesce(code,'') ilike $1)
        order by client_name, title limit 12`,
      [`%${q}%`],
    ),
  ]);
  return { clients, deals };
}

/** The email domains Gmail sync uses to recognise this client's mail. */
export async function clientDomainsFor(me: Profile, clientId: string) {
  return query<{ id: string; domain: string; created_at: string; added_by: string | null }>(
    asActor(me),
    `select cd.id, cd.domain, cd.created_at, p.name as added_by
       from client_domains cd left join profiles p on p.id = cd.created_by
      where cd.client_id = $1 and cd.removed_at is null
      order by cd.domain`,
    [clientId],
  );
}
