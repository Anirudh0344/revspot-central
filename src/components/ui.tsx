import Link from 'next/link';
import type { ReactNode } from 'react';
import { inr, initials, isOverdue, relativeDue } from '@/lib/format';
import type { DealRow, Health } from '@/lib/types';

/* ------------------------------------------------------------------ health */

const HEALTH_DOT: Record<string, string> = {
  red: 'bg-[var(--red-dot)]',
  amber: 'bg-[var(--amber-dot)]',
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

/*
  Soft fill, no outline. Most tags are grey; colour is kept for the three things
  that need it: healthy, warning and bad. `dot` turns a tag into a status chip.
*/
const TONES: Record<Tone, string> = {
  neutral: 'bg-[var(--tag-bg)] text-[var(--ink-muted)]',
  brand: 'bg-[var(--tag-bg)] text-[var(--ink)]',
  good: 'bg-[var(--green-soft)] text-[var(--green-ink)]',
  warn: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  bad: 'bg-[var(--red-soft)] text-[var(--red)]',
};

export function Badge({
  children,
  tone = 'neutral',
  dot,
  testId,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  testId?: string;
}) {
  return (
    <span data-testid={testId} className={`tag ${TONES[tone]}`}>
      {dot && <span className="tag-dot" aria-hidden />}
      {children}
    </span>
  );
}

/** Which pipeline a deal is in. */
export function CategoryTag({ category }: { category: 'pilot' | 'retention' | 'expansion' }) {
  return (
    <Badge>
      <span className="capitalize">{category}</span>
    </Badge>
  );
}

/** A deal code. Plain muted mono — a reference, not a label. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-[var(--ink-faint)]">
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
      <header className="flex items-center justify-between gap-3 rounded-t-[var(--radius)] border-b border-[var(--line)] bg-[var(--paper-tint)] px-3.5 py-2">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-[-0.005em]">
          {title}
          {count !== undefined && (
            <span className="rounded bg-[var(--tag-bg)] px-1 text-[11px] font-normal tabular-nums text-[var(--ink-muted)]">
              {count}
            </span>
          )}
        </h2>
        {action}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[13px] text-[var(--ink-faint)]">{children}</p>;
}

export function Owner({ name }: { name: string | null }) {
  if (!name) return <span className="text-[11px] text-[var(--ink-faint)]">—</span>;
  return (
    <span
      title={name}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--paper-sunk)] text-[11px] font-semibold text-[var(--ink-muted)] ring-1 ring-inset ring-[var(--line)]"
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
      <dt className="t-label">{label}</dt>
      <dd className="mt-1 text-[13px] text-[var(--ink)]">{children ?? '—'}</dd>
    </div>
  );
}

/** The contract a retention deal is on. A fact about the deal, not a stage. */
export function TermTag({ months }: { months: number | null }) {
  return months && months >= 3 ? (
    <Badge tone="brand">{months}-month term</Badge>
  ) : (
    <Badge>Month to month</Badge>
  );
}

/* --------------------------------------------------------------- deal card */

/** DL-3. The health signal is a 2px left edge, so a column reads at a glance. */
export type CardFlags = { reasons: { key: string; text: string; severity: 'red' | 'amber' }[]; questions: number };

export function DealCard({ deal, compact, flags }: { deal: DealRow; compact?: boolean; flags?: CardFlags }) {
  const edge =
    deal.health === 'red'
      ? 'before:bg-[var(--red-dot)]'
      : deal.health === 'amber'
        ? 'before:bg-[var(--amber-dot)]'
        : deal.health === 'green'
          ? 'before:bg-[var(--green)]'
          : 'before:bg-[var(--line-strong)]';

  return (
    <Link
      href={`/deals/${deal.id}`}
      data-testid={`deal-card-${deal.id}`}
      className={`relative block overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-3 pl-3.5 transition
        before:absolute before:inset-y-0 before:left-0 before:w-[2px] before:content-[''] ${edge}
        hover:border-[var(--accent-200)] hover:bg-[var(--accent-50)] hover:shadow-[var(--lift)]`}
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
            {!flags && (
              <span className="ml-auto">
                <Owner name={deal.intern_owner_name} />
              </span>
            )}
          </div>

          {flags && (
            <div className="mt-2 space-y-1" data-testid="card-flags">
              <p className="flex items-center gap-1.5 text-[11px]">
                <Owner name={deal.intern_owner_name} />
                <span className={deal.intern_owner_name ? 'text-[var(--ink)]' : 'font-medium text-[var(--red)]'}>
                  {deal.intern_owner_name ?? 'No owner'}
                </span>
                {flags.questions > 0 && (
                  <span className="ml-auto rounded bg-[var(--amber-soft)] px-1 text-[var(--amber)]">
                    {flags.questions} {flags.questions === 1 ? 'question' : 'questions'}
                  </span>
                )}
              </p>
              {flags.reasons.filter((r) => r.key !== 'owner').slice(0, 3).map((r) => (
                <p
                  key={r.text}
                  className={`line-clamp-2 rounded px-1.5 py-0.5 text-[11px] leading-snug ${
                    r.severity === 'red' ? 'bg-[var(--red-soft)] text-[var(--red)]' : 'bg-[var(--amber-soft)] text-[var(--amber)]'
                  }`}
                >
                  {r.text}
                </p>
              ))}
              {flags.reasons.filter((r) => r.key !== 'owner').length > 3 && (
                <p className="text-[11px] text-[var(--ink-faint)]">more on the deal</p>
              )}
            </div>
          )}

          {!flags && (!deal.criteria_complete || deal.health_stale || deal.code || deal.category === 'retention') && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {deal.code && <Code>{deal.code}</Code>}
              {deal.category === 'retention' && <TermTag months={deal.term_months} />}
              {!deal.criteria_complete && <Badge tone="warn">Criteria incomplete</Badge>}
              {deal.health_stale && <Badge>Health stale</Badge>}
            </div>
          )}
        </>
      )}
    </Link>
  );
}
