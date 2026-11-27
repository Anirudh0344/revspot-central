import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import {
  activityFor,
  clientById,
  clientDomainsFor,
  contactsFor,
  dealList,
  interactionsFor,
  profiles,
} from '@/lib/queries';
import { inr, istDate, istDateTime } from '@/lib/format';
import { Badge, Card, DealCard, Empty, Field, HealthDot } from '@/components/ui';
import { ActivityList } from '@/components/activity-list';
import { AddContactForm, LogInteractionForm } from '@/components/client-forms';
import { btn, Disclosure } from '@/components/forms';
import { billingAccountsFor, billsForClient, clientBilling } from '@/lib/billing';
import { BillList } from '@/components/billing-view';
import { AddBillingAccountForm } from '@/components/billing';
import {
  unlinkedWorkspaces,
  usageDaily,
  usageBounds,
  usageForClient,
  usageRangeTotals,
  usageSourcesFor,
} from '@/lib/usage';
import { resolveUsageRange } from '@/lib/usage-range';
import { UsageRangeFilter } from '@/components/usage-trend';
import { UsageBadge, UsagePanel } from '@/components/usage-view';
import { LinkUsageWorkspaceForm, SyncUsageButton, UnlinkUsageWorkspaceButton } from '@/components/usage-forms';
import { count } from '@/lib/format';
import { ClientDomains, FileEmailOnDeal } from '@/components/email-link';

export const dynamic = 'force-dynamic';
// "Sync now" runs the usage sync in this page's server action; a first backfill takes ~90s.
export const maxDuration = 300;

