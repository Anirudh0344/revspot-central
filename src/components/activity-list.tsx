import { istDateTime } from '@/lib/format';
import type { ActivityRow } from '@/lib/queries';
import { Badge, Empty } from './ui';
import { UndoButton } from './task-widgets';

const ACTION_TONE: Record<string, 'neutral' | 'bad' | 'warn' | 'good' | 'brand'> = {
  create: 'good',
  update: 'neutral',
  stage_change: 'brand',
  health_change: 'warn',
  archive: 'bad',
  undo: 'brand',
};

const HIDE = new Set(['updated_at', 'updated_by', 'stage_entered_at', 'health_updated_at']);

function show(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  return JSON.stringify(v);
}

export function ActivityList({
  rows,
  canUndo,
  showDeal,
}: {
  rows: ActivityRow[];
  canUndo?: boolean;
  showDeal?: boolean;
}) {
  if (rows.length === 0) return <Empty>Nothing logged yet.</Empty>;
  return (
    <ul className="space-y-2" data-testid="activity-list">
      {rows.map((a) => {
        const fields = Object.entries(a.changes ?? {}).filter(([k]) => !HIDE.has(k));
        return (
          <li
            key={a.id}
            data-testid={`activity-${a.id}`}
            className={`rounded-lg border p-2.5 text-[13px] ${
              a.undone_at
                ? 'border-[var(--line)] bg-[var(--paper-sunk)] opacity-60'
                : 'border-[var(--line)]'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ACTION_TONE[a.action] ?? 'neutral'}>{a.action.replace('_', ' ')}</Badge>
              <span className="text-[var(--ink-muted)]">{a.entity_type}</span>
              {showDeal && a.deal_title && (
                <span className="text-[12px] text-[var(--ink-muted)]">
                  {a.client_name} · {a.deal_title}
                </span>
              )}
              {a.actor_role === 'bot' && <Badge tone="brand">bot</Badge>}
              <span className="text-[12px] text-[var(--ink-muted)]">{a.actor_name ?? 'system'}</span>
              <span className="ml-auto text-[12px] text-[var(--ink-faint)]">{istDateTime(a.created_at)}</span>
              {canUndo && !a.undone_at && a.action !== 'undo' && (
                <UndoButton activityId={a.id} />
              )}
              {a.undone_at && <span className="text-[12px] text-[var(--ink-faint)]">undone</span>}
            </div>
            {a.reason && (
              <p className="mt-1 text-[12px] italic text-[var(--ink-muted)]">&ldquo;{a.reason}&rdquo;</p>
            )}
            {fields.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {fields.slice(0, 6).map(([k, v]) => (
                  <li key={k} className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
                    <span className="font-medium">{k}</span>
                    <span className="text-[var(--ink-faint)] line-through">{show(v?.[0])}</span>
                    <span className="text-[var(--ink-faint)]">→</span>
                    <span>{show(v?.[1])}</span>
                    {canUndo && !a.undone_at && a.action !== 'undo' && fields.length > 1 && (
                      <UndoButton activityId={a.id} field={k} />
                    )}
                  </li>
                ))}
                {fields.length > 6 && (
                  <li className="text-[12px] text-[var(--ink-faint)]">+{fields.length - 6} more fields</li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
