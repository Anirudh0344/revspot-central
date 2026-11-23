import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { describeTrigger, playbookList } from '@/lib/playbooks';
import { Badge, Empty } from '@/components/ui';
import { btnPrimary } from '@/components/forms';

export const dynamic = 'force-dynamic';

export default async function PlaybooksPage() {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const list = await playbookList(me);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">Playbooks</h1>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
            Guides your team works through on a deal: questions to ask, answers saved, tasks created. Some start by
            themselves.
          </p>
        </div>
        {me.role === 'admin' && (
          <Link href="/playbooks/new" className={btnPrimary} data-testid="new-playbook">
            New playbook
          </Link>
        )}
      </div>

      {list.length === 0 ? (
        <Empty>No playbooks yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--line)]">
          <table className="w-full text-[13px]" data-testid="playbook-table">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-tint)] text-left">
                <th className="t-label px-3 py-2">Playbook</th>
                <th className="t-label px-3 py-2">Starts</th>
                <th className="t-label px-3 py-2 text-right">Steps</th>
                <th className="t-label px-3 py-2 text-right">Running</th>
                <th className="t-label px-3 py-2 text-right">Used</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => {
                const q = p.steps.filter((s) => s.kind === 'question').length;
                const t = p.steps.filter((s) => s.kind === 'task').length;
                return (
                  <tr key={p.id} className="border-b border-[var(--line)] align-top last:border-0 hover:bg-[var(--accent-50)]">
                    <td className="px-3 py-2.5">
                      <Link href={`/playbooks/${p.id}`} className="font-medium hover:text-[var(--accent-ink)]">
                        {p.name}
                      </Link>
                      {!p.is_active && (
                        <span className="ml-2">
                          <Badge>Off</Badge>
                        </span>
                      )}
                      {p.description && <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">{p.description}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-[var(--ink-muted)]">{describeTrigger(p)}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-[var(--ink-muted)]">
                      {q} questions · {t} tasks
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.open_runs}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.runs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
