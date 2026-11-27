'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { askQuestionAction, setBlockerAction } from '@/lib/question-actions';
import { updateDealAction } from '@/lib/actions';
import { ActionForm, input } from './forms';

export const ANCHOR_OPTIONS: { key: string; label: string }[] = [
  { key: 'general', label: 'The deal in general' },
  { key: 'stage', label: 'Stage and progress' },
  { key: 'next_step', label: 'Next step' },
  { key: 'criteria', label: 'Success criteria' },
  { key: 'snapshot', label: 'Deal details' },
  { key: 'billing', label: 'Billing' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'usage', label: 'Usage' },
  { key: 'timeline', label: 'An email or conversation' },
];

/** Ask one person a question about one part of a deal. */
export function AskForm({
  dealId,
  people,
  anchor,
  about,
  defaultTo,
}: {
  dealId: string;
  people: { id: string; name: string }[];
  anchor?: string;
  about?: string;
  defaultTo?: string | null;
}) {
  return (
    <ActionForm action={askQuestionAction} submitLabel="Ask" testId="ask-form">
      <input type="hidden" name="deal_id" value={dealId} />
      {/* What it is about comes from where the person clicked "Ask", not a form field. */}
      <input type="hidden" name="anchor" value={anchor ?? 'general'} />
      {about && <input type="hidden" name="anchor_note" value={about} />}
      {(anchor && anchor !== 'general') || about ? (
        <p className="mb-2 text-[12px] text-[var(--ink-muted)]">
          About: {ANCHOR_OPTIONS.find((a) => a.key === anchor)?.label ?? 'The deal in general'}
          {about ? ` · ${about}` : ''}
        </p>
      ) : null}
      <label className="t-label block">
        Ask
        <select name="asked_to" defaultValue={defaultTo ?? ''} className={`${input} mt-1`} data-testid="ask-to">
          <option value="">Anyone on the team</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="t-label mt-2 block">
        Question
        <textarea name="body" rows={2} className={`${input} mt-1`} required data-testid="ask-body" />
      </label>
    </ActionForm>
  );
}


export const BLOCKERS: { key: string; label: string }[] = [
  { key: 'client', label: 'The client' },
  { key: 'us', label: 'Us' },
  { key: 'product', label: 'Product or tech' },
  { key: 'data', label: 'Data' },
  { key: 'commercial', label: 'Commercials' },
];

export function BlockerForm({
  dealId,
  blockedOn,
  note,
}: {
  dealId: string;
  blockedOn: string | null;
  note: string | null;
}) {
  return (
    <ActionForm action={setBlockerAction} submitLabel={blockedOn ? 'Update' : 'Mark stuck'} testId="blocker-form" resetOnSuccess={false}>
      <input type="hidden" name="deal_id" value={dealId} />
      <label className="t-label block">
        Waiting on
        <select name="blocked_on" defaultValue={blockedOn ?? ''} className={`${input} mt-1`} data-testid="blocked-on">
          <option value="">Nothing, it is moving</option>
          {BLOCKERS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <label className="t-label mt-2 block">
        Stuck on what
        <input name="blocker_note" defaultValue={note ?? ''} className={`${input} mt-1`} placeholder="e.g. Waiting for the lead list from their CRM" data-testid="blocker-note" />
      </label>
    </ActionForm>
  );
}

/** The CRM question, answered in one click wherever the deal is shown. */
export function CrmToggle({ dealId, value }: { dealId: string; value: boolean | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const choose = (v: 'yes' | 'no') =>
    start(async () => {
      const f = new FormData();
      f.set('crm_required', v);
      const res = await updateDealAction(dealId, f);
      if (res.ok) {
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  const opt = (v: 'yes' | 'no', label: string) => {
    const on = (v === 'yes' && value === true) || (v === 'no' && value === false);
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => choose(v)}
        aria-pressed={on}
        data-testid={`crm-${v}`}
        className={`px-2.5 py-0.5 text-[12px] transition ${
          on ? 'bg-[var(--accent)] font-medium text-[var(--on-accent)]' : 'text-[var(--ink-muted)] hover:bg-[var(--accent-50)]'
        }`}
      >
        {label}
      </button>
    );
  };
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="inline-flex overflow-hidden rounded-md border border-[var(--line-strong)]" role="group" aria-label="CRM integration required">
        {opt('yes', 'Yes')}
        <span className="w-px bg-[var(--line-strong)]" />
        {opt('no', 'No')}
      </span>
      {value === null && <span className="text-[12px] font-medium text-[var(--red)]">Not answered</span>}
      {error && <span className="text-[12px] text-[var(--red)]">{error}</span>}
    </span>
  );
}
