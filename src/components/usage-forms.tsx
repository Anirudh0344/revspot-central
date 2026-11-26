'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { linkUsageWorkspaceAction, syncUsageNowAction, unlinkUsageWorkspaceAction } from '@/lib/usage-actions';
import { count } from '@/lib/format';
import type { WorkspaceOption } from '@/lib/usage';
import { ActionForm, btn, btnQuiet, input } from './forms';

/**
 * Pick a Revspot workspace (busiest first) whose usage counts towards this client.
 * Search matches the workspace key, its name and the org that owns it, so
 * "godrej" finds godrej-mmr even though Propstar owns it.
 */
export function LinkUsageWorkspaceForm({ clientId, workspaces }: { clientId: string; workspaces: WorkspaceOption[] }) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();
  const shown = q
    ? workspaces.filter((w) =>
        [w.workspace_key, w.name, w.parent_org_name].some((t) => (t ?? '').toLowerCase().includes(q)),
      )
    : workspaces;
  return (
    <ActionForm
      testId="link-usage-workspace-form"
      submitLabel="Link workspace"
      resetOnSuccess
      action={(f) => linkUsageWorkspaceAction(clientId, f)}
    >
      <div className="grid gap-2">
        <input
          className={input}
          placeholder="Search by workspace or org, e.g. godrej"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          data-testid="usage-workspace-search"
        />
        <select name="workspace_key" className={input} required data-testid="usage-workspace-select" size={8}>
          {shown.slice(0, 200).map((w) => (
            <option key={w.workspace_key} value={w.workspace_key}>
              {w.name && w.name !== w.workspace_key ? `${w.name} · ${w.workspace_key}` : w.workspace_key}
              {w.parent_org_name ? ` · org: ${w.parent_org_name}` : ''}
              {w.volume ? ` · ${count(w.volume)} in 60d` : ''}
            </option>
          ))}
        </select>
        {workspaces.length === 0 && (
          <p className="text-[12px] text-[var(--ink-faint)]">No workspaces yet. Run the usage sync first.</p>
        )}
        {workspaces.length > 0 && shown.length === 0 && (
          <p className="text-[12px] text-[var(--ink-faint)]">No unlinked workspace matches. It may already be linked to another client.</p>
        )}
      </div>
    </ActionForm>
  );
}

export function UnlinkUsageWorkspaceButton({ clientId, sourceId }: { clientId: string; sourceId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className={btnQuiet}
        disabled={pending}
        data-testid={`unlink-usage-${sourceId}`}
        onClick={() =>
          start(async () => {
            const r = await unlinkUsageWorkspaceAction(clientId, sourceId);
            if (!r.ok) setError(r.error);
            else router.refresh();
          })
        }
      >
        Unlink
      </button>
      {error && <span className="ml-2 text-[12px] text-[var(--red)]">{error}</span>}
    </span>
  );
}

export function SyncUsageButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-[var(--red)]">{msg}</span>}
      <button
        type="button"
        className={btn}
        disabled={pending}
        data-testid="sync-usage"
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await syncUsageNowAction();
            if (!r.ok) setMsg(r.error);
            router.refresh();
          })
        }
      >
        {pending ? 'Syncing…' : 'Sync now'}
      </button>
    </span>
  );
}
