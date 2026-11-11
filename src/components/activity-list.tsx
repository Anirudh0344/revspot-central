import { istDateTime } from '@/lib/format';
import type { ActivityRow } from '@/lib/queries';
import { Badge, Empty } from './ui';
import { UndoButton } from './task-widgets';

const ACTION_TONE: Record<string, 'neutral' | 'red' | 'amber' | 'green' | 'blue' | 'violet'> = {
  create: 'green',
  update: 'neutral',
  stage_change: 'blue',
  health_change: 'amber',
  archive: 'red',
  undo: 'violet',
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
            className={`rounded-lg border p-2.5 text-sm ${
              a.undone_at
                ? 'border-neutral-200 bg-neutral-50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={ACTION_TONE[a.action] ?? 'neutral'}>{a.action.replace('_', ' ')}</Badge>
              <span className="text-neutral-500">{a.entity_type}</span>
              {showDeal && a.deal_title && (
                <span className="text-xs text-neutral-500">
                  {a.client_name} · {a.deal_title}
                </span>
              )}
              {a.actor_role === 'bot' && <Badge tone="blue">bot</Badge>}
              <span className="text-xs text-neutral-500">{a.actor_name ?? 'system'}</span>
              <span className="ml-auto text-xs text-neutral-400">{istDateTime(a.created_at)}</span>
              {canUndo && !a.undone_at && a.action !== 'undo' && (
                <UndoButton activityId={a.id} />
              )}
              {a.undone_at && <span className="text-xs text-neutral-400">undone</span>}
            </div>
            {a.reason && (
              <p className="mt-1 text-xs italic text-neutral-500">&ldquo;{a.reason}&rdquo;</p>
            )}
            {fields.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {fields.slice(0, 6).map(([k, v]) => (
                  <li key={k} className="flex flex-wrap items-baseline gap-1.5 text-xs">
                    <span className="font-medium">{k}</span>
                    <span className="text-neutral-400 line-through">{show(v?.[0])}</span>
                    <span className="text-neutral-400">→</span>
                    <span>{show(v?.[1])}</span>
                    {canUndo && !a.undone_at && a.action !== 'undo' && fields.length > 1 && (
                      <UndoButton activityId={a.id} field={k} />
                    )}
                  </li>
                ))}
                {fields.length > 6 && (
                  <li className="text-xs text-neutral-400">+{fields.length - 6} more fields</li>
                )}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
