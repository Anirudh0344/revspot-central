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
        className="shrink-0 rounded-md border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        onClick={() => (dealId ? setAsking(true) : run())}
        disabled={pending}
      >
        {pending ? '…' : 'Done'}
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-neutral-200 p-2 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">What is the next step on this deal?</p>
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
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
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
        className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline disabled:opacity-50 dark:text-sky-400"
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
      {error && <span className="ml-2 text-xs text-rose-600">{error}</span>}
    </span>
  );
}
