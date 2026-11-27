'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor, canEdit, VIEW_ONLY_MESSAGE } from './auth';
import { write, readableError } from './db';
import { runUsageSync } from './jobs';
import type { Result } from './actions';

/** Counts a Revspot workspace's leads and bot calls towards this client. */
export async function linkUsageWorkspaceAction(clientId: string, f: FormData): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  const workspace = String(f.get('workspace_key') ?? '').trim();
  if (!workspace) return { ok: false, error: 'Pick a Revspot workspace to link.' };
  try {
    await write(asActor(me), 'Usage source linked',
      'insert into client_usage_sources (client_id, workspace_key) values ($1, $2)', [clientId, workspace]);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath('/clients');
    return { ok: true };
  } catch (e) {
    const msg = readableError(e);
    return { ok: false, error: msg === 'That record already exists.' ? 'That workspace is already linked to a client.' : msg };
  }
}

export async function unlinkUsageWorkspaceAction(clientId: string, sourceId: string): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  try {
    // Soft remove, so the activity log keeps who unlinked it and when.
    await write(asActor(me), 'Usage source unlinked',
      `update client_usage_sources set removed_at = now(), removed_by = app_actor()
        where id = $1 and client_id = $2 and removed_at is null`, [sourceId, clientId]);
    revalidatePath(`/clients/${clientId}`);
    revalidatePath('/clients');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}

/** Pull the latest counts now instead of waiting for the morning job. */
export async function syncUsageNowAction(): Promise<Result> {
  const me = await requireProfile();
  if (!canEdit(me)) return { ok: false, error: VIEW_ONLY_MESSAGE };
  if (me.role !== 'admin') return { ok: false, error: 'Only admins can run the usage sync.' };
  try {
    const out = await runUsageSync();
    if ('skipped' in out) return { ok: false, error: `Usage sync skipped: ${out.skipped}.` };
    revalidatePath('/clients', 'layout');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
