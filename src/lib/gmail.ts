import 'server-only';
import { query } from './db';
import { open, seal } from './secret';
import { BASE_PATH } from './base-path';

/*
  Gmail through Google's own OAuth. Two kinds of mailbox:
    send  finance@revspot.ai: sends reminders, reads replies   (gmail.send + gmail.readonly)
    read  a teammate's mailbox: reads client threads only      (gmail.readonly)
  Tokens are written by the server as the database owner, never by the
  signed-in role, and are encrypted at rest (see secret.ts).
*/

export type Purpose = 'send' | 'read' | 'signin';

const SCOPES: Record<Purpose, string[]> = {
  signin: ['openid', 'email', 'profile'],
  send: [
    'openid',
    'email',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
  ],
  read: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'],
};

/**
 * The app's public URL, path prefix included (e.g. https://marketplace.revspot.ai/p/cs-dashboard-1),
 * whether or not APP_URL was written with it. Used for redirects, OAuth callbacks and
 * links in Slack.
 */
export function appUrl(): string {
  const url = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return BASE_PATH && !url.endsWith(BASE_PATH) ? `${url}${BASE_PATH}` : url;
}

export const redirectUri = () => `${appUrl()}/api/google/callback`;

/** What is missing before a mailbox can be connected. Empty when ready. */
export function setupGaps(): string[] {
  const gaps: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID) gaps.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) gaps.push('GOOGLE_CLIENT_SECRET');
  if (!process.env.MAIL_TOKEN_KEY) gaps.push('MAIL_TOKEN_KEY');
  return gaps;
}

export function authUrl(purpose: Purpose, state: string, loginHint?: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID ?? '');
  u.searchParams.set('redirect_uri', redirectUri());
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES[purpose].join(' '));
  if (purpose === 'signin') {
    u.searchParams.set('prompt', 'select_account');
  } else {
    // Mailboxes need a refresh token, which Google only returns with consent.
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
  }
  u.searchParams.set('state', state);
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain) u.searchParams.set('hd', domain);
  if (loginHint) u.searchParams.set('login_hint', loginHint);
  return u.toString();
}

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      ...body,
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(json.error_description ?? json.error ?? 'Google refused the token request');
  return json;
}

