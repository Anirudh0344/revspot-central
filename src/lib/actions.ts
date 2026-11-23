'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireProfile, asActor, DEV_PROFILE_COOKIE, devAuthEnabled } from './auth';
import { SESSION_COOKIE } from './session';
import { query, write, tx, readableError } from './db';
import { alertHealthRed } from './alerts';

export type Result = { ok: true; id?: string } | { ok: false; error: string };

const ok = (id?: string): Result => ({ ok: true, id });
const fail = (e: unknown): Result => ({ ok: false, error: readableError(e) });

const str = (f: FormData, k: string): string | null => {
  const v = f.get(k);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
};
const num = (f: FormData, k: string): number | null => {
  const v = str(f, k);
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/* ------------------------------------------------------------------ clients */

export async function createClientAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const name = str(f, 'name');
  if (!name) return { ok: false, error: 'A client needs a name.' };
  try {
    const rows = await write<{ id: string }>(
      asActor(me),
      str(f, 'reason') ?? 'Client created',
      `insert into clients (name, legal_name, gstin, segment, city, intern_owner, whitespace_notes)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [name, str(f, 'legal_name'), str(f, 'gstin'), str(f, 'segment'), str(f, 'city'),
       str(f, 'intern_owner'), str(f, 'whitespace_notes')],
    );
    revalidatePath('/clients');
    return ok(rows[0].id);
  } catch (e) {
    return fail(e);
  }
}

const CLIENT_FIELDS = ['name','legal_name','gstin','segment','city','intern_owner','whitespace_notes'];

export async function updateClientAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const k of CLIENT_FIELDS) {
    if (f.has(k)) {
      vals.push(str(f, k));
      sets.push(`${k} = $${vals.length}`);
    }
  }
  if (!sets.length) return ok(id);
  vals.push(id);
  try {
    await write(asActor(me), str(f, 'reason') ?? 'Client updated',
      `update clients set ${sets.join(', ')} where id = $${vals.length}`, vals);
    revalidatePath(`/clients/${id}`);
    revalidatePath('/clients');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function archiveClientAction(id: string, reason: string): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin' && me.role !== 'bot')
    return { ok: false, error: 'Only an admin can archive a client.' };
  try {
    await write(asActor(me), reason || 'Client archived',
      'update clients set archived_at = now() where id = $1', [id]);
    revalidatePath('/clients');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------------------------------------------- contacts */

export async function createContactAction(clientId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const name = str(f, 'name');
  if (!name) return { ok: false, error: 'A contact needs a name.' };
  try {
    const email = str(f, 'email');
    await tx(asActor(me), 'Contact added', async (c) => {
      await c.query(
        `insert into contacts (client_id, name, title, email, phone, whatsapp, role, notes)
         values ($1,$2,$3,$4,$5,$6,coalesce($7,'other')::contact_role,$8)`,
        [clientId, name, str(f, 'title'), email, str(f, 'phone'), str(f, 'whatsapp'),
         str(f, 'role'), str(f, 'notes')],
      );
      // CL-8: remember the email domain so Gmail sync and the bot can map mail to a client
      if (email && email.includes('@')) {
        const domain = email.split('@')[1].toLowerCase();
        if (!['gmail.com','outlook.com','yahoo.com','hotmail.com','revspot.ai'].includes(domain)) {
          await c.query(
            'insert into client_domains (client_id, domain) values ($1,$2) on conflict do nothing',
            [clientId, domain]);
        }
      }
    });
    revalidatePath(`/clients/${clientId}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function archiveContactAction(id: string, clientId: string): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'Contact archived',
      'update contacts set archived_at = now() where id = $1', [id]);
    revalidatePath(`/clients/${clientId}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------------------------------------------- deals */

export async function createDealAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const clientId = str(f, 'client_id');
  const title = str(f, 'title');
  const category = str(f, 'category');
  if (!clientId || !title || !category)
    return { ok: false, error: 'Client, title and category are required.' };
  try {
    const stage =
      str(f, 'stage') ??
      (await query<{ key: string }>(asActor(me),
        'select key from stages where category = $1::deal_category order by position limit 1',
        [category]))[0]?.key;

    // DL-7: expansion deals need a green retention deal on the client
    if (category === 'expansion') {
      const green = await query<{ n: string }>(asActor(me),
        `select count(*) n from deals d join stages s on s.category=d.category and s.key=d.stage
          where d.client_id=$1 and d.category='retention' and d.health='green'
            and not s.is_terminal and d.archived_at is null`, [clientId]);
      if (Number(green[0].n) === 0 && !str(f, 'override_reason'))
        return { ok: false, error:
          'This client has no green retention deal. Give an override reason to raise an expansion anyway.' };
    }

    const rows = await write<{ id: string }>(
      asActor(me),
      str(f, 'reason') ?? str(f, 'override_reason') ?? 'Deal created',
      `insert into deals (client_id, code, title, product, projects, category, stage,
                          parent_deal_id, commercial_model, term_months, monthly_value,
                          contract_value, start_date, end_date, next_step, next_step_due,
                          intern_owner, context_doc_url,
                          sc_business_outcome, sc_targets, sc_leading_indicators,
                          sc_judged_by, sc_failure_line, sc_decision_statement)
       values ($1,$2,$3,$4,$5,$6::deal_category,$7,$8,$9::commercial_model,$10,$11,$12,$13,$14,
               $15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       returning id`,
      [clientId, str(f, 'code'), title, str(f, 'product'),
       str(f, 'projects')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
       category, stage, str(f, 'parent_deal_id'), str(f, 'commercial_model'),
       num(f, 'term_months'), num(f, 'monthly_value'), num(f, 'contract_value'),
       str(f, 'start_date'), str(f, 'end_date'), str(f, 'next_step'), str(f, 'next_step_due'),
       str(f, 'intern_owner'), str(f, 'context_doc_url'),
       str(f, 'sc_business_outcome'), str(f, 'sc_targets'), str(f, 'sc_leading_indicators'),
       str(f, 'sc_judged_by'), str(f, 'sc_failure_line'), str(f, 'sc_decision_statement')],
    );
    revalidatePath('/deals');
    revalidatePath(`/clients/${clientId}`);
    return ok(rows[0].id);
  } catch (e) {
    return fail(e);
  }
}

const DEAL_TEXT_FIELDS = [
  'title','product','code','next_step','context_doc_url','close_reason',
  'sc_business_outcome','sc_targets','sc_leading_indicators',
  'sc_judged_by','sc_failure_line','sc_decision_statement',
];
const DEAL_DATE_FIELDS = ['next_step_due','start_date','end_date'];
const DEAL_NUM_FIELDS = ['term_months','monthly_value','contract_value'];

export async function updateDealAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const sets: string[] = [];
  const vals: unknown[] = [];
  const push = (col: string, v: unknown, cast = '') => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}${cast}`);
  };
  for (const k of DEAL_TEXT_FIELDS) if (f.has(k)) push(k, str(f, k));
  for (const k of DEAL_DATE_FIELDS) if (f.has(k)) push(k, str(f, k), '::date');
  for (const k of DEAL_NUM_FIELDS) if (f.has(k)) push(k, num(f, k));
  if (f.has('intern_owner')) push('intern_owner', str(f, 'intern_owner'), '::uuid');
  if (f.has('commercial_model')) push('commercial_model', str(f, 'commercial_model'), '::commercial_model');
  if (f.has('projects'))
    push('projects', str(f, 'projects')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null, '::text[]');
  if (!sets.length) return ok(id);
  vals.push(id);
  try {
    await write(asActor(me), str(f, 'reason') ?? 'Deal updated',
      `update deals set ${sets.join(', ')} where id = $${vals.length}`, vals);
    revalidatePath(`/deals/${id}`);
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function setHealthAction(
  id: string, health: 'red' | 'amber' | 'green', reason: string,
): Promise<Result> {
  const me = await requireProfile();
  if (!reason?.trim()) return { ok: false, error: 'Health needs a reason.' };
  try {
    await write(asActor(me), `Health set to ${health}: ${reason}`,
      'update deals set health = $1::health, health_reason = $2 where id = $3',
      [health, reason.trim(), id]);
    if (health === 'red') await alertHealthRed(id, reason.trim(), me.name).catch(() => {});
    revalidatePath(`/deals/${id}`);
    revalidatePath('/');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function moveStageAction(
  id: string, stage: string, reason?: string, closeReason?: string,
): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), reason ?? `Moved to ${stage}`,
      `update deals set stage = $1,
              close_reason = coalesce(nullif($2,''), close_reason)
        where id = $3`,
      [stage, closeReason ?? '', id]);
    revalidatePath('/boards');
    revalidatePath(`/deals/${id}`);
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function convertPilotAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const reason = str(f, 'reason');
  if (!reason) return { ok: false, error: 'Converting a pilot needs a reason.' };
  try {
    const rows = await write<{ convert_pilot: string }>(
      asActor(me), reason,
      'select convert_pilot($1,$2,$3,$4::date,$5)',
      [id, num(f, 'term_months'), num(f, 'monthly_value'), str(f, 'start_date'), reason],
    );
    revalidatePath('/boards');
    revalidatePath(`/deals/${id}`);
    return ok(rows[0].convert_pilot);
  } catch (e) {
    return fail(e);
  }
}

export async function archiveDealAction(id: string, reason: string): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin' && me.role !== 'bot')
    return { ok: false, error: 'Only an admin can archive a deal.' };
  try {
    await write(asActor(me), reason || 'Deal archived',
      'update deals set archived_at = now() where id = $1', [id]);
    revalidatePath('/deals');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------------------------- line items */

export async function addLineItemAction(dealId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const description = str(f, 'description');
  if (!description) return { ok: false, error: 'A line item needs a description.' };
  try {
    await write(asActor(me), 'Line item added',
      `insert into line_items (deal_id, description, unit, quantity, rate, delivered_quantity, billing_trigger)
       values ($1,$2,$3,$4,$5,coalesce($6,0),$7)`,
      [dealId, description, str(f, 'unit'), num(f, 'quantity') ?? 0, num(f, 'rate') ?? 0,
       num(f, 'delivered_quantity'), str(f, 'billing_trigger')]);
    revalidatePath(`/deals/${dealId}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function setDeliveredAction(
  itemId: string, dealId: string, delivered: number,
): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'Delivered quantity updated',
      'update line_items set delivered_quantity = $1 where id = $2', [delivered, itemId]);
    revalidatePath(`/deals/${dealId}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------------------------------------------- tasks */

export async function createTaskAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const title = str(f, 'title');
  if (!title) return { ok: false, error: 'A task needs a title.' };
  try {
    await write(asActor(me), 'Task created',
      `insert into tasks (deal_id, client_id, title, owner, due_date)
       values ($1,$2,$3,coalesce($4, $5),$6::date)`,
      [str(f, 'deal_id'), str(f, 'client_id'), title, str(f, 'owner'), me.id, str(f, 'due_date')]);
    revalidatePath('/tasks');
    if (str(f, 'deal_id')) revalidatePath(`/deals/${str(f, 'deal_id')}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function completeTaskAction(
  id: string, nextStep?: string, nextStepDue?: string,
): Promise<Result> {
  const me = await requireProfile();
  try {
    await tx(asActor(me), 'Task completed', async (c) => {
      const { rows } = await c.query<{ deal_id: string | null }>(
        `update tasks set status='done', completed_at = now() where id = $1 returning deal_id`, [id]);
      const dealId = rows[0]?.deal_id;
      if (dealId && nextStep) {
        await c.query(
          'update deals set next_step = $1, next_step_due = $2::date where id = $3',
          [nextStep, nextStepDue ?? null, dealId]);
      }
    });
    revalidatePath('/tasks');
    revalidatePath('/');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------- interactions */

export async function logInteractionAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const summary = str(f, 'summary');
  const clientId = str(f, 'client_id');
  if (!summary || !clientId) return { ok: false, error: 'Client and summary are required.' };
  const dealId = str(f, 'deal_id');
  const nextStep = str(f, 'next_step');
  try {
    await tx(asActor(me), 'Interaction logged', async (c) => {
      await c.query(
        `insert into interactions (deal_id, client_id, channel, occurred_at, participants,
                                   summary, next_step, direction, logged_by)
         values ($1,$2,$3::channel,coalesce($4::timestamptz, now()),$5,$6,$7,$8,$9)`,
        [dealId, clientId, str(f, 'channel') ?? 'note', str(f, 'occurred_at'),
         str(f, 'participants')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
         summary, nextStep, str(f, 'direction') ?? 'outbound', me.id]);

      // CM-3: the contacts involved were contacted just now
      await c.query(
        `update contacts set last_contacted_at = now()
          where client_id = $1 and archived_at is null
            and ($2::text is null or name = any(string_to_array($2, ',')))`,
        [clientId, str(f, 'participants')]);

      // CM-1: a logged next step can become the deal's next step
      if (dealId && nextStep && str(f, 'apply_next_step') === 'on') {
        await c.query(
          'update deals set next_step = $1, next_step_due = coalesce($2::date, next_step_due) where id = $3',
          [nextStep, str(f, 'next_step_due'), dealId]);
      }
    });
    if (dealId) revalidatePath(`/deals/${dealId}`);
    revalidatePath(`/clients/${clientId}`);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------------------------------- undo */

export async function undoActivityAction(activityId: number, field?: string): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only an admin can undo a change.' };
  try {
    await write(asActor(me), `Undo of activity #${activityId}`,
      'select undo_activity($1,$2)', [activityId, field ?? null]);
    revalidatePath('/bot');
    revalidatePath('/');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* -------------------------------------------------- dev sign-in (no Supabase) */

export async function devSignIn(profileId: string): Promise<void> {
  if (!devAuthEnabled()) redirect('/login');
  const jar = await cookies();
  jar.set(DEV_PROFILE_COOKIE, profileId, { httpOnly: true, sameSite: 'lax', path: '/' });
  redirect('/');
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEV_PROFILE_COOKIE);
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

/* ------------------------------------------------------------------ search */

export async function searchAction(q: string) {
  const me = await requireProfile();
  const { searchAll } = await import('./queries');
  return searchAll(me, q);
}

/* ---------------------------------------------------------------- handover */

/** DL-14: one form, one pilot deal in stage handover with everything filled. */
export async function createHandoverAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const clientId = str(f, 'client_id');
  const title = str(f, 'title');
  if (!clientId || !title) return { ok: false, error: 'Client and deal title are required.' };
  const notes = [
    str(f, 'promises') ? `Promises: ${str(f, 'promises')}` : null,
    str(f, 'dependencies') ? `Dependencies: ${str(f, 'dependencies')}` : null,
    str(f, 'pocs') ? `POCs: ${str(f, 'pocs')}` : null,
  ].filter(Boolean).join('\n');
  try {
    const rows = await write<{ id: string }>(
      asActor(me), 'Pilot handover filed',
      `insert into deals (client_id, title, product, projects, category, stage,
                          commercial_model, monthly_value, conversion_price,
                          start_date, end_date, next_step, next_step_due, intern_owner,
                          sc_business_outcome, sc_judged_by, handover_notes)
       values ($1,$2,$3,$4,'pilot','handover',$5::commercial_model,$6,$7,$8::date,$9::date,
               coalesce($10,'Book kickoff with the decision maker'),
               coalesce($11::date, current_date + 3),$12,$13,$14,$15)
       returning id`,
      [clientId, title, str(f, 'product'),
       str(f, 'projects')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null,
       str(f, 'commercial_model'), num(f, 'monthly_value'), num(f, 'conversion_price'),
       str(f, 'start_date'), str(f, 'end_date'), str(f, 'next_step'), str(f, 'next_step_due'),
       str(f, 'intern_owner'), str(f, 'sc_business_outcome'), str(f, 'sc_judged_by'),
       notes || null],
    );
    revalidatePath('/boards/pilot');
    return ok(rows[0].id);
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------- extend a pilot, renew a deal */

/** An extended pilot is a live pilot with a new end date; there is no Extended stage. */
export async function extendPilotAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const endDate = str(f, 'end_date');
  const reason = str(f, 'reason');
  if (!endDate) return { ok: false, error: 'New end date is empty.' };
  if (!reason) return { ok: false, error: 'Extending a pilot needs a reason.' };
  try {
    await write(asActor(me), `Pilot extended to ${endDate}: ${reason}`,
      `update deals set stage = 'live', end_date = $1::date
        where id = $2 and category = 'pilot'`,
      [endDate, id]);
    revalidatePath(`/deals/${id}`);
    revalidatePath('/deals');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

/** Renewing puts a retention deal back in Active with its new term and dates. */
export async function renewDealAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const endDate = str(f, 'end_date');
  const reason = str(f, 'reason');
  if (!endDate) return { ok: false, error: 'New end date is empty.' };
  if (!reason) return { ok: false, error: 'Renewing a deal needs a reason.' };
  try {
    await write(asActor(me), `Renewed to ${endDate}: ${reason}`,
      `update deals set stage = 'active', end_date = $1::date,
              term_months = coalesce($2, term_months),
              monthly_value = coalesce($3, monthly_value)
        where id = $4 and category = 'retention'`,
      [endDate, num(f, 'term_months'), num(f, 'monthly_value'), id]);
    revalidatePath(`/deals/${id}`);
    revalidatePath('/deals');
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}
