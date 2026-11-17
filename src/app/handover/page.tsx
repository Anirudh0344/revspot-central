import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { clientList, profiles } from '@/lib/queries';
import { todayIST } from '@/lib/format';
import { HandoverForm } from './form';

export const dynamic = 'force-dynamic';

/** DL-14: sales or Anunay files the handover; the deal lands in stage handover. */
export default async function HandoverPage() {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const [clients, people] = await Promise.all([clientList(me), profiles(me)]);
  const defaultDue = new Date(Date.parse(todayIST() + 'T00:00:00Z') + 3 * 86400000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-[18px] font-semibold">Pilot handover</h1>
      <p className="mt-1 text-[13px] text-[var(--ink-muted)]">
        What sales promised, who decides, and what CS needs to deliver it. Submitting creates the
        pilot in stage Handover.
      </p>
      <div className="mt-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <HandoverForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          people={people}
          defaultDue={defaultDue}
        />
      </div>
    </div>
  );
}
