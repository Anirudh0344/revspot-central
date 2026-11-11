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
      <h1 className="text-lg font-semibold">Pilot handover</h1>
      <p className="mt-1 text-sm text-neutral-500">
        What sales promised, who decides, and what CS needs to deliver it. Submitting creates the
        pilot in stage Handover.
      </p>
      <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <HandoverForm
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          people={people}
          defaultDue={defaultDue}
        />
      </div>
    </div>
  );
}
