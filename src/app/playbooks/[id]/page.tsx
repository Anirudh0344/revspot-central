import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { describeTrigger, playbookById } from '@/lib/playbooks';
import { stages } from '@/lib/queries';
import { Card } from '@/components/ui';
import { PlaybookEditor } from '@/components/playbooks';
import type { PlaybookInput } from '@/lib/playbook-actions';

export const dynamic = 'force-dynamic';

export default async function PlaybookPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const isNew = id === 'new';
  const pb = isNew ? null : await playbookById(me, id);
  if (!isNew && !pb) notFound();
  const stageList = (await stages(me)).filter((s) => !s.is_terminal);

  const initial: PlaybookInput = pb
    ? {
        name: pb.name,
        description: pb.description ?? '',
        category: pb.category ?? '',
        trigger: pb.trigger,
        trigger_stage: pb.trigger_stage ?? '',
        steps: pb.steps,
        is_active: pb.is_active,
      }
    : {
        name: '',
        description: '',
        category: '',
        trigger: 'manual',
        trigger_stage: '',
        steps: [{ id: 's1', kind: 'question', title: '' }],
        is_active: true,
      };

  return (
    <div className="max-w-[860px] space-y-5">
      <div>
        <Link href="/playbooks" className="text-[12px] text-[var(--ink-muted)] hover:underline">
          ← Playbooks
        </Link>
        <h1 className="mt-1 text-[18px] font-semibold tracking-tight">{pb?.name ?? 'New playbook'}</h1>
        {pb && (
          <p className="text-[12px] text-[var(--ink-muted)]">
            {describeTrigger(pb)} · used {pb.runs} times · {pb.open_runs} running
          </p>
        )}
      </div>
      <Card title={me.role === 'admin' ? 'Edit' : 'Steps'}>
        {me.role === 'admin' ? (
          <PlaybookEditor
            id={pb?.id ?? null}
            initial={initial}
            stages={stageList.map((s) => ({ category: s.category, key: s.key, label: s.label }))}
          />
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px]">
            {initial.steps.map((s) => (
              <li key={s.id}>
                <span className="text-[var(--ink-faint)]">{s.kind}:</span> {s.title}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
