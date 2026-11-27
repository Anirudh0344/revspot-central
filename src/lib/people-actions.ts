'use server';

import { revalidatePath } from 'next/cache';
import { requireProfile, asActor } from './auth';
import { tx, readableError } from './db';
import type { Result } from './actions';

/*
  People on Settings. Owner (is_super_admin) and admins manage users; only the
  owner adds, changes or removes admins. The database enforces the same rules
  (profiles_guard, add_person), so these checks are for clear messages, not safety.
*/

const allowedDomain = () => (process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai').toLowerCase();

export async function addPersonAction(f: FormData): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only admins can add people.' };
  const email = String(f.get('email') ?? '').trim().toLowerCase();
  const name = String(f.get('name') ?? '').trim();
  const role = f.get('role') === 'admin' ? 'admin' : 'viewer';
  if (!email.endsWith(`@${allowedDomain()}`)) {
    return { ok: false, error: `Use their @${allowedDomain()} address: that is the account they sign in with.` };
  }
  if (role === 'admin' && !me.is_super_admin) return { ok: false, error: 'Only the owner can add admins.' };
  try {
    await tx(asActor(me), 'Person added', (c) => c.query('select add_person($1, $2, $3::user_role)', [email, name, role]));
    revalidatePath('/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}

export async function setPersonRoleAction(id: string, role: 'admin' | 'viewer'): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only admins can change roles.' };
  try {
    await tx(asActor(me), role === 'admin' ? 'Made an admin' : 'Made a user', (c) =>
      c.query('update profiles set role = $2::user_role where id = $1', [id, role]));
    revalidatePath('/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}

export async function setPersonActiveAction(id: string, active: boolean): Promise<Result> {
  const me = await requireProfile();
  if (me.role !== 'admin') return { ok: false, error: 'Only admins can switch people on or off.' };
  try {
    await tx(asActor(me), active ? 'Switched back on' : 'Switched off', (c) =>
      c.query('update profiles set is_active = $2 where id = $1', [id, active]));
    revalidatePath('/settings');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: readableError(e) };
  }
}