/** Finishes the OAuth round trip and stores the mailbox. Returns its address. */
export async function connectMailbox(code: string, purpose: Purpose, connectedBy: string): Promise<string> {
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove the app from your Google account permissions and connect again.');

  const who = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${t.access_token}` },
  });
  const { email } = (await who.json()) as { email?: string };
  if (!email) throw new Error('Google did not say which mailbox this is.');
  const domain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (domain && !email.toLowerCase().endsWith('@' + domain.toLowerCase())) {
    throw new Error(`Only @${domain} mailboxes can be connected.`);
  }

  const canSend = purpose === 'send' && t.scope.includes('gmail.send');
  const rows = await query<{ id: string }>(
    null,
    `insert into mail_accounts (email, can_send, can_read, status, last_error, connected_by, connected_at)
     values (lower($1), $2, true, 'connected', null, $3, now())
     on conflict (email) do update
       set can_send = mail_accounts.can_send or excluded.can_send,
           can_read = true, status = 'connected', last_error = null,
           connected_by = excluded.connected_by, connected_at = now(), updated_at = now()
     returning id`,
    [email, canSend, connectedBy],
  );
  await query(
    null,
    `insert into mail_account_tokens (account_id, refresh_token_enc, access_token_enc, expires_at, scopes)
     values ($1, $2, $3, now() + make_interval(secs => $4), $5)
     on conflict (account_id) do update
       set refresh_token_enc = excluded.refresh_token_enc, access_token_enc = excluded.access_token_enc,
           expires_at = excluded.expires_at, scopes = excluded.scopes`,
    [rows[0].id, seal(t.refresh_token), seal(t.access_token), t.expires_in - 60, t.scope],
  );
  return email.toLowerCase();
}

export async function disconnectMailbox(id: string) {
  const rows = await query<{ refresh_token_enc: string }>(
    null,
    'select refresh_token_enc from mail_account_tokens where account_id = $1',
    [id],
  );
  if (rows[0]) {
    // Best effort: tell Google too, so the grant disappears from the account.
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: open(rows[0].refresh_token_enc) }),
    }).catch(() => {});
  }
  await query(null, 'delete from mail_account_tokens where account_id = $1', [id]);
  await query(null, `update mail_accounts set status = 'disconnected', can_send = false, updated_at = now() where id = $1`, [id]);
}

export async function accessToken(accountId: string): Promise<string> {
  const rows = await query<{ refresh_token_enc: string; access_token_enc: string | null; fresh: boolean }>(
    null,
    `select refresh_token_enc, access_token_enc, coalesce(expires_at > now(), false) as fresh
       from mail_account_tokens where account_id = $1`,
    [accountId],
  );
  const row = rows[0];
  if (!row) throw new Error('This mailbox is not connected.');
  if (row.fresh && row.access_token_enc) return open(row.access_token_enc);

  try {
    const t = await tokenRequest({ refresh_token: open(row.refresh_token_enc), grant_type: 'refresh_token' });
    await query(
      null,
      `update mail_account_tokens set access_token_enc = $2, expires_at = now() + make_interval(secs => $3)
        where account_id = $1`,
      [accountId, seal(t.access_token), t.expires_in - 60],
    );
    return t.access_token;
  } catch (e) {
    await query(null, `update mail_accounts set status = 'error', last_error = $2, updated_at = now() where id = $1`, [
      accountId,
      (e as Error).message,
    ]);
    throw new Error(`Google refused the stored access for this mailbox. Connect it again. (${(e as Error).message})`);
  }
}

/** The connected mailbox that sends billing email, if there is one. */
export async function sendingAccount(): Promise<{ id: string; email: string } | null> {
  const rows = await query<{ id: string; email: string }>(
    null,
    `select id, email from mail_accounts where can_send and status = 'connected'
      order by (email like 'finance@%') desc, connected_at desc limit 1`,
  );
  return rows[0] ?? null;
}

const b64url = (s: string | Buffer) =>
  Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const header = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString('base64')}?=`);
const clean = (list: string[]) => list.map((e) => e.trim()).filter((e) => /^[^\s@<>,]+@[^\s@<>,]+$/.test(e));

export async function sendMail(
  account: { id: string; email: string },
  msg: { to: string[]; cc?: string[]; subject: string; body: string; threadId?: string | null },
): Promise<{ id: string; threadId: string }> {
  const to = clean(msg.to);
  const cc = clean(msg.cc ?? []);
  if (to.length === 0) throw new Error('No valid recipient. Add a billing email for this client.');

  const mime = [
    `From: Revspot Finance <${account.email}>`,
    `To: ${to.join(', ')}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${header(msg.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(msg.body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ]
    .filter((l) => l !== null)
    .join('\r\n');

  const token = await accessToken(account.id);
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw: b64url(mime), ...(msg.threadId ? { threadId: msg.threadId } : {}) }),
  });
  const json = (await res.json()) as { id?: string; threadId?: string; error?: { message?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? `Gmail refused the message (${res.status})`);
  return { id: json.id, threadId: json.threadId ?? json.id };
}

/** Google sign-in: returns the verified address and name, or throws. */
export async function signInWithCode(code: string): Promise<{ email: string; name: string | null }> {
  const t = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: redirectUri() });
  const who = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${t.access_token}` },
  });
  const info = (await who.json()) as { email?: string; email_verified?: boolean; name?: string; hd?: string };
  if (!info.email || info.email_verified === false) throw new Error('Google did not confirm this email address.');
  const domain = (process.env.ALLOWED_EMAIL_DOMAIN ?? 'revspot.ai').toLowerCase();
  const email = info.email.toLowerCase();
  if (!email.endsWith('@' + domain)) throw new Error(`Sign in with your @${domain} account.`);
  return { email, name: info.name ?? null };
}
