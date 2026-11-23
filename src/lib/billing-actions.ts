'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor } from './auth';
import { query, write, readableError } from './db';
import { disconnectMailbox, sendMail, sendingAccount } from './gmail';
import type { Result } from './actions';
import { alertPayment } from './alerts';
import { runDaily, runMailSync } from './jobs';

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
  const n = Number(v.replace(/[,₹\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const emails = (f: FormData, k: string): string[] =>
  (str(f, k) ?? '')
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

function refresh(dealId?: string | null, clientId?: string | null) {
  revalidatePath('/finance');
  revalidatePath('/deals');
  if (dealId) revalidatePath(`/deals/${dealId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function billRefs(id: string) {
  const rows = await query<{ deal_id: string; client_id: string }>(null, 'select deal_id, client_id from invoices where id = $1', [id]);
  return rows[0] ?? { deal_id: null, client_id: null };
}

/* -------------------------------------------------------------- bill-to parties */

export async function createBillingAccountAction(clientId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const name = str(f, 'name');
  if (!name) return { ok: false, error: 'Who is billed? Give the bill-to party a name.' };
  const to = emails(f, 'to_emails');
  if (to.length === 0) return { ok: false, error: 'Add at least one email that PIs and reminders go to.' };
  try {
    const rows = await write<{ id: string }>(
      asActor(me),
      'Bill-to party added',
      `insert into billing_accounts (client_id, name, legal_name, gstin, to_emails, cc_emails, is_intermediary, notes)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [clientId, name, str(f, 'legal_name'), str(f, 'gstin'), to, emails(f, 'cc_emails'),
       f.get('is_intermediary') === 'on', str(f, 'notes')],
    );
    const dealId = str(f, 'deal_id');
    if (dealId) {
      await write(asActor(me), 'Bill-to party set', 'update deals set billing_account_id = $1 where id = $2', [rows[0].id, dealId]);
    }
    refresh(dealId, clientId);
    return ok(rows[0].id);
  } catch (e) {
    return fail(e);
  }
}

export async function setDealBillingAccountAction(dealId: string, accountId: string | null): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'Bill-to party set', 'update deals set billing_account_id = $1 where id = $2', [accountId, dealId]);
    refresh(dealId);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------- bills */

/** A new bill starts as a PI. */
export async function createBillAction(dealId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const amount = num(f, 'amount');
  if (!amount || amount <= 0) return { ok: false, error: 'Enter the amount before GST.' };
  const gstRate = num(f, 'gst_rate') ?? 18;
  const gst = Math.round(amount * gstRate) / 100;
  const piDate = str(f, 'pi_date');
  const sent = f.get('pi_sent') === 'on';

  // A month picker gives 'YYYY-MM': the bill covers that calendar month.
  let periodStart = str(f, 'period_start');
  let periodEnd = str(f, 'period_end');
  const month = str(f, 'period_month');
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    periodStart = `${month}-01`;
    periodEnd = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  }

  try {
    const rows = await write<{ id: string; client_id: string }>(
      asActor(me),
      'PI raised',
      `insert into invoices (deal_id, billing_account_id, description, amount, gst, pi_number, pi_date,
                             pi_sent_on, due_date, period_start, period_end, notes, status)
       values ($1, $2, $3, $4, $5, $6, coalesce($7::date, today_ist()),
               case when $8 then coalesce($7::date, today_ist()) end,
               coalesce($9::date, coalesce($7::date, today_ist()) + $10::int),
               $11, $12, $13,
               case when $8 then 'sent'::invoice_status else 'draft'::invoice_status end)
       returning id, client_id`,
      [dealId, str(f, 'billing_account_id'), str(f, 'description'), amount, gst, str(f, 'pi_number'),
       piDate, sent, str(f, 'due_date'), num(f, 'terms_days') ?? 15, periodStart, periodEnd, str(f, 'notes')],
    );
    refresh(dealId, rows[0].client_id);
    return ok(rows[0].id);
  } catch (e) {
    return fail(e);
  }
}

