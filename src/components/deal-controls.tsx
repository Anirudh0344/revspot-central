'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  convertPilotAction,
  moveStageAction,
  setHealthAction,
  updateDealAction,
} from '@/lib/actions';
import type { Stage } from '@/lib/queries';
import { SC_FIELDS, type DealRow } from '@/lib/types';
import { ActionForm, Disclosure, HealthControl, MoveToMenu, btn, btnPrimary, input } from './forms';

export function DealControls({ deal, stages }: { deal: DealRow; stages: Stage[] }) {
  return (
    <div className="space-y-4">
      <HealthControl
        dealId={deal.id}
        current={deal.health}
        currentReason={deal.health_reason}
        setHealth={setHealthAction}
      />
      <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <MoveToMenu dealId={deal.id} stages={stages} current={deal.stage} move={moveStageAction} />
      </div>
      {deal.category === 'pilot' && !deal.stage_is_terminal && (
        <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <Disclosure label="Convert to a paid retention deal" testId="convert-pilot">
            <ConvertPilotForm deal={deal} />
          </Disclosure>
        </div>
      )}
    </div>
  );
}

/** DL-5: converting asks for term, value and start date, then creates the retention deal. */
function ConvertPilotForm({ deal }: { deal: DealRow }) {
  const router = useRouter();
  return (
    <ActionForm
      testId="convert-pilot-form"
      submitLabel="Convert"
      action={async (f) => {
        const res = await convertPilotAction(deal.id, f);
        if (res.ok && res.id) router.push(`/deals/${res.id}`);
        return res;
      }}
    >
      <div className="grid gap-3">
        <Label text="Term (months)">
          <input
            name="term_months"
            type="number"
            min={1}
            defaultValue={deal.term_months ?? 1}
            className={input}
            data-testid="convert-term"
          />
        </Label>
        <Label text="Monthly value (₹)">
          <input
            name="monthly_value"
            type="number"
            step="0.01"
            defaultValue={deal.monthly_value ?? ''}
            className={input}
            data-testid="convert-value"
          />
        </Label>
        <Label text="Start date">
          <input
            name="start_date"
            type="date"
            defaultValue={new Date().toISOString().slice(0, 10)}
            className={input}
            data-testid="convert-start"
          />
        </Label>
        <Label text="Reason (required)">
          <input name="reason" className={input} data-testid="convert-reason" required />
        </Label>
      </div>
    </ActionForm>
  );
}

/** DL-8: the six criteria fields, editable in place. */
export function CriteriaPanel({ deal }: { deal: DealRow }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {SC_FIELDS.map((f) => {
            const v = deal[f.key] as string | null;
            return (
              <div key={f.key} data-testid={`criteria-${f.key}`}>
                <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{f.label}</dt>
                <dd className={`mt-0.5 text-sm ${v ? '' : 'text-rose-600 dark:text-rose-400'}`}>
                  {v || `${f.label} is empty`}
                </dd>
              </div>
            );
          })}
        </dl>
        <button
          type="button"
          className={`${btn} mt-4`}
          data-testid="edit-criteria"
          onClick={() => setEditing(true)}
        >
          Edit criteria
        </button>
      </div>
    );
  }
  return (
    <ActionForm
      testId="criteria-form"
      submitLabel="Save criteria"
      onDone={() => setEditing(false)}
      action={(f) => updateDealAction(deal.id, f)}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {SC_FIELDS.map((f) => (
          <Label key={f.key} text={f.label} hint={f.hint}>
            <textarea
              name={f.key}
              rows={2}
              defaultValue={(deal[f.key] as string | null) ?? ''}
              className={input}
              data-testid={`input-${f.key}`}
            />
          </Label>
        ))}
      </div>
      <button type="button" className={`${btn} mt-3 ml-2`} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </ActionForm>
  );
}

