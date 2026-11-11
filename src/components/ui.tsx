import Link from 'next/link';
import type { ReactNode } from 'react';
import { inr, initials, isOverdue, relativeDue } from '@/lib/format';
import type { DealRow, Health } from '@/lib/types';

export function HealthDot({ health, size = 10 }: { health: Health | null; size?: number }) {
  const color =
    health === 'red' ? 'bg-rose-500' : health === 'amber' ? 'bg-amber-500' : health === 'green' ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-600';
  return (
    <span
      data-testid={`health-dot-${health ?? 'none'}`}
      title={health ? `Health: ${health}` : 'No health set'}
      className={`inline-block shrink-0 rounded-full ${color}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Badge({
  children,
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'red' | 'amber' | 'green' | 'blue' | 'violet';
  testId?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
    red: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    amber: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300',
    green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
    violet: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  };
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

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
      className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    >
      <header className="flex items-center justify-between gap-3 border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-800">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {count !== undefined && (
            <span className="rounded-full bg-neutral-100 px-1.5 text-xs font-normal text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
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
  return <p className="py-2 text-sm text-neutral-500 dark:text-neutral-400">{children}</p>;
}

export function Owner({ name }: { name: string | null }) {
  if (!name) return <span className="text-xs text-neutral-400">unowned</span>;
  return (
    <span
      title={name}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
    >
      {initials(name)}
    </span>
  );
}

export function DueDate({ date, terminal }: { date: string | null; terminal?: boolean }) {
  if (!date) return <span className="text-xs text-neutral-400">no date</span>;
  const overdue = !terminal && isOverdue(date);
  return (
    <span className={`text-xs ${overdue ? 'font-semibold text-rose-600 dark:text-rose-400' : 'text-neutral-500 dark:text-neutral-400'}`}>
      {relativeDue(date)}
    </span>
  );
}

/** DL-3: the Kanban card, also reused in list views. */
export function DealCard({ deal, compact }: { deal: DealRow; compact?: boolean }) {
  const border =
    deal.stage_flag === 'red'
      ? 'border-rose-400 dark:border-rose-700'
      : deal.stage_flag === 'amber'
        ? 'border-amber-400 dark:border-amber-700'
        : 'border-neutral-200 dark:border-neutral-800';
  return (
    <Link
      href={`/deals/${deal.id}`}
      data-testid={`deal-card-${deal.id}`}
      className={`block rounded-lg border bg-white p-3 transition hover:shadow-sm dark:bg-neutral-900 ${border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{deal.client_name}</p>
          <p className="truncate text-sm font-medium">{deal.title}</p>
        </div>
        <HealthDot health={deal.health} />
      </div>
      {!compact && (
        <>
          <p className="mt-2 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-300">
            {deal.next_step ?? <span className="text-rose-600">No next step</span>}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <DueDate date={deal.next_step_due} terminal={deal.stage_is_terminal} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {inr(deal.monthly_value, true)}/mo
            </span>
            <span className="text-xs text-neutral-400">{deal.days_in_stage}d in stage</span>
            <span className="ml-auto">
              <Owner name={deal.intern_owner_name} />
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {!deal.criteria_complete && <Badge tone="amber">Criteria incomplete</Badge>}
            {deal.health_stale && <Badge>Health stale</Badge>}
            {deal.code && <Badge tone="blue">{deal.code}</Badge>}
          </div>
        </>
      )}
    </Link>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm">{children ?? '—'}</dd>
    </div>
  );
}