export async function markPiSentAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'PI sent to the client',
      `update invoices set pi_sent_on = coalesce($2::date, today_ist()),
              status = case when status = 'draft' then 'sent'::invoice_status else status end
        where id = $1`, [id, str(f, 'pi_sent_on')]);
    const r = await billRefs(id);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function recordPoAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const po = str(f, 'po_number');
  if (!po) return { ok: false, error: 'Enter the PO/RO number from the client.' };
  try {
    await write(asActor(me), 'PO/RO received',
      `update invoices set po_number = $2, po_received_on = coalesce($3::date, today_ist()), po_url = $4,
              due_date = coalesce($5::date, due_date),
              pi_sent_on = coalesce(pi_sent_on, pi_date, today_ist()),
              status = case when status = 'draft' then 'sent'::invoice_status else status end
        where id = $1`,
      [id, po, str(f, 'po_received_on'), str(f, 'po_url'), str(f, 'due_date')]);
    const r = await billRefs(id);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function recordPaymentAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const amount = num(f, 'amount');
  const reference = str(f, 'reference');
  if (!amount || amount <= 0) return { ok: false, error: 'Enter the amount received.' };
  if (!reference) return { ok: false, error: 'Add the UTR or cheque number, so the payment can be traced.' };
  try {
    await write(asActor(me), 'Payment received',
      `insert into payments (invoice_id, amount, received_on, mode, reference)
       values ($1, $2, coalesce($3::date, today_ist()), $4, $5)`,
      [id, amount, str(f, 'received_on'), str(f, 'mode'), reference]);
    // A payment answers any reminder still waiting to go out.
    await write(asActor(me), 'Payment received',
      `update billing_reminders set status = 'skipped', error = 'Payment recorded before it was sent'
        where invoice_id = $1 and status = 'queued'
          and (select balance from bill_view where id = $1) <= 0`, [id]);
    await alertPayment(id, amount).catch(() => {});
    const r = await billRefs(id);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function issueTiAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const ti = str(f, 'ti_number');
  if (!ti) return { ok: false, error: 'Enter the tax invoice number from Zoho.' };
  try {
    await write(asActor(me), 'Tax invoice issued',
      'update invoices set ti_number = $2, ti_date = coalesce($3::date, today_ist()) where id = $1',
      [id, ti, str(f, 'ti_date')]);
    const r = await billRefs(id);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function setBillStatusAction(
  id: string,
  status: 'sent' | 'disputed' | 'cancelled',
  reason: string,
): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), reason, 'update invoices set status = $2 where id = $1', [id, status]);
    if (status === 'cancelled') {
      await write(asActor(me), reason,
        `update billing_reminders set status = 'skipped', error = 'Bill cancelled' where invoice_id = $1 and status = 'queued'`, [id]);
    }
    const r = await billRefs(id);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------------------------------------- reminders */

export async function queueRemindersAction(): Promise<Result> {
  const me = await requireProfile();
  try {
    const rows = await write<{ n: number }>(asActor(me), 'Reminder queue refreshed',
      'select queue_billing_reminders() as n');
    revalidatePath('/finance');
    return ok(String(rows[0].n));
  } catch (e) {
    return fail(e);
  }
}

export async function updateReminderAction(id: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  const subject = str(f, 'subject');
  const body = str(f, 'body');
  if (!subject || !body) return { ok: false, error: 'A reminder needs a subject and a message.' };
  try {
    await write(asActor(me), 'Reminder edited',
      `update billing_reminders set subject = $2, body = $3, to_emails = $4, cc_emails = $5
        where id = $1 and status in ('queued','failed')`,
      [id, subject, body, emails(f, 'to_emails'), emails(f, 'cc_emails')]);
    revalidatePath('/finance');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function skipReminderAction(id: string): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'Reminder skipped',
      `update billing_reminders set status = 'skipped' where id = $1 and status in ('queued','failed')`, [id]);
    revalidatePath('/finance');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/** Sends one queued reminder from the finance mailbox and logs it on the deal. */
export async function sendReminderAction(id: string): Promise<Result> {
  const me = await requireProfile();
  if (me.role === 'viewer') return { ok: false, error: 'Viewers cannot send billing email.' };
  const rows = await query<{
    status: string; to_emails: string[]; cc_emails: string[]; subject: string; body: string;
    invoice_id: string; deal_id: string; client_id: string; thread: string | null; kind: string;
  }>(
    null,
    `select r.status, r.to_emails, r.cc_emails, r.subject, r.body, r.invoice_id, r.kind,
            i.deal_id, i.client_id, i.gmail_thread_id as thread
       from billing_reminders r join invoices i on i.id = r.invoice_id where r.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return { ok: false, error: 'That reminder no longer exists.' };
  if (r.status === 'sent') return { ok: false, error: 'This reminder has already been sent.' };
  if (r.status === 'skipped') return { ok: false, error: 'This reminder was skipped.' };

  const account = await sendingAccount();
  if (!account) {
    return { ok: false, error: 'No sending mailbox is connected. Connect finance@revspot.ai under Settings.' };
  }

  try {
    const sent = await sendMail(account, {
      to: r.to_emails, cc: r.cc_emails, subject: r.subject, body: r.body,
    });
    await write(asActor(me), 'Billing reminder sent',
      `update billing_reminders set status = 'sent', sent_at = now(), sent_from = $2,
              gmail_message_id = $3, gmail_thread_id = $4, error = null where id = $1`,
      [id, account.email, sent.id, sent.threadId]);
    await write(asActor(me), 'Billing reminder sent',
      `insert into interactions (deal_id, client_id, channel, occurred_at, participants, summary, direction, source_ref, logged_by)
       values ($1, $2, 'email', now(), $3, $4, 'outbound', $5, $6)`,
      [r.deal_id, r.client_id, [...r.to_emails, ...r.cc_emails], `Billing reminder: ${r.subject}`,
       `gmail:${sent.id}`, me.id]);
    refresh(r.deal_id, r.client_id);
    return ok();
  } catch (e) {
    const message = (e as Error).message;
    await write(asActor(me), 'Billing reminder failed',
      `update billing_reminders set status = 'failed', error = $2 where id = $1`, [id, message]).catch(() => {});
    revalidatePath('/finance');
    return { ok: false, error: message };
  }
}

/* --------------------------------------------------------------- mailboxes */

export async function disconnectMailboxAction(id: string): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only an admin can disconnect a mailbox.' };
  try {
    await disconnectMailbox(id);
    revalidatePath('/settings');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------ scheduled jobs */

export async function syncMailNowAction(): Promise<Result> {
  const me = await requireProfile();
  if (me.role === 'viewer') return { ok: false, error: 'Viewers cannot run a sync.' };
  try {
    const out = await runMailSync();
    revalidatePath('/settings');
    const logged = out.reduce((s, r) => s + r.logged, 0);
    const errors = out.filter((r) => r.error).map((r) => `${r.mailbox}: ${r.error}`);
    if (errors.length) return { ok: false, error: errors.join(' · ') };
    return ok(String(logged));
  } catch (e) {
    return fail(e);
  }
}

export async function runDailyNowAction(): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only an admin can run the daily jobs by hand.' };
  try {
    await runDaily();
    revalidatePath('/settings');
    revalidatePath('/finance');
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function markReplySeenAction(id: string): Promise<Result> {
  const me = await requireProfile();
  try {
    await write(asActor(me), 'Reply seen', 'update billing_reminders set reply_seen_at = now() where id = $1', [id]);
    revalidatePath('/finance');
    return ok();
  } catch (e) {
    return fail(e);
  }
}
