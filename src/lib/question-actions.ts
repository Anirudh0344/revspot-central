'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor } from './auth';
import { write, readableError } from './db';
import { postSlack } from './alerts';
import { appUrl } from './gmail';
import type { Result } from './actions';

const fail = (e: unknown): Result => ({ ok: false, error: readableError(e) });
const str = (f: FormData, k: string): string | null => {
  const v = f.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : null;
};

export async function askQuestionAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const dealId = str(f, 'deal_id');
  const body = str(f, 'body');
  if (!dealId) return { ok: false, error: 'Pick a deal.' };
  if (!body) return { ok: false, error: 'Write the question.' };
  const askedTo = str(f, 'asked_to');
  try {
    const rows = await write<{ id: string; title: string; to_name: string | null }>(
      asActor(me),
      'Question asked',
      `with q as (
         insert into questions (deal_id, client_id, anchor, anchor_note, body, asked_to)
         select d.id, d.client_id, $2, $3, $4, $5::uuid from deals d where d.id = $1
         returning id, deal_id, asked_to)
       select q.id, d.title, p.name as to_name from q join deals d on d.id = q.deal_id
         left join profiles p on p.id = q.asked_to`,
      [dealId, str(f, 'anchor') ?? 'general', str(f, 'anchor_note'), body, askedTo],
    );
    if (!rows[0]) return { ok: false, error: 'That deal was not found.' };
    const r = rows[0];
    void postSlack(
      `${me.name} asked${r.to_name ? ` ${r.to_name}` : ''} on *${r.title}*: ${body.slice(0, 300)}\n${appUrl()}/deals/${dealId}#q-${r.id}`,
    );
    revalidatePath(`/deals/${dealId}`);
    revalidatePath('/tasks');
    return { ok: true, id: r.id };
  } catch (e) {
    return fail(e);
  }
}

export async function replyQuestionAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const questionId = str(f, 'question_id');
  const body = str(f, 'body');
  if (!questionId || !body) return { ok: false, error: 'Write a reply.' };
  try {
    const rows = await write<{ deal_id: string }>(
      asActor(me),
      'Question answered',
      `insert into question_replies (question_id, deal_id, body)
       select q.id, q.deal_id, $2 from questions q where q.id = $1
       returning deal_id`,
      [questionId, body],
    );
    if (!rows[0]) return { ok: false, error: 'That question was not found.' };
    if (str(f, 'resolve') === 'on') {
      await write(asActor(me), 'Question resolved', `update questions set status = 'resolved' where id = $1`, [questionId]);
    }
    revalidatePath(`/deals/${rows[0].deal_id}`);
    revalidatePath('/tasks');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setQuestionStatusAction(questionId: string, status: 'open' | 'resolved'): Promise<Result> {
  const me = await requireProfile();
  try {
    const rows = await write<{ deal_id: string }>(
      asActor(me),
      status === 'resolved' ? 'Question resolved' : 'Question reopened',
      'update questions set status = $2 where id = $1 returning deal_id',
      [questionId, status],
    );
    if (!rows[0]) return { ok: false, error: 'You can only close questions you asked or were asked.' };
    revalidatePath(`/deals/${rows[0].deal_id}`);
    revalidatePath('/tasks');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Marks a deal stuck (who it waits on, and on what), or clears it. */
export async function setBlockerAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  const dealId = str(f, 'deal_id');
  if (!dealId) return { ok: false, error: 'Pick a deal.' };
  const on = str(f, 'blocked_on');
  try {
    await write(
      asActor(me),
      on ? 'Marked stuck' : 'No longer stuck',
      'update deals set blocked_on = $2, blocker_note = $3 where id = $1',
      [dealId, on, on ? str(f, 'blocker_note') : null],
    );
    revalidatePath(`/deals/${dealId}`);
    revalidatePath('/pilots');
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
