import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { profiles } from '@/lib/queries';
import { NewClientForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewClientPage() {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const people = await profiles(me);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-lg font-semibold">New client</h1>
      <p className="mt-1 text-sm text-[var(--ink-muted)]">
        One record per company. Status and health are computed from its deals.
      </p>
      <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <NewClientForm people={people} />
      </div>
    </div>
  );
}
