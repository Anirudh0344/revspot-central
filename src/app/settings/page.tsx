import { redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { mailAccounts } from '@/lib/billing';
import { redirectUri, setupGaps } from '@/lib/gmail';
import { istDate } from '@/lib/format';
import { Badge, Card, Empty } from '@/components/ui';
import { btn, btnPrimary } from '@/components/forms';
import { DisconnectMailbox } from '@/components/billing';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const sp = await searchParams;
  const accounts = await mailAccounts(me);
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
                href="/api/google/connect?purpose=send"
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
            ) : (
              <a
                href="/api/google/connect?purpose=read"
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
