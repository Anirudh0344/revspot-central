'use client';

import {
  addLineItemAction,
  createContactAction,
  createTaskAction,
  logInteractionAction,
} from '@/lib/actions';
import { ActionForm, input } from './forms';

function L({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="t-label block">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

export function AddContactForm({ clientId }: { clientId: string }) {
  return (
    <ActionForm
      testId="add-contact-form"
      submitLabel="Add contact"
      resetOnSuccess
      action={(f) => createContactAction(clientId, f)}
    >
      <div className="grid gap-3">
        <L label="Name">
          <input name="name" className={input} data-testid="contact-name" required />
        </L>
        <L label="Title">
          <input name="title" className={input} />
        </L>
        <L label="Role">
          <select name="role" className={input} defaultValue="day_to_day" data-testid="contact-role">
            <option value="decision_maker">Decision maker</option>
            <option value="champion">Champion</option>
            <option value="day_to_day">Day to day</option>
            <option value="finance">Finance</option>
            <option value="tech">Tech</option>
            <option value="other">Other</option>
          </select>
        </L>
        <L label="Email">
          <input name="email" type="email" className={input} />
        </L>
        <L label="Phone">
          <input name="phone" className={input} />
        </L>
        <L label="WhatsApp">
          <input name="whatsapp" className={input} />
        </L>
      </div>
    </ActionForm>
  );
}

/** CM-1: log an interaction, and optionally make its next step the deal's next step. */
export function LogInteractionForm({
  clientId,
  dealId,
  deals,
}: {
  clientId: string;
  dealId?: string;
  deals: { id: string; title: string }[];
  people?: { id: string; name: string }[];
}) {
  return (
    <ActionForm
      testId="log-interaction-form"
      submitLabel="Log interaction"
      resetOnSuccess
      action={logInteractionAction}
    >
      <input type="hidden" name="client_id" value={clientId} />
      <div className="grid gap-3">
        {dealId ? (
          <input type="hidden" name="deal_id" value={dealId} />
        ) : (
          <L label="Deal">
            <select name="deal_id" className={input} defaultValue="" data-testid="interaction-deal">
              <option value="">No specific deal</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </L>
        )}
        <L label="Channel">
          <select name="channel" className={input} defaultValue="call" data-testid="interaction-channel">
            <option value="call">Call</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="meeting">Meeting</option>
            <option value="note">Note</option>
          </select>
        </L>
        <L label="Direction">
          <select name="direction" className={input} defaultValue="outbound">
            <option value="outbound">Outbound</option>
            <option value="inbound">Inbound</option>
            <option value="internal">Internal</option>
          </select>
        </L>
        <L label="When">
          <input type="datetime-local" name="occurred_at" className={input} />
        </L>
        <L label="Participants (comma separated)">
          <input name="participants" className={input} />
        </L>
        <L label="Summary">
          <textarea
            name="summary"
            rows={3}
            className={input}
            data-testid="interaction-summary"
            required
          />
        </L>
        <L label="Next step">
          <input name="next_step" className={input} data-testid="interaction-next-step" />
        </L>
        <L label="Next step due">
          <input type="date" name="next_step_due" className={input} />
        </L>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="apply_next_step" data-testid="apply-next-step" defaultChecked />
          Make this the deal&rsquo;s next step
        </label>
      </div>
    </ActionForm>
  );
}

export function AddTaskForm({
  dealId,
  clientId,
  people,
}: {
  dealId?: string;
  clientId?: string;
  people: { id: string; name: string; role: string }[];
}) {
  return (
    <ActionForm testId="add-task-form" submitLabel="Add task" resetOnSuccess action={createTaskAction}>
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      {clientId && <input type="hidden" name="client_id" value={clientId} />}
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Task" full>
          <input name="title" className={input} data-testid="task-title" required />
        </L>
        <L label="Owner">
          <select name="owner" className={input} defaultValue="">
            <option value="">Me</option>
            {people
              .filter((p) => p.role !== 'viewer')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </L>
        <L label="Due">
          <input type="date" name="due_date" className={input} data-testid="task-due" />
        </L>
      </div>
    </ActionForm>
  );
}

export function AddLineItemForm({ dealId }: { dealId: string }) {
  return (
    <ActionForm
      testId="add-line-item-form"
      submitLabel="Add line item"
      resetOnSuccess
      action={(f) => addLineItemAction(dealId, f)}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <L label="Description" full>
          <input name="description" className={input} data-testid="li-description" required />
        </L>
        <L label="Unit">
          <select name="unit" className={input} defaultValue="leads">
            <option value="leads">Leads</option>
            <option value="minutes">Minutes</option>
            <option value="records">Records</option>
            <option value="months">Months</option>
            <option value="project">Project</option>
          </select>
        </L>
        <L label="Quantity">
          <input name="quantity" type="number" step="0.01" className={input} data-testid="li-quantity" />
        </L>
        <L label="Rate (₹)">
          <input name="rate" type="number" step="0.01" className={input} data-testid="li-rate" />
        </L>
        <L label="Delivered">
          <input name="delivered_quantity" type="number" step="0.01" className={input} />
        </L>
        <L label="Billing trigger">
          <select name="billing_trigger" className={input} defaultValue="monthly">
            <option value="upfront">Upfront</option>
            <option value="milestone">Milestone</option>
            <option value="on_delivery">On delivery</option>
            <option value="monthly">Monthly</option>
          </select>
        </L>
      </div>
    </ActionForm>
  );
}
