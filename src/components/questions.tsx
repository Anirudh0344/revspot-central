'use client';

import Link from 'next/link';
import { askQuestionAction, setBlockerAction } from '@/lib/question-actions';
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
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="t-label block">
          About
          <select name="anchor" defaultValue={anchor ?? 'general'} className={`${input} mt-1`} data-testid="ask-anchor">
            {ANCHOR_OPTIONS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
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
      </div>
      <label className="t-label mt-2 block">
        Specifically
        <input name="anchor_note" defaultValue={about ?? ''} className={`${input} mt-1`} placeholder="Optional: the exact item, e.g. an email subject or a target" />
      </label>
      <label className="t-label mt-2 block">
        Question
        <textarea name="body" rows={2} className={`${input} mt-1`} required data-testid="ask-body" placeholder="What do you need to know?" />
      </label>
    </ActionForm>
  );
}

/** A small "Ask" link for a card header; opens the ask form with the part filled in. */
export function AskLink({ dealId, anchor }: { dealId: string; anchor: string }) {
  return (
    <Link
      href={`/deals/${dealId}?ask=${anchor}#ask`}
      className="text-[12px] text-[var(--ink-muted)] hover:text-[var(--accent-ink)] hover:underline"
      data-testid={`ask-${anchor}`}
    >
      Ask
    </Link>
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
