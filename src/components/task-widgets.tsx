'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { completeTaskAction, undoActivityAction } from '@/lib/actions';
import { btn, btnPrimary, input } from './forms';

/** TK-3: completing a deal's next-step task prompts for the new next step. */
export function CompleteTask({ taskId, dealId }: { taskId: string; dealId: string | null }) {
  const [asking, setAsking] = useState(false);
  const [next, setNext] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (nextStep?: string, nextDue?: string) =>
    start(async () => {
      const res = await completeTaskAction(taskId, nextStep, nextDue);
      if (res.ok) {
        setAsking(false);
        router.refresh();
      } else setError(res.error);
    });

  if (!asking) {
    return (
      <button
        type="button"
        data-testid={`complete-task-${taskId}`}
        className="shrink-0 rounded-md border border-[var(--line-strong)] px-2 py-0.5 text-[12px] hover:bg-[var(--paper-sunk)]"
        onClick={() => (dealId ? setAsking(true) : run())}
        disabled={pending}
      >
        {pending ? '…' : 'Done'}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-[var(--line)] p-2">
      <p className="text-[12px] text-[var(--ink-muted)]">What is the next step on this deal?</p>
      <input
        className={`${input} mt-1`}
        data-testid="next-step-title"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        placeholder="Next step"
      />
      <input
        type="date"
        className={`${input} mt-1`}
        data-testid="next-step-due"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      {error && <p className="mt-1 text-[12px] text-[var(--red)]">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button className={btnPrimary} disabled={pending} onClick={() => run(next, due)}>
          Complete
        </button>
        <button className={btn} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** BA-2 / AC-3: one-click undo on any logged change. */
export function UndoButton({ activityId, field }: { activityId: string; field?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span>
      <button
        type="button"
        data-testid={`undo-${activityId}${field ? '-' + field : ''}`}
        className="text-[12px] font-medium text-[var(--blue-ink)] underline-offset-2 hover:underline disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await undoActivityAction(Number(activityId), field);
            if (res.ok) router.refresh();
            else setError(res.error);
          })
        }
      >
        {pending ? '…' : field ? `Undo ${field}` : 'Undo'}
      </button>
      {error && <span className="ml-2 text-[12px] text-[var(--red)]">{error}</span>}
    </span>
  );
}
