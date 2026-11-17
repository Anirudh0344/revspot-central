import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, dealList, profiles, stages } from '@/lib/queries';
import { NewDealForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; category?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;

  const [clients, people, allStages, openDeals] = await Promise.all([
    clientList(me),
    profiles(me),
    stages(me),
    dealList(me, {}),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[18px] font-semibold">New deal</h1>
      <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
        A live deal always carries a dated next step. Criteria can follow, but the board will not let
        it past kickoff without them.
      </p>
      <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <NewDealForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          people={people}
          stages={allStages}
          deals={openDeals.map((d) => ({
            id: d.id,
            title: d.title,
            client_id: d.client_id,
            category: d.category,
          }))}
          defaultClient={sp.client}
          defaultCategory={sp.category}
        />
      </div>
    </div>
  );
}
