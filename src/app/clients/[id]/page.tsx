import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import {
  activityFor,
  clientById,
  contactsFor,
  dealList,
  interactionsFor,
  profiles,
} from '@/lib/queries';
import { inr, istDate, istDateTime } from '@/lib/format';
import { Badge, Card, DealCard, Empty, Field, HealthDot } from '@/components/ui';
import { ActivityList } from '@/components/activity-list';
import { AddContactForm, LogInteractionForm } from '@/components/client-forms';
import { btn } from '@/components/forms';

export const dynamic = 'force-dynamic';

const TABS = ['deals', 'contacts', 'interactions', 'activity'] as const;

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = (TABS as readonly string[]).includes(rawTab ?? '') ? rawTab! : 'deals';

  const client = await clientById(me, id);
  if (!client) notFound();

  const [deals, contacts, interactions, activity, people] = await Promise.all([
    dealList(me, { client: id, includeTerminal: true }),
    contactsFor(me, id),
    interactionsFor(me, { clientId: id, limit: 25 }),
    activityFor(me, { clientId: id, limit: 40 }),
    profiles(me),
  ]);

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <HealthDot health={client.health} size={14} />
          <h1 className="text-lg font-semibold" data-testid="client-name">
            {client.name}
          </h1>
          <Badge tone={client.status === 'Active' ? 'good' : client.status === 'Churned' ? 'bad' : 'neutral'}>
            {client.status}
          </Badge>
          {client.single_threaded && <Badge tone="warn">Single-threaded</Badge>}
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
          <Field label="Legal name">{client.legal_name ?? '—'}</Field>
          <Field label="GSTIN">{client.gstin ?? '—'}</Field>
        </dl>
        {client.whitespace_notes && (
          <div className="mt-4 rounded-lg bg-[var(--paper-sunk)] p-3 text-sm">
            <p className="text-[11px] uppercase tracking-wide text-[var(--ink-muted)]">Whitespace</p>
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
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
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

      {tab === 'contacts' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card title="Contacts" count={contacts.length}>
              <ul className="divide-y divide-[var(--line)]">
                {contacts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {c.name}
                        {c.title && <span className="ml-2 text-[12px] text-[var(--ink-muted)]">{c.title}</span>}
                      </p>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        {[c.email, c.phone, c.whatsapp].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </div>
                    <Badge tone={c.role === 'decision_maker' ? 'brand' : 'neutral'}>
                      {c.role.replace('_', ' ')}
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
          <Card title="Add a contact">
            <AddContactForm clientId={id} />
          </Card>
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
                    <p className="mt-0.5 text-sm">{i.summary}</p>
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
