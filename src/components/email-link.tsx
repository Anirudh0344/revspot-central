'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addClientDomainAction,
  attachEmailToDealAction,
  linkDealContactAction,
  removeClientDomainAction,
  unlinkDealContactAction,
} from '@/lib/email-link-actions';
import type { Result } from '@/lib/actions';
import { ActionForm, btnQuiet, input } from './forms';

type Contact = { id: string; name: string; role: string; email: string | null };

/** Runs one server action from a button and refreshes, showing any error inline. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const run = (fn: () => Promise<Result & { filed?: number }>, done?: (filed: number) => string | null) =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else {
        setNote(done?.(r.filed ?? 0) ?? null);
        router.refresh();
      }
    });
  return { pending, error, note, run };
}

const filedNote = (n: number) => (n ? `${n} earlier email${n > 1 ? 's' : ''} filed on this deal.` : null);

/**
 * The deal's people. Gmail sync uses these links to put an email on this deal when
 * the people on it work on no other live deal.
 */
export function DealContacts({
  dealId,
  clientId,
  linked,
  clientContacts,
  canWrite,
}: {
  dealId: string;
  clientId: string;
  linked: Contact[];
  clientContacts: Contact[];
  canWrite: boolean;
}) {
  const { pending, error, note, run } = useRun();
  const [pick, setPick] = useState('');
  const linkedIds = new Set(linked.map((c) => c.id));
  const available = clientContacts.filter((c) => !linkedIds.has(c.id));

  return (
    <div data-testid="deal-contacts">
      <ul className="flex flex-wrap gap-2">
        {linked.map((c) => (
          <li key={c.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[13px]">
            <span>{c.name}</span>
            <span className="text-[12px] text-[var(--ink-muted)]">{c.role.replaceAll('_', ' ')}</span>
            {canWrite && (
              <button
                type="button"
                className="ml-1 text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)]"
                aria-label={`Unlink ${c.name}`}
                disabled={pending}
                data-testid={`unlink-contact-${c.id}`}
                onClick={() => run(() => unlinkDealContactAction(dealId, c.id))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {linked.length === 0 && (
        <p className="text-[13px] text-[var(--ink-faint)]">
          No one linked yet. Link the client&rsquo;s people who work on this deal, and their emails land here.
        </p>
      )}

      {canWrite && available.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select
            className={`${input} w-auto min-w-[14rem] flex-1`}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            data-testid="deal-contact-select"
            aria-label="Contact to link"
          >
            <option value="">Link a contact…</option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` · ${c.email}` : ' · no email'}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnQuiet}
            disabled={!pick || pending}
            data-testid="deal-contact-link"
            onClick={() => run(() => linkDealContactAction(dealId, pick), filedNote)}
          >
            {pending ? 'Linking…' : 'Link'}
          </button>
        </div>
      )}
      {canWrite && available.length === 0 && clientContacts.length === 0 && (
        <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
          The client has no contacts yet.{' '}
          <Link href={`/clients/${clientId}?tab=contacts`} className="underline">
            Add one on the client page
          </Link>
          .
        </p>
      )}
      {note && <p className="mt-2 text-[12px] text-[var(--green-ink)]">{note}</p>}
      {error && <p className="mt-2 text-[12px] text-[var(--red)]">{error}</p>}
    </div>
  );
}

/** The email domains Gmail sync uses to recognise this client's mail. */
export function ClientDomains({
  clientId,
  domains,
  canWrite,
}: {
  clientId: string;
  domains: { id: string; domain: string }[];
  canWrite: boolean;
}) {
  const { pending, error, run } = useRun();
  return (
    <div data-testid="client-domains">
      <p className="text-[12px] text-[var(--ink-muted)]">
        Gmail sync logs any email to or from these domains on this client, and adds the people on it as contacts.
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {domains.map((d) => (
          <li key={d.id} className="flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-2.5 py-1 text-[13px]">
            {d.domain}
            {canWrite && (
              <button
                type="button"
                className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)]"
                aria-label={`Remove ${d.domain}`}
                disabled={pending}
                data-testid={`remove-domain-${d.domain}`}
                onClick={() => run(() => removeClientDomainAction(clientId, d.id))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {domains.length === 0 && (
        <p className="mt-2 text-[13px] text-[var(--amber)]">
          None yet, so no email is synced for this client.
        </p>
      )}
      {error && <p className="mt-2 text-[12px] text-[var(--red)]">{error}</p>}
      {canWrite && (
        <ActionForm
          testId="add-domain-form"
          submitLabel="Add domain"
          resetOnSuccess
          action={(f) => addClientDomainAction(clientId, f)}
          className="mt-3"
        >
          <input name="domain" className={input} placeholder="godrejproperties.com" data-testid="domain-input" aria-label="Email domain" />
        </ActionForm>
      )}
    </div>
  );
}

/** Files an unassigned email on one of the client's live deals (with its thread). */
export function FileEmailOnDeal({
  interactionId,
  deals,
}: {
  interactionId: string;
  deals: { id: string; title: string }[];
}) {
  const { pending, error, note, run } = useRun();
  if (deals.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <select
        className="rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-1.5 py-0.5 text-[12px]"
        defaultValue=""
        disabled={pending}
        aria-label="File this email on a deal"
        data-testid={`file-email-${interactionId}`}
        onChange={(e) => {
          const dealId = e.target.value;
          if (dealId) run(() => attachEmailToDealAction(interactionId, dealId), (n) => (n > 1 ? `Filed with ${n - 1} more from the thread.` : null));
        }}
      >
        <option value="">File on a deal…</option>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      {note && <span className="text-[12px] text-[var(--green-ink)]">{note}</span>}
      {error && <span className="text-[12px] text-[var(--red)]">{error}</span>}
    </span>
  );
}
