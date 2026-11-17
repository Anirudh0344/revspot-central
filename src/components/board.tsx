'use client';

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Result } from '@/lib/actions';
import type { Stage } from '@/lib/queries';
import type { DealRow } from '@/lib/types';
import { DealCard } from './ui';
import { btn, btnQuiet, input } from './forms';

type MoveFn = (id: string, stage: string, reason?: string, closeReason?: string) => Promise<Result>;

function Column({ stage, deals, children }: { stage: Stage; deals: DealRow[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  return (
    <div
      ref={setNodeRef}
      data-testid={`column-${stage.key}`}
      className={`flex w-[272px] shrink-0 flex-col rounded-[var(--radius)] border p-2 transition ${
        isOver
          ? 'border-[var(--focus)] bg-[var(--accent-50)]'
          : 'border-[var(--line)] bg-[var(--paper-sunk)]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2 px-1.5 pb-2 pt-0.5">
        <h3 className="t-label font-semibold text-[var(--accent-deep)]">
          {stage.label}
        </h3>
        <span className="text-[11px] tabular-nums text-[var(--ink-faint)]">
          {deals.length}
          {stage.max_days ? ` · ${stage.max_days}d` : ''}
        </span>
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function Draggable({ deal, children }: { deal: DealRow; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={isDragging ? 'opacity-40' : ''}
      style={{ touchAction: 'none' }}
    >
      {children}
    </div>
  );
}

export function Board({
  stages,
  deals,
  move,
}: {
  stages: Stage[];
  deals: DealRow[];
  move: MoveFn;
}) {
  const router = useRouter();
  const [dragging, setDragging] = useState<DealRow | null>(null);
  const [blocked, setBlocked] = useState<{ deal: DealRow; stage: Stage; message: string } | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function attempt(deal: DealRow, stage: Stage, reason?: string) {
    start(async () => {
      const res = await move(deal.id, stage.key, undefined, reason);
      if (res.ok) {
        setBlocked(null);
        setCloseReason('');
        router.refresh();
      } else {
        setBlocked({ deal, stage, message: res.error });
      }
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const deal = deals.find((d) => d.id === e.active.id);
    const stage = stages.find((s) => s.key === e.over?.id);
    if (!deal || !stage || stage.key === deal.stage) return;
    attempt(deal, stage);
  }

  function onDragStart(e: DragStartEvent) {
    setDragging(deals.find((d) => d.id === e.active.id) ?? null);
  }

  return (
    <div>
      {blocked && (
        <div
          data-testid="board-blocked"
          className="mb-3 rounded-[var(--radius)] border border-[color-mix(in_srgb,var(--amber)_35%,white)] bg-[var(--amber-soft)] p-3"
        >
          <p className="text-[13px] font-medium">
            {blocked.deal.client_name} · {blocked.deal.title} cannot move to {blocked.stage.label}
          </p>
          <p className="mt-1 text-[13px] text-[var(--amber)]">{blocked.message}</p>
          {blocked.stage.is_terminal && /close_reason|reason is required/i.test(blocked.message) && (
            <div className="mt-2 flex gap-2">
              <input
                data-testid="board-close-reason"
                className={input}
                placeholder="Reason for closing"
                value={closeReason}
                onChange={(e) => setCloseReason(e.target.value)}
              />
              <button
                type="button"
                className={btn}
                disabled={!closeReason.trim()}
                onClick={() => attempt(blocked.deal, blocked.stage, closeReason)}
              >
                Move anyway
              </button>
            </div>
          )}
          <div className="mt-2 flex gap-3">
            <a className={btnQuiet} href={`/deals/${blocked.deal.id}`}>
              Open the deal and fill what is missing
            </a>
            <button
              type="button"
              className="text-[12px] text-[var(--ink-faint)] underline-offset-2 hover:underline"
              onClick={() => setBlocked(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* A stable id keeps dnd-kit's generated aria ids identical on server and client. */}
      <DndContext id="deal-board" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="scroll-x flex gap-3 overflow-x-auto pb-3">
          {stages.map((s) => {
            const inStage = deals.filter((d) => d.stage === s.key);
            return (
              <Column key={s.key} stage={s} deals={inStage}>
                {inStage.map((d) => (
                  <Draggable key={d.id} deal={d}>
                    <DealCard deal={d} />
                  </Draggable>
                ))}
                {inStage.length === 0 && (
                  <p className="px-1.5 py-4 text-[12px] text-[var(--ink-faint)]">Nothing here</p>
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay>{dragging ? <DealCard deal={dragging} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}
