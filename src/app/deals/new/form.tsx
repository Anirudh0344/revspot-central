'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createDealAction } from '@/lib/actions';
import type { Stage } from '@/lib/queries';
import { SC_FIELDS } from '@/lib/types';
import { ActionForm, input } from '@/components/forms';

export function NewDealForm({
  clients,
  people,
  stages,
  deals,
  defaultClient,
  defaultCategory,
}: {
  clients: { id: string; name: string }[];
  people: { id: string; name: string; role: string }[];
  stages: Stage[];
  deals: { id: string; title: string; client_id: string; category: string }[];
  defaultClient?: string;
  defaultCategory?: string;
}) {
  const router = useRouter();
  const [category, setCategory] = useState(defaultCategory ?? 'pilot');
  const [clientId, setClientId] = useState(defaultClient ?? '');
  const catStages = stages.filter((s) => s.category === category);

  return (
    <ActionForm
      testId="new-deal-form"
      submitLabel="Create deal"
      action={async (f) => {
        const res = await createDealAction(f);
        if (res.ok && res.id) router.push(`/deals/${res.id}`);
        return res;
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <L label="Client">
          <select
            name="client_id"
            className={input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            data-testid="deal-client"
            required
          >
            <option value="">Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </L>
        <L label="Title">
          <input name="title" className={input} data-testid="deal-title-input" required />
        </L>
        <L label="Category">
          <select
            name="category"
            className={input}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            data-testid="deal-category"
          >
            <option value="pilot">Pilot</option>
            <option value="retention">Retention</option>
            <option value="expansion">Expansion</option>
          </select>
        </L>
        <L label="Stage">
          <select name="stage" className={input} defaultValue={catStages[0]?.key} data-testid="deal-stage">
            {catStages.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </L>
        <L label="Code">
          <input name="code" className={input} placeholder="GPL-PS" />
        </L>
        <L label="Product">
          <input name="product" className={input} placeholder="Voice AI, Data, WhatsApp…" />
        </L>
        <L label="Projects (comma separated)">
          <input name="projects" className={input} placeholder="Epoque, Majesty" />
        </L>
        <L label="Intern owner">
          <select name="intern_owner" className={input} defaultValue="">
            <option value="">Unassigned</option>
            {people
              .filter((p) => p.role !== 'viewer')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </L>
        <L label="CRM integration required?">
          <select name="crm_required" className={input} defaultValue="" required data-testid="crm-required">
            <option value="" disabled>Choose…</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </L>
        <L label="Next step">
          <input name="next_step" className={input} data-testid="deal-next-step" />
        </L>
        <L label="Next step due">
          <input name="next_step_due" type="date" className={input} data-testid="deal-next-step-due" />
        </L>
        <L label="Term (months)">
          <input name="term_months" type="number" className={input} />
        </L>
        <L label="Monthly value (₹)">
          <input name="monthly_value" type="number" step="0.01" className={input} />
        </L>
        <L label="Start date">
          <input name="start_date" type="date" className={input} />
        </L>
        <L label="End date">
          <input name="end_date" type="date" className={input} />
        </L>

        {category === 'expansion' && (
          <>
            <L label="Parent deal" full>
              <select name="parent_deal_id" className={input} defaultValue="">
                <option value="">None</option>
                {deals
                  .filter((d) => d.client_id === clientId)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
              </select>
            </L>
            <L label="Override reason (if the client has no green retention deal)" full>
              <input name="override_reason" className={input} data-testid="override-reason" />
            </L>
          </>
        )}

        <div className="sm:col-span-2">
          <p className="t-label mb-2 mt-2">
            Success criteria — all six are needed before kickoff
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SC_FIELDS.map((f) => (
              <L key={f.key} label={f.label}>
                <textarea name={f.key} rows={2} className={input} placeholder={f.hint} />
              </L>
            ))}
          </div>
        </div>
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