const TABS = ['deals', 'usage', 'billing', 'contacts', 'interactions', 'activity'] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; range?: string; from?: string; to?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const sp = await searchParams;
  const rawTab = sp.tab;
  const tab = (TABS as readonly string[]).includes(rawTab ?? '') ? rawTab! : 'deals';

  const client = await clientById(me, id);
  if (!client) notFound();

  const onUsage = tab === 'usage';
  const bounds = onUsage ? await usageBounds(me) : { earliest: null, through: null };
  const range = resolveUsageRange(sp, bounds.through);
  const [usage, sources, usageDays, usageTotals, freeWorkspaces] = await Promise.all([
    usageForClient(me, id),
    onUsage ? usageSourcesFor(me, id) : [],
    onUsage ? usageDaily(me, id, range.from, range.to) : [],
    onUsage ? usageRangeTotals(me, id, range.from, range.to) : null,
    onUsage ? unlinkedWorkspaces(me) : [],
  ]);
  const canWrite = me.role !== 'viewer';

  const [deals, contacts, interactions, activity, people, billing, bills, accounts, domains] = await Promise.all([
    dealList(me, { client: id, includeTerminal: true }),
    contactsFor(me, id),
    interactionsFor(me, { clientId: id, limit: 25 }),
    activityFor(me, { clientId: id, limit: 40 }),
    profiles(me),
    clientBilling(me, id),
    billsForClient(me, id),
    billingAccountsFor(me, id),
    clientDomainsFor(me, id),
  ]);
  const liveDeals = deals
    .filter((d) => !d.stage_is_terminal && !d.archived_at)
    .map((d) => ({ id: d.id, title: d.title }));

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <HealthDot health={client.health} size={14} />
          <h1 className="text-[18px] font-semibold" data-testid="client-name">
            {client.name}
          </h1>
          <Badge tone={client.status === 'Active' ? 'good' : client.status === 'Churned' ? 'bad' : 'neutral'}>
            {client.status}
          </Badge>
          {client.single_threaded && <Badge tone="warn">Single-threaded</Badge>}
          {usage && (
            <Link href={`/clients/${id}?tab=usage`}>
              <UsageBadge usage={usage} />
            </Link>
          )}
          <div className="ml-auto flex gap-2">
            <Link href={`/deals/new?client=${client.id}`} className={btn} data-testid="add-deal">
              New deal
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid gap-4 sm:grid-cols-4">
          <Field label="Owner">{client.intern_owner_name ?? 'Unassigned'}</Field>
          <Field label="Monthly value">{inr(client.monthly_value)}</Field>
          <Field label="Open deals">{client.open_deals ?? 0}</Field>
          <Field label="Last interaction">{istDate(client.last_interaction_at)}</Field>
          <Field label="Segment">{client.segment ?? '—'}</Field>
          <Field label="City">{client.city ?? '—'}</Field>
        </dl>
        {billing && (
          <dl
            className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-4"
            data-testid="client-billing-summary"
          >
            <Field label="Invoices raised">{billing.bills_raised}</Field>
            <Field label="Due">
              {billing.bills_due} · {inr(billing.due_amount)}
            </Field>
            <Field label="Overdue">
              <span className={billing.bills_overdue > 0 ? 'font-medium text-[var(--red)]' : ''}>
                {billing.bills_overdue} · {inr(billing.overdue_amount)}
              </span>
            </Field>
            <Field label="Live deals invoiced">
              {billing.deals_invoiced} of {billing.deals_invoiced + billing.deals_not_invoiced}
              {billing.deals_not_invoiced > 0 && (
                <span className="ml-1 text-[var(--amber)]">· {billing.deals_not_invoiced} not invoiced</span>
              )}
            </Field>
          </dl>
        )}
        {client.whitespace_notes && (
          <div className="mt-4 rounded-lg bg-[var(--paper-sunk)] p-3 text-[13px]">
            <p className="t-label">Whitespace</p>
            <p className="mt-1">{client.whitespace_notes}</p>
          </div>
        )}
      </header>

      <nav className="flex gap-1 border-b border-[var(--line)]">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/clients/${id}?tab=${t}`}
            data-testid={`tab-${t}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] capitalize ${
              tab === t
                ? 'border-[var(--ink)] font-medium'
                : 'border-transparent text-[var(--ink-muted)] hover:text-[var(--ink)]'
            }`}
          >
            {t}
          </Link>
        ))}
      </nav>

      {tab === 'deals' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
          {deals.length === 0 && <Empty>No deals yet.</Empty>}
        </div>
      )}

      {tab === 'usage' && usage && sources.length > 0 && (
        <UsageRangeFilter key={`${range.from}-${range.to}`} range={range} earliest={bounds.earliest} through={bounds.through} />
      )}

      {tab === 'usage' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Usage" action={me.role === 'admin' ? <SyncUsageButton /> : undefined} testId="usage-card">
              {usage && sources.length > 0 && usageTotals ? (
                <UsagePanel usage={usage} range={range} totals={usageTotals} days={usageDays} />
              ) : (
                <Empty>
                  No Revspot workspace is linked to this client yet. Link the workspace(s) it runs on, and its
                  leads and bot calls will show here.
                </Empty>
              )}
            </Card>
          </div>
          <Card title="Revspot workspaces" count={sources.length} testId="usage-sources">
            <ul className="divide-y divide-[var(--line)]">
              {sources.map((s) => (
                <li key={s.id} className="flex items-start gap-2 py-2 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name ?? s.workspace_key}</p>
                    <p className="truncate text-[12px] text-[var(--ink-faint)]">
                      {s.workspace_key}
                      {s.parent_org_name ? ` · org: ${s.parent_org_name}` : ''}
                    </p>
                    <p className="text-[12px] text-[var(--ink-muted)]">
                      30d: {count(s.leads_30)} leads · {count(s.calls_30)} calls
                    </p>
                  </div>
                  {canWrite && <UnlinkUsageWorkspaceButton clientId={id} sourceId={s.id} />}
                </li>
              ))}
              {sources.length === 0 && <Empty>None linked.</Empty>}
            </ul>
            {canWrite && (
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <Disclosure label="Link a Revspot workspace" testId="link-usage-workspace">
                  <LinkUsageWorkspaceForm clientId={id} workspaces={freeWorkspaces} />
                </Disclosure>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'billing' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Bills" count={bills.length}>
              {bills.length === 0 ? (
                <Empty>No PIs raised for this client yet. Add one from the deal it bills.</Empty>
              ) : (
                <BillList bills={bills} showDeal />
              )}
            </Card>
          </div>
          <div className="space-y-5">
            <Card title="Client's billing details" testId="client-legal">
              <dl className="grid gap-3">
                <Field label="Legal name">{client.legal_name ?? '—'}</Field>
                <Field label="GSTIN">{client.gstin ?? '—'}</Field>
              </dl>
            </Card>
            <Card title="Bill-to parties" count={accounts.length}>
              {accounts.length === 0 ? (
                <Empty>None yet. Without one, reminders go to the client&apos;s finance contacts.</Empty>
              ) : (
                <ul className="space-y-3">
                  {accounts.map((a) => (
                    <li key={a.id} className="text-[13px]">
                      <p className="flex items-center gap-2 font-medium">
                        {a.name}
                        {a.is_intermediary && <Badge>Agency</Badge>}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">{a.to_emails.join(', ')}</p>
                      {a.cc_emails.length > 0 && (
                        <p className="text-[12px] text-[var(--ink-faint)]">cc {a.cc_emails.join(', ')}</p>
                      )}
                      {a.gstin && <p className="text-[12px] text-[var(--ink-faint)]">GSTIN {a.gstin}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <Disclosure label="Add a bill-to party">
                  <AddBillingAccountForm clientId={id} />
                </Disclosure>
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Contacts" count={contacts.length}>
              <ul className="divide-y divide-[var(--line)]">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">
                        {c.name}
                        {c.title && <span className="ml-2 text-[12px] text-[var(--ink-muted)]">{c.title}</span>}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        {[c.email, c.phone, c.whatsapp].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <Badge tone={c.role === 'decision_maker' ? 'brand' : 'neutral'}>
                      {c.role.replaceAll('_', ' ')}
                    </Badge>
                    <span className="text-[12px] text-[var(--ink-faint)]">
                      last contacted {istDate(c.last_contacted_at)}
                    </span>
                  </li>
                ))}
                {contacts.length === 0 && <Empty>No contacts yet.</Empty>}
              </ul>
            </Card>
          </div>
          <div className="space-y-5">
            <Card title="Email domains" count={domains.length} testId="panel-domains">
              <ClientDomains clientId={id} domains={domains} canWrite={canWrite} />
            </Card>
            <Card title="Add a contact">
              <AddContactForm clientId={id} />
            </Card>
          </div>
        </div>
      )}

      {tab === 'interactions' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Interactions" count={interactions.length}>
              <ul className="space-y-3">
                {interactions.map((i) => (
                  <li key={i.id} className="border-l-2 border-[var(--line)] pl-3">
                    <p className="text-[12px] text-[var(--ink-muted)]">
                      {istDateTime(i.occurred_at)} · {i.channel} · {i.direction ?? 'outbound'}
                      {i.logged_by_name ? ` · ${i.logged_by_name}` : ''}
                    </p>
                    {i.subject && <p className="mt-0.5 text-[13px] font-medium">{i.subject}</p>}
                    <p className="mt-0.5 text-[13px]">{i.summary}</p>
                    <p className="mt-1 text-[12px]" data-testid={`interaction-deal-${i.id}`}>
                      {i.deal_id ? (
                        <Link href={`/deals/${i.deal_id}`} className="text-[var(--ink-muted)] hover:underline">
                          On {i.deal_title}
                        </Link>
                      ) : canWrite && i.channel === 'email' ? (
                        <FileEmailOnDeal interactionId={i.id} deals={liveDeals} />
                      ) : (
                        <span className="text-[var(--ink-faint)]">Not on a deal</span>
                      )}
                    </p>
                    {i.next_step && (
                      <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">
                        Next: {i.next_step}
                      </p>
                    )}
                  </li>
                ))}
                {interactions.length === 0 && <Empty>Nothing logged yet.</Empty>}
              </ul>
            </Card>
          </div>
          <Card title="Log an interaction">
            <LogInteractionForm
              clientId={id}
              deals={deals.map((d) => ({ id: d.id, title: d.title }))}
              people={people}
            />
          </Card>
        </div>
      )}

      {tab === 'activity' && (
        <Card title="Activity" count={activity.length}>
          <ActivityList rows={activity} canUndo={me.role === 'admin'} />
        </Card>
      )}
    </div>
  );
}
