'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addPersonAction, setPersonActiveAction, setPersonRoleAction } from '@/lib/people-actions';
import type { Result } from '@/lib/actions';
import { roleLabel } from '@/lib/format';
import { ActionForm, btnQuiet, input } from './forms';
import { Badge } from './ui';

export type Person = {
  id: string;
  name: string;
  email: string | null;
  role: string;
  is_active: boolean;
  is_super_admin: boolean;
};

/**
 * Everyone who can sign in, with what they can do. Admins add users and switch
 * them on or off; only the owner makes or removes admins.
 */
export function People({
  people,
  meId,
  canManage,
  isOwner,
}: {
  people: Person[];
  meId: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      router.refresh();
    });

  return (
    <div data-testid="people">
      <ul className="divide-y divide-[var(--line)]">
        {people.map((p) => {
          const isAdmin = p.role === 'admin';
          // What this viewer may change on this row (the database enforces the same).
          const editable =
            canManage && p.id !== meId && !p.is_super_admin && p.role !== 'bot' && (isOwner || !isAdmin);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]" data-testid={`person-${p.email}`}>
              <div className="min-w-0 flex-1">
                <p className={`font-medium ${p.is_active ? '' : 'text-[var(--ink-faint)] line-through'}`}>
                  {p.name}
                  {p.id === meId && <span className="ml-1.5 text-[12px] font-normal text-[var(--ink-faint)]">(you)</span>}
                </p>
                <p className="truncate text-[12px] text-[var(--ink-muted)]">{p.email ?? '—'}</p>
              </div>
              {editable && isOwner ? (
                <select
                  value={isAdmin ? 'admin' : 'viewer'}
                  disabled={pending}
                  aria-label={`Role for ${p.name}`}
                  data-testid={`role-${p.email}`}
                  className="rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-1.5 py-0.5 text-[12px]"
                  onChange={(e) => run(() => setPersonRoleAction(p.id, e.target.value as 'admin' | 'viewer'))}
                >
                  <option value="admin">Admin</option>
                  <option value="viewer">User</option>
                </select>
              ) : (
                <Badge tone={p.is_super_admin || isAdmin ? 'brand' : 'neutral'}>{roleLabel(p)}</Badge>
              )}
              {!p.is_active && <Badge tone="warn">Switched off</Badge>}
              {editable && (
                <button
                  type="button"
                  className={btnQuiet}
                  disabled={pending}
                  data-testid={`active-${p.email}`}
                  onClick={() => run(() => setPersonActiveAction(p.id, !p.is_active))}
                >
                  {p.is_active ? 'Switch off' : 'Switch on'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-2 text-[12px] text-[var(--red)]">{error}</p>}

      {canManage && (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <p className="mb-2 text-[12px] text-[var(--ink-muted)]">
            Add someone before they sign in, and they arrive with this role. Anyone else from the company who signs
            in arrives as a user.
          </p>
          <ActionForm action={addPersonAction} submitLabel="Add person" resetOnSuccess testId="add-person-form">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input name="name" className={input} placeholder="Name" aria-label="Name" data-testid="person-name" />
              <input
                name="email"
                type="email"
                required
                className={input}
                placeholder="name@revspot.ai"
                aria-label="Email"
                data-testid="person-email"
              />
              <select name="role" defaultValue="viewer" className={input} aria-label="Role" data-testid="person-role">
                <option value="viewer">User (view only)</option>
                {isOwner && <option value="admin">Admin</option>}
              </select>
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}
