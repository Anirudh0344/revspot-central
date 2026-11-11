'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import type { Result } from '@/lib/actions';
import type { Health } from '@/lib/types';

export const input =
  'w-full rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-950';
export const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-sm font-medium transition hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800';
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200';

/** AU-5: every form validates inline with a plain-language error. */
export function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  testId,
  onDone,
  className = '',
  resetOnSuccess,
}: {
  action: (f: FormData) => Promise<Result>;
  children: ReactNode;
  submitLabel?: string;
  testId?: string;
  onDone?: () => void;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <form
      data-testid={testId}
      className={className}
      action={(formData) => {
        start(async () => {
          const res = await action(formData);
          if (res.ok) {
            setError(null);
            if (resetOnSuccess) (document.querySelector(`[data-testid="${testId}"]`) as HTMLFormElement | null)?.reset();
            router.refresh();
            onDone?.();
          } else {
            setError(res.error);
          }
        });
      }}
    >
      {children}
      {error && (
        <p data-testid="form-error" className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      <button data-testid="form-submit" className={`${btnPrimary} mt-3`} disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}

/** DL-9: red, amber or green with a reason that is never optional. */
export function HealthControl({
  dealId,
  current,
  currentReason,
  setHealth,
}: {
  dealId: string;
  current: Health | null;
  currentReason: string | null;
  setHealth: (id: string, h: Health, reason: string) => Promise<Result>;
}) {
  const [picked, setPicked] = useState<Health | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const colors: Record<Health, string> = {
    red: 'bg-rose-500 text-white border-rose-500',
    amber: 'bg-amber-500 text-white border-amber-500',
    green: 'bg-emerald-500 text-white border-emerald-500',
  };

  return (
    <div data-testid="health-control">
      <div className="flex gap-1.5">
        {(['red', 'amber', 'green'] as Health[]).map((h) => (
          <button
            key={h}
            type="button"
            data-testid={`set-health-${h}`}
            onClick={() => {
              setPicked(h);
              setError(null);
            }}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition ${
              picked === h || (!picked && current === h)
                ? colors[h]
                : 'border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800'
            }`}
          >
            {h}
          </button>
        ))}
      </div>
      {current && !picked && (
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
          <span className="font-medium capitalize">{current}</span> — {currentReason}
        </p>
      )}
      {picked && (
        <div className="mt-2">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500">
            Reason (required)
          </label>
          <textarea
            data-testid="health-reason"
            className={`${input} mt-1`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this deal this colour today?"
          />
          {error && (
            <p data-testid="health-error" className="mt-1 text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-testid="health-save"
              disabled={pending}
              className={btnPrimary}
              onClick={() =>
                start(async () => {
                  const res = await setHealth(dealId, picked, reason);
                  if (res.ok) {
                    setPicked(null);
                    setReason('');
                    router.refresh();
                  } else setError(res.error);
                })
              }
            >
              {pending ? 'Saving…' : `Set ${picked}`}
            </button>
            <button type="button" className={btn} onClick={() => setPicked(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** AU-1: drag and drop is never the only way to move a card. */
export function MoveToMenu({
  dealId,
  stages,
  current,
  move,
  label = 'Move to',
}: {
  dealId: string;
  stages: { key: string; label: string; is_terminal: boolean }[];
  current: string;
  move: (id: string, stage: string, reason?: string, closeReason?: string) => Promise<Result>;
  label?: string;
}) {
  const [target, setTarget] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const terminal = stages.find((s) => s.key === target)?.is_terminal;

  return (
    <div data-testid="move-to">
      <label className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</label>
      <select
        data-testid="move-to-select"
        className={`${input} mt-1`}
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setError(null);
        }}
      >
        <option value="">Choose a stage…</option>
        {stages
          .filter((s) => s.key !== current)
          .map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
      </select>
      {terminal && (
        <input
          data-testid="move-close-reason"
          className={`${input} mt-2`}
          placeholder="Reason for closing (required)"
          value={closeReason}
          onChange={(e) => setCloseReason(e.target.value)}
        />
      )}
      {error && (
        <p data-testid="move-error" className="mt-2 rounded-md bg-rose-50 px-2.5 py-1.5 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}
      <button
        type="button"
        data-testid="move-to-submit"
        className={`${btn} mt-2`}
        disabled={!target || pending}
        onClick={() =>
          start(async () => {
            const res = await move(dealId, target, undefined, closeReason);
            if (res.ok) {
              setTarget('');
              setCloseReason('');
              setError(null);
              router.refresh();
            } else setError(res.error);
          })
        }
      >
        {pending ? 'Moving…' : 'Move'}
      </button>
    </div>
  );
}

export function Disclosure({
  label,
  children,
  testId,
}: {
  label: string;
  children: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        data-testid={testId}
        className={btn}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? 'Close' : label}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}

export function ConfirmButton({
  label,
  confirmLabel,
  run,
  testId,
}: {
  label: string;
  confirmLabel: string;
  run: () => Promise<Result>;
  testId?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span>
      <button
        type="button"
        data-testid={testId}
        className="text-xs font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-400"
        disabled={pending}
        onClick={() => {
          if (!armed) return setArmed(true);
          start(async () => {
            const res = await run();
            if (res.ok) {
              setArmed(false);
              router.refresh();
            } else setError(res.error);
          });
        }}
      >
        {pending ? '…' : armed ? confirmLabel : label}
      </button>
      {error && <span className="ml-2 text-xs text-rose-600">{error}</span>}
    </span>
  );
}
