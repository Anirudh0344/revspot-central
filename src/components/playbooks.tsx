'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { Run, Step, StepKind, Trigger } from '@/lib/playbooks';
import {
  dismissRunAction,
  saveRunAction,
  savePlaybookAction,
  startPlaybookAction,
  type PlaybookInput,
} from '@/lib/playbook-actions';
import { btn, btnPrimary, btnQuiet, input, label } from './forms';
import { CompleteTask } from './task-widgets';

/* ------------------------------------------------------------ start one */

export function StartPlaybook({
  dealId,
  playbooks,
}: {
  dealId: string;
  playbooks: { id: string; name: string; description: string | null }[];
}) {
  const [picked, setPicked] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const desc = playbooks.find((p) => p.id === picked)?.description;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Playbook"
          className={`${input} max-w-[18rem]`}
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          data-testid="playbook-picker"
        >
          <option value="">Choose a playbook…</option>
          {playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn}
          disabled={!picked || pending}
          data-testid="start-playbook"
          onClick={() =>
            start(async () => {
              const res = await startPlaybookAction(dealId, picked);
              if (res.ok) {
                setPicked('');
                setError(null);
                router.refresh();
              } else setError(res.error);
            })
          }
        >
          {pending ? 'Starting…' : 'Start'}
        </button>
      </div>
      {desc && <p className="mt-1.5 text-[12px] text-[var(--ink-muted)]">{desc}</p>}
      {error && <p className="mt-1.5 text-[12px] text-[var(--red)]">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- run one */

export function RunPanel({ run, dealId, open: openByDefault }: { run: Run; dealId: string; open?: boolean }) {
  const [open, setOpen] = useState(Boolean(openByDefault));
  const [answers, setAnswers] = useState<Record<string, string>>(run.answers ?? {});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const live = run.status === 'in_progress';

  const questions = run.steps.filter((s) => s.kind === 'question');
  const answered = questions.filter((q) => answers[q.id]?.trim()).length;
  const tasksDone = run.tasks.filter((t) => t.status === 'done').length;

  function save(complete: boolean) {
    start(async () => {
      const res = await saveRunAction(run.id, answers, complete);
      if (res.ok) {
        setError(null);
        setSaved(!complete);
        router.refresh();
      } else setError(res.error);
    });
  }

  return (
    <div className="rounded-[var(--radius-sm)] border border-[var(--line)]" data-testid="playbook-run">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
          {run.playbook_name}
          {run.started_via === 'trigger' && live && (
            <span className="tag bg-[var(--tag-bg)] text-[var(--ink-muted)]">Started automatically</span>
          )}
          {!live && <span className="tag bg-[var(--green-soft)] text-[var(--green-ink)]">Completed</span>}
        </span>
        <span className="text-[12px] tabular-nums text-[var(--ink-muted)]">
          {questions.length > 0 && `${answered}/${questions.length} answered`}
          {questions.length > 0 && run.tasks.length > 0 && ' · '}
          {run.tasks.length > 0 && `${tasksDone}/${run.tasks.length} tasks`}
          <span className="ml-2 text-[var(--ink-faint)]">{open ? '▴' : '▾'}</span>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-[var(--line)] px-3 py-3">
          {run.steps.map((s, i) => (
            <div key={s.id} className="flex gap-3">
              <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] tabular-nums text-[var(--ink-faint)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                {s.kind === 'guide' && (
                  <div className="rounded-md bg-[var(--paper-sunk)] px-3 py-2">
                    <p className="text-[13px] font-medium">{s.title}</p>
                    {s.body && <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{s.body}</p>}
                  </div>
                )}

                {s.kind === 'question' && (
                  <div>
                    <p className="text-[13px] font-medium">{s.title}</p>
                    {s.body && <p className="text-[12px] text-[var(--ink-muted)]">{s.body}</p>}
                    {s.options?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {s.options.map((o) => {
                          const on = answers[s.id] === o;
                          return (
                            <button
                              key={o}
                              type="button"
                              disabled={!live}
                              onClick={() => setAnswers((a) => ({ ...a, [s.id]: on ? '' : o }))}
                              className={`rounded-full border px-2.5 py-0.5 text-[12px] transition ${
                                on
                                  ? 'border-[var(--accent)] bg-[var(--accent-100)] text-[var(--accent-deep)]'
                                  : 'border-[var(--line-strong)] text-[var(--ink-muted)] hover:border-[var(--accent-200)]'
                              }`}
                            >
                              {o}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        rows={2}
                        disabled={!live}
                        value={answers[s.id] ?? ''}
                        onChange={(e) => setAnswers((a) => ({ ...a, [s.id]: e.target.value }))}
                        className={`${input} mt-1.5`}
                        placeholder="Their answer"
                      />
                    )}
                  </div>
                )}

                {s.kind === 'task' && (
                  <TaskStep step={s} run={run} dealId={dealId} />
                )}
              </div>
            </div>
          ))}

          {error && <p className="rounded-md bg-[var(--red-soft)] px-2.5 py-1.5 text-[12px] text-[var(--red)]">{error}</p>}

          {live ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
              <button type="button" className={btnPrimary} disabled={pending} onClick={() => save(true)} data-testid="complete-playbook">
                Complete and log
              </button>
              <button type="button" className={btn} disabled={pending} onClick={() => save(false)}>
                Save answers
              </button>
              {saved && <span className="text-[12px] text-[var(--ink-muted)]">Saved</span>}
              <button
                type="button"
                className="ml-auto text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)] hover:underline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await dismissRunAction(run.id);
                    if (res.ok) router.refresh();
                    else setError(res.error);
                  })
                }
              >
                Dismiss
              </button>
            </div>
          ) : (
            <p className="text-[12px] text-[var(--ink-faint)]">Logged as a note on this deal.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TaskStep({ step, run, dealId }: { step: Step; run: Run; dealId: string }) {
  const task = run.tasks.find((t) => t.title === step.title);
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className={`text-[13px] ${task?.status === 'done' ? 'text-[var(--ink-faint)] line-through' : 'font-medium'}`}>
          {step.title}
        </p>
        <p className="text-[11px] text-[var(--ink-faint)]">
          Task{task?.due_date ? ` · due ${task.due_date}` : ''}
          {task?.status === 'cancelled' && ' · cancelled'}
        </p>
      </div>
      {task && task.status === 'open' && <CompleteTask taskId={task.id} dealId={dealId} />}
    </div>
  );
}

/* ---------------------------------------------------------- the editor */

const KIND_LABEL: Record<StepKind, string> = { question: 'Question', task: 'Task', guide: 'Guidance' };

export function PlaybookEditor({
  id,
  initial,
  stages,
}: {
  id: string | null;
  initial: PlaybookInput;
  stages: { category: string; key: string; label: string }[];
}) {
  const [v, setV] = useState<PlaybookInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const set = <K extends keyof PlaybookInput>(k: K, val: PlaybookInput[K]) => {
    setSaved(false);
    setV((x) => ({ ...x, [k]: val }));
  };
  const setStep = (i: number, patch: Partial<Step>) =>
    set('steps', v.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...v.steps];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    set('steps', next);
  };
  const stageChoices = stages.filter((s) => !v.category || s.category === v.category);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={label}>Name</label>
          <input className={`${input} mt-1`} value={v.name} onChange={(e) => set('name', e.target.value)} data-testid="pb-name" />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>What it is for</label>
          <input className={`${input} mt-1`} value={v.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div>
          <label className={label}>Deals it applies to</label>
          <select
            className={`${input} mt-1`}
            value={v.category}
            onChange={(e) => set('category', e.target.value as PlaybookInput['category'])}
          >
            <option value="">Any deal</option>
            <option value="pilot">Pilot</option>
            <option value="retention">Retention</option>
            <option value="expansion">Expansion</option>
          </select>
        </div>
        <div>
          <label className={label}>Starts</label>
          <select className={`${input} mt-1`} value={v.trigger} onChange={(e) => set('trigger', e.target.value as Trigger)} data-testid="pb-trigger">
            <option value="manual">By hand, from a deal</option>
            <option value="stage_entered">When a deal enters a stage</option>
            <option value="health_red">When a deal turns red</option>
            <option value="deal_created">When a deal is created</option>
          </select>
        </div>
        {v.trigger === 'stage_entered' && (
          <div>
            <label className={label}>Stage</label>
            <select className={`${input} mt-1`} value={v.trigger_stage} onChange={(e) => set('trigger_stage', e.target.value)}>
              <option value="">Choose…</option>
              {stageChoices.map((s) => (
                <option key={`${s.category}-${s.key}`} value={s.key}>
                  {v.category ? s.label : `${s.label} (${s.category})`}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 self-end pb-1.5 text-[13px]">
          <input type="checkbox" checked={v.is_active} onChange={(e) => set('is_active', e.target.checked)} className="accent-[var(--action)]" />
          Active
        </label>
      </div>

      <div>
        <p className="t-label">Steps</p>
        <ol className="mt-2 space-y-2">
          {v.steps.map((s, i) => (
            <li key={s.id} className="rounded-[var(--radius-sm)] border border-[var(--line)] p-2.5" data-testid="pb-step">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-4 text-right text-[11px] tabular-nums text-[var(--ink-faint)]">{i + 1}</span>
                <select
                  aria-label="Step type"
                  className={`${input} w-auto`}
                  value={s.kind}
                  onChange={(e) => setStep(i, { kind: e.target.value as StepKind })}
                >
                  {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Step"
                  className={`${input} min-w-[12rem] flex-1`}
                  value={s.title}
                  placeholder={s.kind === 'task' ? 'What to do' : s.kind === 'question' ? 'What to ask' : 'Heading'}
                  onChange={(e) => setStep(i, { title: e.target.value })}
                />
                {s.kind === 'task' && (
                  <label className="flex items-center gap-1 text-[12px] text-[var(--ink-muted)]">
                    due in
                    <input
                      type="number"
                      min={0}
                      max={90}
                      className={`${input} w-16`}
                      value={s.due_days ?? 3}
                      onChange={(e) => setStep(i, { due_days: Number(e.target.value) })}
                    />
                    days
                  </label>
                )}
                <span className="ml-auto flex gap-1">
                  <button type="button" className={btnQuiet} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                  <button type="button" className={btnQuiet} disabled={i === v.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                  <button
                    type="button"
                    className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)]"
                    onClick={() => set('steps', v.steps.filter((_, j) => j !== i))}
                    aria-label="Remove step"
                  >
                    ✕
                  </button>
                </span>
              </div>
              {s.kind !== 'task' && (
                <input
                  className={`${input} mt-2`}
                  value={s.body ?? ''}
                  placeholder={s.kind === 'guide' ? 'What to say or do' : 'Hint for whoever asks (optional)'}
                  onChange={(e) => setStep(i, { body: e.target.value })}
                />
              )}
              {s.kind === 'question' && (
                <input
                  className={`${input} mt-2`}
                  value={(s.options ?? []).join(', ')}
                  placeholder="Answer choices, comma separated (leave empty for a free answer)"
                  onChange={(e) => setStep(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-2 flex gap-2">
          {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => (
            <button
              key={k}
              type="button"
              className={btn}
              data-testid={`pb-add-${k}`}
              onClick={() =>
                set('steps', [...v.steps, { id: `s${Date.now().toString(36)}`, kind: k, title: '', ...(k === 'task' ? { due_days: 3 } : {}) }])
              }
            >
              + {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-md bg-[var(--red-soft)] px-2.5 py-1.5 text-[13px] text-[var(--red)]">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btnPrimary}
          disabled={pending}
          data-testid="pb-save"
          onClick={() =>
            start(async () => {
              const res = await savePlaybookAction(id, v);
              if (res.ok) {
                setError(null);
                setSaved(true);
                if (!id && res.id) router.push(`/playbooks/${res.id}`);
                else router.refresh();
              } else setError(res.error);
            })
          }
        >
          {pending ? 'Saving…' : 'Save playbook'}
        </button>
        {saved && <span className="text-[12px] text-[var(--ink-muted)]">Saved</span>}
      </div>
    </div>
  );
}
