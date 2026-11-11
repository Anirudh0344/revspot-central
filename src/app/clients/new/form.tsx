'use client';

import { useRouter } from 'next/navigation';
import { createClientAction } from '@/lib/actions';
import { ActionForm, input } from '@/components/forms';

export function NewClientForm({ people }: { people: { id: string; name: string; role: string }[] }) {
  const router = useRouter();
  return (
    <ActionForm
      testId="new-client-form"
      submitLabel="Create client"
      action={async (f) => {
        const res = await createClientAction(f);
        if (res.ok && res.id) router.push(`/clients/${res.id}`);
        return res;
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Name" full>
          <input name="name" className={input} data-testid="client-name" required />
        </L>
        <L label="Legal name">
          <input name="legal_name" className={input} />
        </L>
        <L label="GSTIN">
          <input name="gstin" className={input} />
        </L>
        <L label="Segment">
          <input name="segment" className={input} placeholder="developer, channel partner, broker" />
        </L>
        <L label="City">
          <input name="city" className={input} />
        </L>
        <L label="Intern owner">
          <select name="intern_owner" className={input} defaultValue="">
            <option value="">Unassigned</option>
            {people
              .filter((p) => p.role === 'intern' || p.role === 'admin')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </L>
        <L label="Whitespace notes" full>
          <textarea
            name="whitespace_notes"
            rows={3}
            className={input}
            placeholder="Products not yet used, upcoming launches"
          />
        </L>
      </div>
    </ActionForm>
  );
}

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
