'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  createBillAction,
  createBillingAccountAction,
  disconnectMailboxAction,
  issueTiAction,
  markPiSentAction,
  queueRemindersAction,
  recordPaymentAction,
  recordPoAction,
  sendReminderAction,
  setBillStatusAction,
  setDealBillingAccountAction,
  skipReminderAction,
  updateReminderAction,
} from '@/lib/billing-actions';
import type { Result } from '@/lib/actions';
import { ActionForm, btn, btnPrimary, btnQuiet, input, label } from './forms';

type Account = { id: string; name: string; is_intermediary: boolean; to_emails: string[] };

type BillLite = {
  id: string;
  step: string;
  status: string;
  balance: string;
  due_date: string | null;
  pi_number: string | null;
};

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const thisMonth = () => today().slice(0, 7);

/* ----------------------------------------------------------- new PI */

export function NewBillForm({
  dealId,
  accounts,
  defaultAccountId,
  monthly,
  suggestedAmount,
  onDone,
}: {
  dealId: string;
  accounts: Account[];
  defaultAccountId: string | null;
  monthly: boolean;
  suggestedAmount: number | null;
  onDone?: () => void;
}) {
  const [amount, setAmount] = useState(suggestedAmount ? String(suggestedAmount) : '');
  const [rate, setRate] = useState('18');
  const n = Number(amount.replace(/[,₹\s]/g, ''));
  const total = Number.isFinite(n) && n > 0 ? n * (1 + Number(rate || 0) / 100) : null;

  return (
    <ActionForm
      action={(f) => createBillAction(dealId, f)}
      submitLabel="Add PI"
      testId="new-bill-form"
      onDone={onDone}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label}>PI number</label>
          <input name="pi_number" className={`${input} mt-1`} placeholder="From Zoho, e.g. PI-0042" />
        </div>
        <div>
          <label className={label}>PI date</label>
          <input name="pi_date" type="date" defaultValue={today()} className={`${input} mt-1`} />
        </div>
        {monthly ? (
          <div>
            <label className={label}>For the month of</label>
            <input name="period_month" type="month" defaultValue={thisMonth()} className={`${input} mt-1`} />
          </div>
        ) : (
          <div>
            <label className={label}>Payment terms</label>
            <select name="terms_days" defaultValue="15" className={`${input} mt-1`}>
              <option value="0">Due on receipt</option>
              <option value="7">7 days</option>
              <option value="15">15 days</option>
              <option value="30">30 days</option>
              <option value="45">45 days</option>
            </select>
          </div>
        )}
        <div>
          <label className={label}>Amount before GST</label>
          <input
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={`${input} mt-1 tabular-nums`}
            placeholder="₹"
          />
        </div>
        <div>
          <label className={label}>GST</label>
          <select name="gst_rate" value={rate} onChange={(e) => setRate(e.target.value)} className={`${input} mt-1`}>
            <option value="18">18%</option>
            <option value="0">None (export or exempt)</option>
          </select>
        </div>
        <div>
          <label className={label}>Total</label>
          <p className="mt-1 py-1.5 text-[13px] font-medium tabular-nums">
            {total ? `₹${Math.round(total).toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Description</label>
          <input name="description" className={`${input} mt-1`} placeholder="What the client is paying for" />
        </div>
        <div>
          <label className={label}>Bill to</label>
          <select name="billing_account_id" defaultValue={defaultAccountId ?? ''} className={`${input} mt-1`}>
            <option value="">The client (finance contacts)</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.is_intermediary ? ' (agency)' : ''}
              </option>
            ))}
          </select>
        </div>
        {monthly && (
          <div>
            <label className={label}>Payment terms</label>
            <select name="terms_days" defaultValue="15" className={`${input} mt-1`}>
              <option value="0">Due on receipt</option>
              <option value="7">7 days</option>
              <option value="15">15 days</option>
              <option value="30">30 days</option>
            </select>
          </div>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="pi_sent" defaultChecked className="accent-[var(--action)]" />
        Already sent to the client
      </label>
    </ActionForm>
  );
}

/* ------------------------------------------------- next step on a bill */

function Inline({
  title,
  action,
  submit,
  children,
  onClose,
}: {
  title: string;
  action: (f: FormData) => Promise<Result>;
  submit: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="mt-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-sunk)] p-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-medium">{title}</p>
        <button type="button" className="text-[12px] text-[var(--ink-faint)] hover:underline" onClick={onClose}>
          Close
        </button>
      </div>
      <ActionForm action={action} submitLabel={submit} onDone={onClose} className="mt-2">
        <div className="grid gap-2 sm:grid-cols-3">{children}</div>
      </ActionForm>
    </div>
  );
}

const Field = ({ name, title, ...rest }: { name: string; title: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label className={label}>{title}</label>
    <input name={name} className={`${input} mt-1`} {...rest} />
  </div>
);

/** The one button that moves a bill forward, plus dispute and cancel. */
export function BillNextStep({ bill }: { bill: BillLite }) {
  const [open, setOpen] = useState<null | 'sent' | 'po' | 'pay' | 'ti'>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const closed = ['ti_issued', 'cancelled', 'written_off'].includes(bill.step);

  const next: { key: 'sent' | 'po' | 'pay' | 'ti'; label: string } | null =
    bill.step === 'draft'
      ? { key: 'sent', label: 'Mark PI sent' }
      : bill.step === 'pi_sent'
        ? { key: 'po', label: 'Record PO/RO' }
        : bill.step === 'po_received' || bill.step === 'partially_paid'
          ? { key: 'pay', label: 'Record payment' }
          : bill.step === 'paid'
            ? { key: 'ti', label: 'Issue TI' }
            : null;

  function status(s: 'sent' | 'disputed' | 'cancelled', reason: string) {
    start(async () => {
      const res = await setBillStatusAction(bill.id, s, reason);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {next && (
          <button
            type="button"
            className={bill.step === 'paid' ? btnPrimary : btn}
            data-testid={`bill-next-${next.key}`}
            onClick={() => setOpen(open === next.key ? null : next.key)}
          >
            {next.label}
          </button>
        )}
        {bill.step === 'pi_sent' && (
          <button type="button" className={btnQuiet} onClick={() => setOpen(open === 'pay' ? null : 'pay')}>
            Paid without a PO
          </button>
        )}
        {!closed && bill.status !== 'disputed' && (
          <button type="button" className={btnQuiet} disabled={pending} onClick={() => status('disputed', 'Client disputes the bill')}>
            Disputed
          </button>
        )}
        {bill.status === 'disputed' && (
          <button type="button" className={btnQuiet} disabled={pending} onClick={() => status('sent', 'Dispute resolved')}>
            Dispute resolved
          </button>
        )}
        {!closed && Number(bill.balance) > 0 && bill.step !== 'partially_paid' && (
          <button
            type="button"
            className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)] hover:underline"
            disabled={pending}
            onClick={() => {
              if (confirm(`Cancel ${bill.pi_number ?? 'this PI'}? Its reminders stop too.`)) status('cancelled', 'Bill cancelled');
            }}
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[12px] text-[var(--red)]">{error}</p>}

      {open === 'sent' && (
        <Inline title="When did the PI go to the client?" submit="Mark sent" onClose={() => setOpen(null)}
          action={(f) => markPiSentAction(bill.id, f)}>
          <Field name="pi_sent_on" title="Sent on" type="date" defaultValue={today()} />
        </Inline>
      )}
      {open === 'po' && (
        <Inline title="The client's PO/RO" submit="Save PO/RO" onClose={() => setOpen(null)}
          action={(f) => recordPoAction(bill.id, f)}>
          <Field name="po_number" title="PO/RO number" placeholder="e.g. RO 0144-2627" />
          <Field name="po_received_on" title="Received on" type="date" defaultValue={today()} />
          <Field name="due_date" title="Payment due" type="date" defaultValue={bill.due_date ?? ''} />
          <div className="sm:col-span-3">
            <Field name="po_url" title="Link to the PO/RO (optional)" placeholder="Drive or Gmail link" />
          </div>
        </Inline>
      )}
      {open === 'pay' && (
        <Inline title="Payment received" submit="Record payment" onClose={() => setOpen(null)}
          action={(f) => recordPaymentAction(bill.id, f)}>
          <Field name="amount" title="Amount" inputMode="decimal" defaultValue={String(Math.round(Number(bill.balance)))} />
          <Field name="received_on" title="Received on" type="date" defaultValue={today()} />
          <div>
            <label className={label}>Mode</label>
            <select name="mode" className={`${input} mt-1`} defaultValue="NEFT">
              <option>NEFT</option>
              <option>RTGS</option>
              <option>IMPS</option>
              <option>UPI</option>
              <option>Cheque</option>
            </select>
          </div>
          <div className="sm:col-span-3">
            <Field name="reference" title="UTR or cheque number" placeholder="Needed to trace the payment" />
          </div>
        </Inline>
      )}
      {open === 'ti' && (
        <Inline title="Tax invoice from Zoho" submit="Save TI" onClose={() => setOpen(null)}
          action={(f) => issueTiAction(bill.id, f)}>
          <Field name="ti_number" title="TI number" placeholder="e.g. INV-0042" />
          <Field name="ti_date" title="TI date" type="date" defaultValue={today()} />
        </Inline>
      )}
    </div>
  );
}

/* ---------------------------------------------------- bill-to parties */

export function BillToPicker({
  dealId,
  accounts,
  current,
}: {
  dealId: string;
  accounts: Account[];
  current: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <select
      aria-label="Bill to"
      className={`${input} max-w-[16rem]`}
      defaultValue={current ?? ''}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value || null;
        start(async () => {
          await setDealBillingAccountAction(dealId, v);
          router.refresh();
        });
      }}
    >
      <option value="">The client (finance contacts)</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.is_intermediary ? ' (agency)' : ''}
        </option>
      ))}
    </select>
  );
}

export function AddBillingAccountForm({ clientId, dealId }: { clientId: string; dealId?: string }) {
  return (
    <ActionForm
      action={(f) => createBillingAccountAction(clientId, f)}
      submitLabel="Add bill-to party"
      testId="billing-account-form"
      resetOnSuccess
    >
      {dealId && <input type="hidden" name="deal_id" value={dealId} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Name</label>
          <input name="name" className={`${input} mt-1`} placeholder="e.g. Insomniacs, or the client's accounts team" />
        </div>
        <div>
          <label className={label}>GSTIN</label>
          <input name="gstin" className={`${input} mt-1`} />
        </div>
        <div>
          <label className={label}>PIs and reminders go to</label>
          <input name="to_emails" className={`${input} mt-1`} placeholder="accounts@client.com, ap@client.com" />
        </div>
        <div>
          <label className={label}>Copy</label>
          <input name="cc_emails" className={`${input} mt-1`} placeholder="Optional" />
        </div>
      </div>
      <label className="mt-3 flex items-center gap-2 text-[13px]">
        <input type="checkbox" name="is_intermediary" className="accent-[var(--action)]" />
        An agency or intermediary billed on the client&apos;s behalf
      </label>
    </ActionForm>
  );
}

/* --------------------------------------------------------- reminders */

export function QueueRemindersButton() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="flex items-center gap-2">
      {note && <span className="text-[12px] text-[var(--ink-muted)]">{note}</span>}
      <button
        type="button"
        className={btn}
        disabled={pending}
        data-testid="queue-reminders"
        onClick={() =>
          start(async () => {
            const res = await queueRemindersAction();
            if (res.ok) {
              const n = Number(res.id ?? 0);
              setNote(n === 0 ? 'Nothing new is due' : `${n} added`);
              router.refresh();
            } else setNote(res.error);
          })
        }
      >
        {pending ? 'Checking…' : 'Check what is due'}
      </button>
    </span>
  );
}

export function ReminderCard({
  r,
  canSend,
}: {
  r: {
    id: string;
    kind: string;
    status: string;
    subject: string;
    body: string;
    to_emails: string[];
    cc_emails: string[];
    error: string | null;
  };
  canSend: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(r.error);
  const router = useRouter();

  function run(fn: () => Promise<Result>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        setError(null);
        router.refresh();
      } else setError(res.error);
    });
  }

  if (editing) {
    return (
      <ActionForm action={(f) => updateReminderAction(r.id, f)} submitLabel="Save" onDone={() => setEditing(false)}>
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={label}>To</label>
              <input name="to_emails" defaultValue={r.to_emails.join(', ')} className={`${input} mt-1`} />
            </div>
            <div>
              <label className={label}>Copy</label>
              <input name="cc_emails" defaultValue={r.cc_emails.join(', ')} className={`${input} mt-1`} />
            </div>
          </div>
          <div>
            <label className={label}>Subject</label>
            <input name="subject" defaultValue={r.subject} className={`${input} mt-1`} />
          </div>
          <div>
            <label className={label}>Message</label>
            <textarea name="body" defaultValue={r.body} rows={9} className={`${input} mt-1 font-[inherit]`} />
          </div>
        </div>
      </ActionForm>
    );
  }

  return (
    <div>
      <p className="text-[12px] text-[var(--ink-muted)]">
        To {r.to_emails.length ? r.to_emails.join(', ') : <span className="font-medium text-[var(--red)]">no one yet</span>}
        {r.cc_emails.length > 0 && <> · cc {r.cc_emails.join(', ')}</>}
      </p>
      <p className="mt-1 text-[13px] font-medium">{r.subject}</p>
      <p className="mt-1 whitespace-pre-line text-[12px] leading-[18px] text-[var(--ink-muted)]">{r.body}</p>
      {error && <p className="mt-2 rounded-md bg-[var(--red-soft)] px-2.5 py-1.5 text-[12px] text-[var(--red)]">{error}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={btnPrimary}
          disabled={pending || !canSend || r.to_emails.length === 0}
          title={!canSend ? 'Connect the finance mailbox under Settings first' : undefined}
          data-testid="send-reminder"
          onClick={() => run(() => sendReminderAction(r.id))}
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <button type="button" className={btn} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button type="button" className={btnQuiet} disabled={pending} onClick={() => run(() => skipReminderAction(r.id))}>
          Skip
        </button>
      </div>
    </div>
  );
}

export function DisconnectMailbox({ id, email }: { id: string; email: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="text-[12px] text-[var(--ink-faint)] hover:text-[var(--red)] hover:underline"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Disconnect ${email}? Reminders cannot be sent from it until it is connected again.`)) return;
        start(async () => {
          await disconnectMailboxAction(id);
          router.refresh();
        });
      }}
    >
      Disconnect
    </button>
  );
}

/** A button that runs one server action and shows how it went. */
export function RunButton({
  run,
  label,
  busy = 'Working…',
  done,
  primary,
  testId,
}: {
  run: () => Promise<Result>;
  label: string;
  busy?: string;
  /** Shown after success; `{n}` is replaced with what the action returned. */
  done?: string;
  primary?: boolean;
  testId?: string;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={primary ? btnPrimary : btn}
        disabled={pending}
        data-testid={testId}
        onClick={() =>
          start(async () => {
            const res = await run();
            if (res.ok) {
              setNote(done ? { ok: true, text: done.replace('{n}', res.id ?? '0') } : null);
              router.refresh();
            } else setNote({ ok: false, text: res.error });
          })
        }
      >
        {pending ? busy : label}
      </button>
      {note && (
        <span className={`text-[12px] ${note.ok ? 'text-[var(--ink-muted)]' : 'text-[var(--red)]'}`}>{note.text}</span>
      )}
    </span>
  );
}
