import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { profiles, tasksFor } from '@/lib/queries';
import { daysFromToday, istDate, relativeDue } from '@/lib/format';
import { Card, Empty } from '@/components/ui';
import { CompleteTask } from '@/components/task-widgets';
import { AddTaskForm } from '@/components/client-forms';

export const dynamic = 'force-dynamic';

/** TK-2: overdue, due today, due this week, grouped by client. */
export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const owner = sp.owner ?? me.id;

  const [tasks, people] = await Promise.all([tasksFor(me, { owner }), profiles(me)]);

  const bucket = (d: string | null) => {
    const n = daysFromToday(d);
    if (n === null) return 'later';
    if (n < 0) return 'overdue';
    if (n === 0) return 'today';
    if (n <= 7) return 'week';
    return 'later';
  };

  const groups: [string, string][] = [
    ['overdue', 'Overdue'],
    ['today', 'Due today'],
    ['week', 'Due this week'],
    ['later', 'Later'],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          My work <span className="text-[var(--ink-faint)]">{tasks.length} open</span>
        </h1>
        <form className="flex items-end gap-2">
          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">Owner</span>
            <select
              name="owner"
              defaultValue={owner}
              data-testid="task-owner-filter"
              className="mt-1 rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-2 py-1 text-sm"
            >
              {people
                .filter((p) => p.role !== 'viewer')
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <button className="mb-0.5 rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm">
            Show
          </button>
        </form>
      </div>

      <Card title="Add a task">
        <AddTaskForm people={people} />
      </Card>

      {groups.map(([key, label]) => {
        const rows = tasks.filter((t) => bucket(t.due_date) === key);
        if (rows.length === 0) return null;
        const byClient = new Map<string, typeof rows>();
        for (const r of rows) {
          const k = r.client_name ?? 'No client';
          byClient.set(k, [...(byClient.get(k) ?? []), r]);
        }
        return (
          <Card key={key} title={label} count={rows.length} testId={`tasks-${key}`}>
            <div className="space-y-4">
              {[...byClient.entries()].map(([client, list]) => (
                <div key={client}>
                  <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--ink-muted)]">
                    {client}
                  </p>
                  <ul className="mt-1 divide-y divide-[var(--line)]">
                    {list.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="min-w-0 flex-1 text-sm">
                          {t.title}
                          {t.deal_id && (
                            <Link
                              href={`/deals/${t.deal_id}`}
                              className="ml-2 text-[12px] text-[var(--blue-ink)] hover:underline"
                            >
                              {t.deal_title}
                            </Link>
                          )}
                        </span>
                        <span
                          className={`shrink-0 text-[12px] ${key === 'overdue' ? 'font-semibold text-[var(--red)]' : 'text-[var(--ink-muted)]'}`}
                        >
                          {istDate(t.due_date)} · {relativeDue(t.due_date)}
                        </span>
                        <CompleteTask taskId={t.id} dealId={t.deal_id} />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      {tasks.length === 0 && (
        <Card title="Nothing open">
          <Empty>No open tasks for this owner.</Empty>
        </Card>
      )}
    </div>
  );
}
