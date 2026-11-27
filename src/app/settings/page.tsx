import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { mailAccounts } from '@/lib/billing';
import { redirectUri, setupGaps } from '@/lib/gmail';
import { istDate, istDateTime } from '@/lib/format';
import { Badge, Card, Empty } from '@/components/ui';
import { btn, btnPrimary } from '@/components/forms';
import { DisconnectMailbox, RunButton } from '@/components/billing';
import { runDailyNowAction, syncMailNowAction } from '@/lib/billing-actions';
import { recentJobs } from '@/lib/jobs';
import { slackConfigured } from '@/lib/alerts';
import { withBase } from '@/lib/base-path';
import { query } from '@/lib/db';
import { asActor } from '@/lib/auth';
import { People, type Person } from '@/components/people';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const [accounts, jobs, people] = await Promise.all([
    mailAccounts(me),
    recentJobs(8),
    query<Person>(
      asActor(me),
      `select id, name, email, role::text as role, is_active, is_super_admin from profiles
        order by is_super_admin desc, case role when 'admin' then 0 when 'bot' then 2 else 1 end, is_active desc, name`,
    ),
  ]);
  const gaps = setupGaps();
  const sender = accounts.find((a) => a.can_send && a.status === 'connected');
  const mine = accounts.find((a) => a.email === me.email?.toLowerCase());

  return (
    <div className="max-w-[820px] space-y-5">
      <h1 className="text-[18px] font-semibold tracking-tight">Settings</h1>

      {sp.connected && (
        <p className="rounded-md bg-[var(--green-soft)] px-3 py-2 text-[13px] text-[var(--green-ink)]">
          Connected {sp.connected}.
        </p>
      )}
      {sp.error && (
        <p className="rounded-md bg-[var(--red-soft)] px-3 py-2 text-[13px] text-[var(--red)]" data-testid="settings-error">
          {sp.error}
        </p>
      )}

      <Card title="Mailboxes" count={accounts.filter((a) => a.status === 'connected').length} testId="mailboxes">
        {gaps.length > 0 && (
          <div className="mb-4 rounded-md bg-[var(--amber-soft)] p-3 text-[13px] text-[var(--amber)]" data-testid="google-setup">
            <p className="font-medium">Google sign-in is not set up yet</p>
            <p className="mt-1 text-[12px]">
              A Workspace admin creates an OAuth client (type: Web application, audience: Internal) in Google Cloud
              with the Gmail API enabled, and adds this redirect address:
            </p>
            <code className="mt-1.5 block rounded bg-[var(--paper)] px-2 py-1 text-[12px] text-[var(--ink)]">
              {redirectUri()}
            </code>
            <p className="mt-1.5 text-[12px]">
              Then set these in <code>.env.local</code> and restart the app: {gaps.join(', ')}.
            </p>
          </div>
        )}

        <div className="divide-y divide-[var(--line)]">
          <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
            <div>
              <p className="text-[13px] font-medium">Finance sending mailbox</p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                Sends PI follow-ups and payment reminders, and reads the replies.
              </p>
            </div>
            {sender ? (
              <Badge tone="good" dot>{sender.email}</Badge>
            ) : (
              <a
                href={withBase('/api/google/connect?purpose=send')}
                className={`${btnPrimary} ${gaps.length || me.role !== 'admin' ? 'pointer-events-none opacity-40' : ''}`}
                data-testid="connect-finance"
              >
                Connect finance@revspot.ai
              </a>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div>
              <p className="text-[13px] font-medium">Your mailbox</p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                Read only. Keeps client contacts and last-contacted dates current. Nothing is ever sent from it.
              </p>
            </div>
            {mine && mine.status === 'connected' ? (
              <Badge tone="good" dot>{mine.email}</Badge>
            ) : me.role !== 'admin' ? (
              <span className="text-[12px] text-[var(--ink-faint)]">Only admins connect a mailbox.</span>
            ) : (
              <a
                href={withBase('/api/google/connect?purpose=read')}
                className={`${btn} ${gaps.length ? 'pointer-events-none opacity-40' : ''}`}
                data-testid="connect-mine"
              >
                Connect {me.email ?? 'your mailbox'}
              </a>
            )}
          </div>
        </div>

        {accounts.length > 0 ? (
          <ul className="mt-2 space-y-2 border-t border-[var(--line)] pt-3">
            {accounts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-medium">{a.email}</span>
                {a.can_send && <Badge>Sends</Badge>}
                <Badge>Reads</Badge>
                {a.status !== 'connected' && <Badge tone={a.status === 'error' ? 'bad' : 'neutral'}>{a.status}</Badge>}
                <span className="text-[12px] text-[var(--ink-faint)]">
                  by {a.connected_by_name ?? '—'} · {istDate(a.connected_at)}
                </span>
                {a.last_synced_at && (
                  <span className="text-[12px] text-[var(--ink-faint)]">
                    · synced {istDateTime(a.last_synced_at)} ({a.last_sync_count ?? 0} new)
                  </span>
                )}
                {a.last_error && <span className="text-[12px] text-[var(--red)]">{a.last_error}</span>}
                {me.role === 'admin' && a.status !== 'disconnected' && (
                  <span className="ml-auto">
                    <DisconnectMailbox id={a.id} email={a.email} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          gaps.length === 0 && <Empty>No mailbox connected yet.</Empty>
        )}
        {accounts.some((a) => a.status !== 'disconnected') && (
          <div className="mt-3 flex items-center gap-3 border-t border-[var(--line)] pt-3">
            <RunButton
              run={syncMailNowAction}
              label="Sync email now"
              busy="Syncing…"
              done="{n} new emails logged"
              testId="sync-now"
            />
            <span className="text-[12px] text-[var(--ink-faint)]">
              Client emails are logged on the client and deal. The first sync looks back 30 days.
            </span>
          </div>
        )}
      </Card>

      <Card title="Alerts and daily jobs" testId="jobs">
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium">Slack</p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                A morning summary, plus an alert when a deal turns red or a payment lands.
              </p>
            </div>
            {slackConfigured() ? (
              <Badge tone="good" dot>Connected</Badge>
            ) : (
              <span className="text-[12px] text-[var(--ink-muted)]">
                Set <code>SLACK_WEBHOOK_URL</code> to an incoming webhook for your channel.
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--line)] pt-3">
            <div>
              <p className="font-medium">Daily jobs</p>
              <p className="text-[12px] text-[var(--ink-muted)]">
                Every morning at 9: sync email, move term deals to Renewal due, queue payment reminders, post the
                summary. Email also syncs every three hours.
                {!process.env.CRON_SECRET && ' The schedule runs once the app is hosted.'}
              </p>
            </div>
            {me.role === 'admin' && (
              <RunButton run={runDailyNowAction} label="Run now" busy="Running…" done="Done" testId="run-daily" />
            )}
          </div>
          {jobs.length > 0 && (
            <ul className="space-y-1 border-t border-[var(--line)] pt-3 text-[12px]">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap gap-2 text-[var(--ink-muted)]">
                  <span className={j.ok === false ? 'text-[var(--red)]' : j.ok ? 'text-[var(--green-ink)]' : ''}>
                    {j.ok === false ? 'Failed' : j.ok ? 'Done' : 'Running'}
                  </span>
                  <span className="font-medium text-[var(--ink)]">{j.job === 'daily' ? 'Daily jobs' : 'Email sync'}</span>
                  <span>{istDateTime(j.started_at)}</span>
                  {j.ok === false && (
                    <span className="text-[var(--red)]">{String((j.summary as { error?: string })?.error ?? '')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card title="People" count={people.length} testId="panel-people">
        <People people={people} meId={me.id} canManage={me.role === 'admin'} isOwner={me.is_super_admin} />
      </Card>

      <Card title="Zoho Billing">
        <p className="text-[13px] text-[var(--ink-muted)]">
          Not connected. For now, enter the PI, PO/RO and TI numbers from Zoho on each deal. Syncing them from Zoho
          comes once Revspot&apos;s Zoho Billing organisation is in use.
        </p>
      </Card>
    </div>
  );
}