export function SnapshotEditor({
  deal,
  people,
}: {
  deal: DealRow;
  people: { id: string; name: string; role: string }[];
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Static label="Title" value={deal.title} />
          <Static label="Code" value={deal.code} />
          <Static label="Product" value={deal.product} />
          <Static label="Projects" value={deal.projects?.join(', ') ?? null} />
          <Static label="Commercial model" value={deal.commercial_model?.replace(/_/g, ' ') ?? null} />
          <Static label="Context doc" value={deal.context_doc_url} />
          <Static label="Next step" value={deal.next_step} />
          <Static label="Next step due" value={deal.next_step_due} />
          <Static label="Close reason" value={deal.close_reason} />
        </dl>
        <button
          type="button"
          className={`${btn} mt-4`}
          data-testid="edit-snapshot"
          onClick={() => setEditing(true)}
        >
          Edit deal
        </button>
      </div>
    );
  }
  return (
    <ActionForm
      testId="snapshot-form"
      submitLabel="Save deal"
      onDone={() => setEditing(false)}
      action={(f) => updateDealAction(deal.id, f)}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Label text="Title">
          <input name="title" defaultValue={deal.title} className={input} data-testid="input-title" />
        </Label>
        <Label text="Code">
          <input name="code" defaultValue={deal.code ?? ''} className={input} placeholder="GPL-PS" />
        </Label>
        <Label text="Product">
          <input name="product" defaultValue={deal.product ?? ''} className={input} />
        </Label>
        <Label text="Projects (comma separated)">
          <input name="projects" defaultValue={deal.projects?.join(', ') ?? ''} className={input} />
        </Label>
        <Label text="Owner">
          <select name="intern_owner" defaultValue={deal.intern_owner ?? ''} className={input}>
            <option value="">Unassigned</option>
            {people
              .filter((p) => p.role !== 'viewer')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Label>
        <Label text="Commercial model">
          <select name="commercial_model" defaultValue={deal.commercial_model ?? ''} className={input}>
            <option value="">—</option>
            {['per_ql', 'per_minute', 'per_record', 'fixed_fee', 'retainer', 'retainer_plus_performance', 'hybrid'].map(
              (m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, ' ')}
                </option>
              ),
            )}
          </select>
        </Label>
        <Label text="Term (months)">
          <input name="term_months" type="number" defaultValue={deal.term_months ?? ''} className={input} />
        </Label>
        <Label text="Monthly value (₹)">
          <input
            name="monthly_value"
            type="number"
            step="0.01"
            defaultValue={deal.monthly_value ?? ''}
            className={input}
          />
        </Label>
        <Label text="Contract value (₹)">
          <input
            name="contract_value"
            type="number"
            step="0.01"
            defaultValue={deal.contract_value ?? ''}
            className={input}
          />
        </Label>
        <Label text="Start date">
          <input name="start_date" type="date" defaultValue={deal.start_date ?? ''} className={input} />
        </Label>
        <Label text="End date">
          <input name="end_date" type="date" defaultValue={deal.end_date ?? ''} className={input} />
        </Label>
        <Label text="Context doc URL">
          <input name="context_doc_url" defaultValue={deal.context_doc_url ?? ''} className={input} />
        </Label>
        <Label text="Next step">
          <input
            name="next_step"
            defaultValue={deal.next_step ?? ''}
            className={input}
            data-testid="input-next-step"
          />
        </Label>
        <Label text="Next step due">
          <input
            name="next_step_due"
            type="date"
            defaultValue={deal.next_step_due ?? ''}
            className={input}
            data-testid="input-next-step-due"
          />
        </Label>
        <Label text="Reason for this edit">
          <input name="reason" className={input} placeholder="Shown in the activity log" />
        </Label>
      </div>
      <button type="button" className={`${btn} mt-3 ml-2`} onClick={() => setEditing(false)}>
        Cancel
      </button>
    </ActionForm>
  );
}

function Static({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value || '—'}</dd>
    </div>
  );
}

function Label({ text, hint, children }: { text: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{text}</span>
      {hint && <span className="block text-[11px] text-neutral-400">{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export { btnPrimary };
