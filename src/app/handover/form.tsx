'use client';

import { useRouter } from 'next/navigation';
import { createHandoverAction } from '@/lib/actions';
import { ActionForm, input } from '@/components/forms';

export function HandoverForm({
  clients,
  people,
  defaultDue,
}: {
  clients: { id: string; name: string }[];
  people: { id: string; name: string; role: string }[];
  defaultDue: string;
}) {
  const router = useRouter();
  return (
    <ActionForm
      testId="handover-form"
      submitLabel="File handover"
      action={async (f) => {
        const res = await createHandoverAction(f);
        if (res.ok && res.id) router.push(`/deals/${res.id}`);
        return res;
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Client">
          <select name="client_id" className={input} data-testid="handover-client" required>
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </L>
        <L label="Deal title">
          <input name="title" className={input} data-testid="handover-title" required />
        </L>
        <L label="Project(s)">
          <input name="projects" className={input} placeholder="Epoque, Majesty" />
        </L>
        <L label="Product">
          <input name="product" className={input} placeholder="Voice AI" />
        </L>
        <L label="Commercial terms">
          <select name="commercial_model" className={input} defaultValue="per_ql">
            {['per_ql', 'per_minute', 'per_record', 'fixed_fee', 'retainer', 'retainer_plus_performance', 'hybrid'].map(
              (m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ')}
                </option>
              ),
            )}
          </select>
        </L>
        <L label="Pilot value (₹)">
          <input name="monthly_value" type="number" step="0.01" className={input} />
        </L>
        <L label="Conversion price (₹ per month)">
          <input name="conversion_price" type="number" step="0.01" className={input} />
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
        <L label="Pilot start">
          <input name="start_date" type="date" className={input} />
        </L>
        <L label="Pilot end">
          <input name="end_date" type="date" className={input} />
        </L>
        <L label="Decision maker (name and title)">
          <input name="sc_judged_by" className={input} data-testid="handover-decision-maker" />
        </L>
        <L label="Day-to-day POCs">
          <input name="pocs" className={input} />
        </L>
        <L label="The client's success criterion, in their words" full>
          <textarea
            name="sc_business_outcome"
            rows={2}
            className={input}
            data-testid="handover-criterion"
          />
        </L>
        <L label="Verbal promises sales made" full>
          <textarea name="promises" rows={2} className={input} data-testid="handover-promises" />
        </L>
        <L label="Dependencies on the client (data, numbers, approvals)" full>
          <textarea name="dependencies" rows={2} className={input} />
        </L>
        <L label="First next step">
          <input
            name="next_step"
            className={input}
            defaultValue="Book kickoff with the decision maker"
            data-testid="handover-next-step"
          />
        </L>
        <L label="Due">
          <input
            name="next_step_due"
            type="date"
            className={input}
            defaultValue={defaultDue}
            data-testid="handover-next-step-due"
          />
        </L>
      </div>
    </ActionForm>
  );
}

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="t-label block">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
