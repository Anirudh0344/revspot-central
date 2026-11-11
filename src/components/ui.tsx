import Link from 'next/link';
import type { ReactNode } from 'react';
import { inr, initials, isOverdue, relativeDue } from '@/lib/format';
import type { DealRow, Health } from '@/lib/types';

/* ------------------------------------------------------------------ health */

const HEALTH_DOT: Record<string, string> = {
  red: 'bg-[var(--red)]',
  amber: 'bg-[var(--amber)]',
  green: 'bg-[var(--green)]',
  none: 'bg-[var(--line-strong)]',
};

export function HealthDot({ health, size = 8 }: { health: Health | null; size?: number }) {
  return (
    <span
      data-testid={`health-dot-${health ?? 'none'}`}
      title={health ? `Health: ${health}` : 'No health set'}
      className={`inline-block shrink-0 rounded-full ${HEALTH_DOT[health ?? 'none']}`}
      style={{ width: size, height: size }}
    />
  );
}

/* ------------------------------------------------------------------- badge */

type Tone = 'neutral' | 'brand' | 'good' | 'warn' | 'bad';

const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--paper-sunk)] text-[var(--ink-muted)] ring-[var(--line)]',
  brand: 'bg-[var(--blue-soft)] text-[var(--blue-ink)] ring-[color-mix(in_srgb,var(--blue)_18%,white)]',
  good: 'bg-[var(--green-soft)] text-[var(--green-ink)] ring-[color-mix(in_srgb,var(--green)_18%,white)]',
  warn: 'bg-[var(--amber-soft)] text-[var(--amber)] ring-[color-mix(in_srgb,var(--amber)_20%,white)]',
  bad: 'bg-[var(--red-soft)] text-[var(--red)] ring-[color-mix(in_srgb,var(--red)_16%,white)]',
};

export function Badge({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: Tone;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** A deal code: monospaced, quiet, always the same shape. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-[var(--line)] bg-[var(--paper-sunk)] px-1 py-px font-mono text-[10px] uppercase tracking-wide text-[var(--ink-muted)]">
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- card */

export function Card({
  title,
  action,
  children,
  testId,
  count,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  testId?: string;
  count?: number;
}) {
  return (
    <section
      data-testid={testId}
      className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)]"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
          {title}
          {count !== undefined && (
            <span className="rounded bg-[var(--paper-sunk)] px-1.5 text-[11px] font-normal tabular-nums text-[var(--ink-muted)]">
              {count}
            </span>
          )}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-sm text-[var(--ink-faint)]">{children}</p>;
}

export function Owner({ name }: { name: string | null }) {
  if (!name) return <span className="text-[11px] text-[var(--ink-faint)]">—</span>;
  return (
    <span
      title={name}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--paper-sunk)] text-[10px] font-semibold text-[var(--ink-muted)] ring-1 ring-inset ring-[var(--line)]"
    >
      {initials(name)}
    </span>
  );
}

export function DueDate({ date, terminal }: { date: string | null; terminal?: boolean }) {
  if (!date) return <span className="text-[11px] text-[var(--ink-faint)]">no date</span>;
  const overdue = !terminal && isOverdue(date);
  return (
    <span
      className={`text-[11px] ${overdue ? 'font-medium text-[var(--red)]' : 'text-[var(--ink-muted)]'}`}
    >
      {relativeDue(date)}
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--ink-faint)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-[var(--ink)]">{children ?? '—'}</dd>
    </div>
  );
}

/* --------------------------------------------------------------- deal card */

/** DL-3. The health signal is a 2px left edge, so a column reads at a glance. */
export function DealCard({ deal, compact }: { deal: DealRow; compact?: boolean }) {
  const edge =
    deal.health === 'red'
      ? 'before:bg-[var(--red)]'
      : deal.health === 'amber'
        ? 'before:bg-[var(--amber)]'
        : deal.health === 'green'
          ? 'before:bg-[var(--green)]'
          : 'before:bg-[var(--line-strong)]';

  return (
    <Link
      href={`/deals/${deal.id}`}
      data-testid={`deal-card-${deal.id}`}
      className={`relative block overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-3 pl-3.5 transition
        before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-[''] ${edge}
        hover:border-[var(--line-strong)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06)]`}
    >
      <p className="truncate text-[11px] text-[var(--ink-muted)]">{deal.client_name}</p>
      <p className="mt-0.5 truncate text-[13px] font-medium leading-snug">{deal.title}</p>

      {!compact && (
        <>
          <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-[var(--ink-muted)]">
            {deal.next_step ?? <span className="text-[var(--red)]">No next step</span>}
          </p>

          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[var(--ink-muted)]">
            <DueDate date={deal.next_step_due} terminal={deal.stage_is_terminal} />
            <span className="text-[var(--line-strong)]">·</span>
            <span className="tabular-nums">{inr(deal.monthly_value, true)}</span>
            <span className="text-[var(--line-strong)]">·</span>
            <span className="tabular-nums">{deal.days_in_stage}d</span>
            <span className="ml-auto">
              <Owner name={deal.intern_owner_name} />
            </span>
          </div>

          {(!deal.criteria_complete || deal.health_stale || deal.code) && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {deal.code && <Code>{deal.code}</Code>}
              {!deal.criteria_complete && <Badge tone="warn">Criteria incomplete</Badge>}
              {deal.health_stale && <Badge>Health stale</Badge>}
            </div>
          )}
        </>
      )}
    </Link>
  );
}
