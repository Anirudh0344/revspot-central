'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TimelineItem, TimelineKind, Upcoming } from '@/lib/timeline';
import { istDateTime, relativeDue } from '@/lib/format';
import { replyQuestionAction, setQuestionStatusAction } from '@/lib/question-actions';
import { ActionForm, input } from './forms';
import { Badge, Empty } from './ui';

const FILTERS: { key: TimelineKind | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'email', label: 'Emails' },
  { key: 'conversation', label: 'Calls & meetings' },
  { key: 'note', label: 'Notes' },
  { key: 'question', label: 'Questions' },
  { key: 'task', label: 'Tasks' },
  { key: 'change', label: 'Changes' },
];

const ANCHOR_LABEL: Record<string, string> = {
  general: 'the deal',
  stage: 'stage and progress',
  next_step: 'the next step',
  criteria: 'success criteria',
  snapshot: 'deal details',
  billing: 'billing',
  tasks: 'tasks',
  contacts: 'contacts',
  usage: 'usage',
  timeline: 'a conversation',
};

const DOT: Record<string, string> = {
  email: 'bg-[var(--accent)]',
  conversation: 'bg-[var(--green)]',
  note: 'bg-[var(--ink-faint)]',
  question: 'bg-[var(--amber-dot)]',
  task: 'bg-[var(--accent-200)]',
  change: 'bg-[var(--line-strong)]',
};

function monthOf(at: string) {
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(at));
}

