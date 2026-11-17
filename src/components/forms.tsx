'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type ReactNode } from 'react';
import type { Result } from '@/lib/actions';
import type { Health } from '@/lib/types';

export const input =
  'w-full rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper)] px-2.5 py-1.5 text-[13px] leading-5 text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none transition focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--accent-100)]';
export const btn =
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--paper)] px-2.5 py-[5px] text-[12px] font-medium leading-5 text-[var(--ink)] transition hover:border-[var(--accent-200)] hover:bg-[var(--accent-50)] hover:text-[var(--accent-ink)] disabled:opacity-40';
export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--action)] px-2.5 py-[5px] text-[12px] font-medium leading-5 text-[var(--on-action)] shadow-[var(--lift-accent)] transition hover:bg-[var(--action-hover)] disabled:opacity-40';
export const btnQuiet =
  'text-[12px] font-medium text-[var(--accent-ink)] underline-offset-2 transition hover:underline disabled:opacity-40';
export const label = 't-label block';

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
        <p data-testid="form-error" className="mt-2 rounded-md bg-[var(--red-soft)] px-2.5 py-1.5 text-[13px] text-[var(--red)]">
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

  const picked_: Record<Health, string> = {
    red: 'bg-[var(--red-dot)] text-white',
    amber: 'bg-[var(--amber)] text-white',
    green: 'bg-[var(--green-ink)] text-white',
  };

  return (
    <div data-testid="health-control">
      <div className="inline-flex rounded-[var(--radius-sm)] bg-[var(--paper-sunk)] p-0.5">
        {(['red', 'amber', 'green'] as Health[]).map((h) => {
          const on = picked === h || (!picked && current === h);
          return (
            <button
              key={h}
              type="button"
              data-testid={`set-health-${h}`}
              onClick={() => {
                setPicked(h);
                setError(null);
              }}
              className={`rounded-[4px] px-2.5 py-1 text-[12px] font-medium capitalize leading-5 transition ${
                on ? picked_[h] : 'text-[var(--ink-muted)] hover:text-[var(--ink)]'
              }`}
            >
              {h}
            </button>
          );
        })}
      </div>
      {current && !picked && (
        <p className="mt-2 text-[12px] text-[var(--ink-muted)]">
          <span className="font-medium capitalize">{current}</span> — {currentReason}
        </p>
      )}
      {picked && (
        <div className="mt-2">
          <label className={label}>Reason (required)</label>
          <textarea
            data-testid="health-reason"
            className={`${input} mt-1`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this deal this colour today?"
          />
          {error && (
            <p data-testid="health-error" className="mt-1 text-[13px] text-[var(--red)]">
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
  menuLabel = 'Move to',
}: {
  dealId: string;
  stages: { key: string; label: string; is_terminal: boolean }[];
  current: string;
  move: (id: string, stage: string, reason?: string, closeReason?: string) => Promise<Result>;
  menuLabel?: string;
}) {
  const [target, setTarget] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const terminal = stages.find((s) => s.key === target)?.is_terminal;

  return (
    <div data-testid="move-to">
      <span className={label}>{menuLabel}</span>
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
        <p data-testid="move-error" className="mt-2 rounded-md bg-[var(--amber-soft)] px-2.5 py-1.5 text-[13px] text-[var(--amber)]">
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
        className={btnQuiet}
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
      {error && <span className="ml-2 text-[12px] text-[var(--red)]">{error}</span>}
    </span>
  );
}
