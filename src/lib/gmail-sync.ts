import 'server-only';
import { query, write } from './db';
import { accessToken } from './gmail';

/*
  Pulls client email from every connected mailbox into the app:
    - each message with a client's domain on it becomes an email interaction
      (deduplicated by Message-ID, so the same email in two mailboxes counts once)
    - it goes on a deal when we can tell which one, strongest evidence first:
        1. it continues a thread already filed on a live deal (same Gmail thread,
           or In-Reply-To/References naming a message we have)
        2. the client's people on it are linked to exactly one live deal
        3. the client has exactly one live deal
      otherwise it stays on the client, where someone can file it by hand
    - the people on it update the client's contacts and last-contacted dates
    - a client's reply on a reminder thread is flagged for collections
  Only messages involving a known client domain are fetched.
*/

const INTERNAL = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai').toLowerCase();
const ROBOT = /^(no-?reply|do-?not-?reply|notifications?|mailer-daemon|calendar|bounce|postmaster|alerts?)\b/i;
const FIRST_LOOKBACK_DAYS = 30;

type Addr = { name: string | null; email: string };

function parseAddresses(header: string | undefined): Addr[] {
  if (!header) return [];
  const out: Addr[] = [];
  // Split on commas that are not inside quotes.
  for (const part of header.match(/("[^"]*"|[^,])+/g) ?? []) {
    const m = part.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    const email = (m ? m[2] : part).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) continue;
    const name = m && m[1].trim() ? m[1].trim() : null;
    out.push({ name, email });
  }
  return out;
}

const decode = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const domainOf = (email: string) => email.split('@')[1] ?? '';