export function Timeline({
  dealId,
  items,
  upcoming,
  counts,
  meId,
  mailboxes,
}: {
  dealId: string;
  items: TimelineItem[];
  upcoming: Upcoming[];
  counts: Record<string, number>;
  meId: string;
  mailboxes: number;
}) {
  const [filter, setFilter] = useState<TimelineKind | 'all'>('all');
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter);

  const months = shown.map((i) => monthOf(i.at));
  return (
    <div data-testid="timeline">
      {upcoming.length > 0 && (
        <div className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--paper-tint)] p-3" data-testid="timeline-upcoming">
          <p className="t-label mb-2">Upcoming</p>
          <ul className="space-y-1.5">
            {upcoming.map((u) => (
              <li key={u.key} className="flex items-baseline gap-2 text-[13px]">
                <span className={`w-32 shrink-0 whitespace-nowrap text-[12px] tabular-nums ${u.overdue ? 'font-semibold text-[var(--red)]' : 'text-[var(--ink-muted)]'}`}>
                  {u.kind === 'scheduled' ? istDateTime(u.date) : relativeDue(u.date)}
                </span>
                <span className="min-w-0 flex-1">
                  {u.title}
                  {u.detail && <span className="ml-1.5 text-[12px] text-[var(--ink-faint)]">{u.detail}</span>}
                </span>
                {u.who && <span className="shrink-0 text-[12px] text-[var(--ink-muted)]">{u.who}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="scroll-x mb-3 flex gap-1 overflow-x-auto" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            data-testid={`timeline-filter-${f.key}`}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[12px] transition ${
              filter === f.key
                ? 'bg-[var(--accent-100)] font-medium text-[var(--accent-deep)]'
                : 'text-[var(--ink-muted)] hover:bg-[var(--accent-50)]'
            }`}
          >
            {f.label}
            <span className="ml-1 tabular-nums text-[var(--ink-faint)]">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {filter === 'email' && shown.length === 0 && (
        <p className="mb-2 text-[13px] text-[var(--ink-muted)]">
          {mailboxes === 0 ? (
            <>
              No mailbox is connected, so client emails can&rsquo;t reach this deal yet.{' '}
              <Link href="/settings" className="text-[var(--accent-ink)] hover:underline">Connect your Gmail</Link>
            </>
          ) : (
            'No email with this deal’s contacts yet. Emails attach to a deal when everyone on them is linked to it.'
          )}
        </p>
      )}
      {shown.length === 0 && filter !== 'email' && <Empty>Nothing here yet.</Empty>}

      <ol className="relative space-y-0">
        {shown.map((item, idx) => {
          const month = months[idx];
          const header = idx === 0 || month !== months[idx - 1];
          return (
            <li key={item.key} id={item.kind === 'question' ? `q-${item.id}` : undefined}>
              {header && <p className="t-label mb-2 mt-3 first:mt-0">{month}</p>}
              <div className="relative flex gap-3 pb-3">
                <span className="absolute bottom-0 left-[5px] top-4 w-px bg-[var(--line)]" aria-hidden />
                <span className={`relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full ring-2 ring-[var(--paper)] ${DOT[item.kind]}`} />
                <div className="min-w-0 flex-1">
                  <Entry item={item} dealId={dealId} meId={meId} />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-[var(--ink-muted)]">{children}</p>;
}

function Entry({ item, dealId, meId }: { item: TimelineItem; dealId: string; meId: string }) {
  switch (item.kind) {
    case 'email':
      return <EmailThread item={item} dealId={dealId} />;
    case 'conversation':
    case 'note':
      return (
        <div>
          <Meta>
            <span className="font-medium text-[var(--ink)]">
              {item.channel === 'note' ? 'Note' : item.channel === 'whatsapp' ? 'WhatsApp' : item.channel[0].toUpperCase() + item.channel.slice(1)}
            </span>
            {item.direction && item.channel !== 'note' && ` · ${item.direction}`}
            {item.by && ` · ${item.by}`} · {istDateTime(item.at)}
          </Meta>
          <p className="mt-0.5 whitespace-pre-line text-[13px]">{item.summary}</p>
          {item.participants.length > 0 && (
            <p className="mt-0.5 text-[12px] text-[var(--ink-faint)]">With {item.participants.join(', ')}</p>
          )}
          {item.nextStep && <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Next: {item.nextStep}</p>}
        </div>
      );
    case 'question':
      return <QuestionEntry item={item} meId={meId} />;
    default:
      return (
        <div>
          <p className="text-[13px]">
            <span className={item.tone === 'bad' ? 'text-[var(--red)]' : ''}>{item.title}</span>
          </p>
          {item.detail && <p className="mt-0.5 whitespace-pre-line text-[12px] text-[var(--ink-muted)]">{item.detail}</p>}
          <Meta>
            {item.by ?? 'System'} · {istDateTime(item.at)}
            {item.reason && <span className="italic"> · &ldquo;{item.reason}&rdquo;</span>}
          </Meta>
        </div>
      );
  }
}

function EmailThread({ item, dealId }: { item: Extract<TimelineItem, { kind: 'email' }>; dealId: string }) {
  const [open, setOpen] = useState(false);
  const last = item.messages[item.messages.length - 1];
  const inbound = item.messages.filter((m) => m.direction === 'inbound').length;
  return (
    <div className="rounded-lg border border-[var(--line)]" data-testid="email-thread">
      <button type="button" onClick={() => setOpen(!open)} className="w-full p-2.5 text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{item.subject}</span>
          <Badge>{item.messages.length} {item.messages.length === 1 ? 'email' : 'emails'}</Badge>
          {inbound > 0 && <Badge tone="brand">{inbound} from client</Badge>}
        </div>
        {!open && <p className="mt-1 line-clamp-2 text-[12px] text-[var(--ink-muted)]">{last.summary}</p>}
        <Meta>
          {last.direction === 'inbound' ? 'Last from the client' : 'Last from us'} · {istDateTime(item.at)}
          {item.mailboxes.length > 0 && ` · ${item.mailboxes.join(', ')}`}
        </Meta>
      </button>
      {open && (
        <ol className="space-y-2 border-t border-[var(--line)] p-2.5">
          {item.messages.map((m) => (
            <li key={m.id} className={`border-l-2 pl-2.5 ${m.direction === 'inbound' ? 'border-[var(--accent)]' : 'border-[var(--line)]'}`}>
              <Meta>
                {m.direction === 'inbound' ? 'Client' : 'Us'} · {istDateTime(m.at)}
              </Meta>
              <p className="text-[13px]">{m.summary}</p>
              {m.participants.length > 0 && (
                <p className="text-[11px] text-[var(--ink-faint)]">{m.participants.join(', ')}</p>
              )}
            </li>
          ))}
          <li>
            <Link
              href={`/deals/${dealId}?ask=timeline&about=${encodeURIComponent(item.subject)}#ask`}
              className="text-[12px] text-[var(--accent-ink)] hover:underline"
            >
              Ask about this thread
            </Link>
          </li>
        </ol>
      )}
    </div>
  );
}

function QuestionEntry({ item, meId }: { item: Extract<TimelineItem, { kind: 'question' }>; meId: string }) {
  const [replying, setReplying] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const canClose = item.byId === meId || item.toId === meId;
  return (
    <div
      className={`rounded-lg border p-2.5 ${item.status === 'open' ? 'border-[color-mix(in_srgb,var(--amber)_35%,white)] bg-[var(--amber-soft)]' : 'border-[var(--line)]'}`}
      data-testid="question"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={item.status === 'open' ? 'warn' : item.status === 'answered' ? 'brand' : 'good'}>
          {item.status === 'open' ? 'Open question' : item.status === 'answered' ? 'Answered' : 'Resolved'}
        </Badge>
        <span className="text-[12px] text-[var(--ink-muted)]">
          {item.by ?? 'Someone'} asked {item.to ?? 'the team'} about {ANCHOR_LABEL[item.anchor] ?? item.anchor}
          {item.anchorNote && <>: &ldquo;{item.anchorNote}&rdquo;</>} · {istDateTime(item.at)}
        </span>
      </div>
      <p className="mt-1 whitespace-pre-line text-[13px] font-medium">{item.body}</p>
      {item.replies.length > 0 && (
        <ol className="mt-2 space-y-1.5 border-t border-[var(--line)] pt-2">
          {item.replies.map((r) => (
            <li key={r.id}>
              <Meta>
                {r.by ?? 'Someone'} · {istDateTime(r.at)}
              </Meta>
              <p className="whitespace-pre-line text-[13px]">{r.body}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {item.status !== 'resolved' && !replying && (
          <button type="button" className="text-[12px] font-medium text-[var(--accent-ink)] hover:underline" onClick={() => setReplying(true)} data-testid="question-reply">
            Reply
          </button>
        )}
        {canClose && (
          <button
            type="button"
            disabled={pending}
            className="text-[12px] text-[var(--ink-muted)] hover:underline"
            onClick={() =>
              start(async () => {
                await setQuestionStatusAction(item.id, item.status === 'resolved' ? 'open' : 'resolved');
                router.refresh();
              })
            }
          >
            {item.status === 'resolved' ? 'Reopen' : 'Mark resolved'}
          </button>
        )}
      </div>
      {replying && (
        <ActionForm action={replyQuestionAction} submitLabel="Send reply" onDone={() => setReplying(false)} testId="reply-form">
          <input type="hidden" name="question_id" value={item.id} />
          <textarea name="body" rows={2} className={`${input} mt-2`} placeholder="Your answer" required />
          {canClose && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-[var(--ink-muted)]">
              <input type="checkbox" name="resolve" /> Resolve with this reply
            </label>
          )}
        </ActionForm>
      )}
    </div>
  );
}
