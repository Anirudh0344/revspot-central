'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor } from './auth';
import { query, write, readableError } from './db';
import type { Result } from './actions';
import type { Step, Trigger } from './playbooks';

const fail = (e: unknown): Result => ({ ok: false, error: readableError(e) });

const KINDS = new Set(['question', 'task', 'guide']);
const TRIGGERS = new Set(['manual', 'stage_entered', 'health_red', 'deal_created']);

export type PlaybookInput = {
  name: string;
  description: string;
  category: '' | 'pilot' | 'retention' | 'expansion';
  trigger: Trigger;
  trigger_stage: string;
  steps: Step[];
  is_active: boolean;
};

function clean(input: PlaybookInput): { ok: true; value: PlaybookInput } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give the playbook a name.' };
  if (!TRIGGERS.has(input.trigger)) return { ok: false, error: 'Pick when the playbook starts.' };
  if (input.trigger === 'stage_entered' && !input.trigger_stage) return { ok: false, error: 'Pick the stage that starts it.' };
  const steps = input.steps
    .map((s, i) => ({
      id: s.id || `s${i + 1}`,
      kind: s.kind,
      title: s.title.trim(),
      ...(s.body?.trim() ? { body: s.body.trim() } : {}),
      ...(s.kind === 'question' && s.options?.length ? { options: s.options.map((o) => o.trim()).filter(Boolean) } : {}),
      ...(s.kind === 'task' ? { due_days: Math.max(0, Math.min(90, Number(s.due_days ?? 3) || 0)) } : {}),
    }))
    .filter((s) => s.title);
  if (steps.length === 0) return { ok: false, error: 'Add at least one step.' };
  if (steps.some((s) => !KINDS.has(s.kind))) return { ok: false, error: 'A step has an unknown type.' };
  return { ok: true, value: { ...input, name, steps } };
}

export async function savePlaybookAction(id: string | null, input: PlaybookInput): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only an admin can change playbooks.' };
  const c = clean(input);
  if (!c.ok) return c;
  const v = c.value;
  const params = [v.name, v.description.trim() || null, v.category || null, v.trigger,
    v.trigger === 'stage_entered' ? v.trigger_stage : null, JSON.stringify(v.steps), v.is_active];
  try {
    const rows = id
      ? await write<{ id: string }>(asActor(me), 'Playbook edited',
          `update playbooks set name = $1, description = $2, category = $3, trigger = $4, trigger_stage = $5,
                  steps = $6::jsonb, is_active = $7 where id = $8 returning id`, [...params, id])
      : await write<{ id: string }>(asActor(me), 'Playbook created',
          `insert into playbooks (name, description, category, trigger, trigger_stage, steps, is_active)
           values ($1, $2, $3, $4, $5, $6::jsonb, $7) returning id`, params);
    revalidatePath('/playbooks');
    return { ok: true, id: rows[0].id };
  } catch (e) {
    return fail(e);
  }
}

export async function startPlaybookAction(dealId: string, playbookId: string): Promise<Result> {
  const me = await requireProfile();
  if (!playbookId) return { ok: false, error: 'Pick a playbook.' };
  try {
    const rows = await write<{ id: string }>(asActor(me), 'Playbook started',
      'select start_playbook($1, $2, $3) as id', [playbookId, dealId, 'manual']);
    revalidatePath(`/deals/${dealId}`);
    return { ok: true, id: rows[0].id };
  } catch (e) {
    return fail(e);
  }
}

/** Saves answers; on completion, logs the whole playbook as a note on the deal, as HubSpot does. */
export async function saveRunAction(runId: string, answers: Record<string, string>, complete: boolean): Promise<Result> {
  const me = await requireProfile();
  const cleanAnswers = Object.fromEntries(
    Object.entries(answers).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v),
  );
  try {
    const [run] = await query<{ deal_id: string; client_id: string; name: string; steps: Step[]; status: string }>(
      asActor(me),
      `select r.deal_id, d.client_id, p.name, p.steps, r.status from playbook_runs r
         join playbooks p on p.id = r.playbook_id join deals d on d.id = r.deal_id where r.id = $1`,
      [runId],
    );
    if (!run) return { ok: false, error: 'That playbook run no longer exists.' };
    if (run.status !== 'in_progress') return { ok: false, error: 'This playbook is already closed.' };

    await write(asActor(me), complete ? 'Playbook completed' : 'Playbook answers saved',
      `update playbook_runs set answers = $2::jsonb,
              status = case when $3 then 'completed' else status end,
              completed_at = case when $3 then now() else completed_at end,
              completed_by = case when $3 then $4::uuid else completed_by end
        where id = $1`,
      [runId, JSON.stringify(cleanAnswers), complete, me.id]);

    if (complete) {
      const lines = run.steps
        .filter((s) => s.kind === 'question')
        .map((s) => `${s.title}\n→ ${cleanAnswers[s.id] ?? '(not answered)'}`);
      await write(asActor(me), 'Playbook completed',
        `insert into interactions (deal_id, client_id, channel, occurred_at, summary, subject, direction, source_ref, logged_by)
         values ($1, $2, 'note', now(), $3, $4, 'internal', $5, $6)`,
        [run.deal_id, run.client_id, lines.join('\n\n') || 'Completed.', `Playbook: ${run.name}`,
         `playbook:${runId}`, me.id]);
    }
    revalidatePath(`/deals/${run.deal_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissRunAction(runId: string): Promise<Result> {
  const me = await requireProfile();
  try {
    const rows = await write<{ deal_id: string }>(asActor(me), 'Playbook dismissed',
      `update playbook_runs set status = 'dismissed' where id = $1 and status = 'in_progress' returning deal_id`, [runId]);
    // Its open tasks go with it.
    await write(asActor(me), 'Playbook dismissed',
      `update tasks set status = 'cancelled' where playbook_run_id = $1 and status = 'open'`, [runId]);
    if (rows[0]) revalidatePath(`/deals/${rows[0].deal_id}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