function titleCase(local: string) {
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

async function gmail<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Gmail returned ${res.status}`);
  }
  return (await res.json()) as T;
}

type MessageMeta = {
  id: string;
  threadId: string;
  snippet: string;
  internalDate: string;
  payload: { headers: { name: string; value: string }[] };
};

async function inBatches<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

export type SyncResult = { mailbox: string; messages: number; logged: number; contactsAdded: number; replies: number; error?: string };

export async function syncMailbox(account: {
  id: string;
  email: string;
  last_synced_at: string | null;
  sync_from: string | null;
  connected_by: string | null;
}): Promise<SyncResult> {
  const result: SyncResult = { mailbox: account.email, messages: 0, logged: 0, contactsAdded: 0, replies: 0 };

  const domains = await query<{ domain: string; client_id: string }>(
    null,
    `select lower(cd.domain) as domain, cd.client_id from client_domains cd
       join clients c on c.id = cd.client_id
      where c.archived_at is null and cd.removed_at is null and lower(cd.domain) <> $1`,
    [INTERNAL],
  );
  if (domains.length === 0) return result;
  const clientByDomain = new Map(domains.map((d) => [d.domain, d.client_id]));

  const since = account.last_synced_at
    ? new Date(new Date(account.last_synced_at).getTime() - 60 * 60 * 1000) // an hour of overlap
    : account.sync_from
      ? new Date(account.sync_from)
      : new Date(Date.now() - FIRST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const after = Math.floor(since.getTime() / 1000);

  const token = await accessToken(account.id);

  // Collect message ids, a few domains per search to keep queries short.
  const ids = new Set<string>();
  const names = [...clientByDomain.keys()];
  for (let i = 0; i < names.length; i += 8) {
    const group = names.slice(i, i + 8);
    const q = `after:${after} (${group.map((d) => `from:${d} OR to:${d} OR cc:${d}`).join(' OR ')})`;
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const page = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(
        token,
        `messages?maxResults=100&q=${encodeURIComponent(q)}${pageToken ? `&pageToken=${pageToken}` : ''}`,
      );
      page.messages?.forEach((m) => ids.add(m.id));
      pageToken = page.nextPageToken;
      pages++;
    } while (pageToken && pages < 10);
  }
  result.messages = ids.size;

  const metas = await inBatches([...ids], 10, (id) =>
    gmail<MessageMeta>(
      token,
      `messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=In-Reply-To&metadataHeaders=References`,
    ),
  );

  for (const m of metas) {
    const h = (n: string) => m.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value;
    const from = parseAddresses(h('From'));
    const everyone = [...from, ...parseAddresses(h('To')), ...parseAddresses(h('Cc'))];
    const external = everyone.filter((a) => clientByDomain.has(domainOf(a.email)));
    if (external.length === 0) continue;
    // Reminders sent from here are already logged on the deal when they go out.
    const ours = await query(null, 'select 1 from billing_reminders where gmail_message_id = $1', [m.id]);
    if (ours.length) continue;

    const clientId = clientByDomain.get(domainOf((from.find((a) => clientByDomain.has(domainOf(a.email))) ?? external[0]).email))!;
    const people = external.filter((a) => clientByDomain.get(domainOf(a.email)) === clientId && !ROBOT.test(a.email));
    const inbound = from.length > 0 && domainOf(from[0].email) !== INTERNAL;
    const occurred = new Date(Number(m.internalDate));
    const messageId = (h('Message-ID') ?? m.id).replace(/[<>]/g, '');
    const subject = decode(h('Subject') ?? '(no subject)');

    // Contacts: add anyone new, and move last-contacted forward.
    for (const p of people) {
      const added = await write<{ id: string }>(
        null,
        'Gmail sync',
        `insert into contacts (client_id, name, email, role, notes, last_contacted_at)
         select $1, $2, $3, 'other', $4, $5
          where not exists (select 1 from contacts where lower(email) = $3)
         returning id`,
        [clientId, p.name ?? titleCase(p.email.split('@')[0]), p.email,
         `Found in ${account.email} on ${occurred.toISOString().slice(0, 10)}: "${subject.slice(0, 120)}"`, occurred],
      );
      if (added.length) result.contactsAdded++;
      else {
        await write(null, 'Gmail sync',
          `update contacts set last_contacted_at = $2
            where lower(email) = $1 and (last_contacted_at is null or last_contacted_at < $2)`,
          [p.email, occurred]);
      }
    }

    // 1. A reply in a thread that is already on a live deal stays with it. Gmail
    // thread ids differ per mailbox, so also match the Message-IDs this one answers.
    const refs = `${h('In-Reply-To') ?? ''} ${h('References') ?? ''}`
      .match(/<[^>]+>/g)?.map((r) => `mail:${r.replace(/[<>]/g, '')}`) ?? [];
    const [threaded] = await query<{ deal_id: string }>(
      null,
      `select i.deal_id from interactions i
         join deal_view dv on dv.id = i.deal_id
        where i.client_id = $1 and (i.thread_ref = $2 or i.source_ref = any($3::text[]))
          and not dv.stage_is_terminal and dv.archived_at is null
        order by i.occurred_at desc limit 1`,
      [clientId, m.threadId, refs],
    );
    let dealId: string | null = threaded?.deal_id ?? null;

    // 2. The one live deal all these people are linked to, if there is exactly one.
    if (!dealId) {
      const deals = await query<{ deal_id: string }>(
        null,
        `select distinct dc.deal_id from deal_contacts dc
           join contacts c on c.id = dc.contact_id
           join deal_view dv on dv.id = dc.deal_id
          where lower(c.email) = any($1) and dc.removed_at is null and c.archived_at is null
            and not dv.stage_is_terminal and dv.archived_at is null`,
        [people.map((p) => p.email)],
      );
      if (deals.length === 1) dealId = deals[0].deal_id;
    }

    // 3. Failing that, the client's only live deal.
    if (!dealId) {
      const only = await query<{ id: string }>(
        null,
        `select id from deal_view where client_id = $1 and not stage_is_terminal and archived_at is null`,
        [clientId],
      );
      if (only.length === 1) dealId = only[0].id;
    }

    const logged = await write<{ id: string }>(
      null,
      'Gmail sync',
      `insert into interactions (deal_id, client_id, channel, occurred_at, participants, summary, subject,
                                 direction, source_ref, mailbox, logged_by, thread_ref)
       values ($1, $2, 'email', $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (source_ref) where source_ref is not null do nothing
       returning id`,
      [dealId, clientId, occurred, everyone.map((a) => a.email),
       decode(m.snippet).slice(0, 500) || subject, subject, inbound ? 'inbound' : 'outbound',
       `mail:${messageId}`, account.email, account.connected_by, m.threadId],
    );
    if (logged.length) result.logged++;

    // Collections: a client writing back on a reminder thread.
    if (inbound) {
      const replied = await write<{ id: string }>(
        null,
        'Gmail sync',
        `update billing_reminders set replied_at = $2, reply_snippet = $3, reply_seen_at = null
          where gmail_thread_id = $1 and sent_at < $2 and (replied_at is null or replied_at < $2)
          returning id`,
        [m.threadId, occurred, decode(m.snippet).slice(0, 300)],
      );
      result.replies += replied.length;
    }
  }

  await query(null,
    `update mail_accounts set last_synced_at = now(), last_sync_count = $2, status = 'connected', last_error = null
      where id = $1`, [account.id, result.logged]);
  return result;
}

/** Syncs every connected mailbox that can be read. */
export async function syncAllMailboxes(): Promise<SyncResult[]> {
  const accounts = await query<{
    id: string; email: string; last_synced_at: string | null; sync_from: string | null; connected_by: string | null;
  }>(null, `select id, email, last_synced_at, sync_from, connected_by from mail_accounts
             where can_read and status in ('connected', 'error')`);
  const out: SyncResult[] = [];
  for (const a of accounts) {
    try {
      out.push(await syncMailbox(a));
    } catch (e) {
      const message = (e as Error).message;
      await query(null, `update mail_accounts set status = 'error', last_error = $2 where id = $1`, [a.id, message]);
      out.push({ mailbox: a.email, messages: 0, logged: 0, contactsAdded: 0, replies: 0, error: message });
    }
  }
  return out;
}
