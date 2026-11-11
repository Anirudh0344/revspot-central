import 'server-only';
import pg, { Pool, type PoolClient } from 'pg';

// Keep DATE as a plain 'YYYY-MM-DD' string. Turning it into a JS Date would
// re-interpret it in the server's zone, and every date here is an IST calendar
// date, not an instant.
pg.types.setTypeParser(1082, (v) => v);

declare global {
  var __ccPool: Pool | undefined;
}

export const pool =
  global.__ccPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') global.__ccPool = pool;

export type Actor = { id: string; role: string } | null;

/**
 * One write path. Every statement runs inside a transaction that carries the
 * actor and the reason, so the activity trigger can attribute it, and under
 * `role authenticated` so the same RLS policies apply to the UI, the API and
 * the bot.
 */
async function withSession<T>(
  actor: Actor,
  reason: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1,$2,true)', ['app.actor', actor?.id ?? '']);
    await client.query('select set_config($1,$2,true)', ['app.reason', reason ?? '']);
    await client.query('select set_config($1,$2,true)', [
      'request.jwt.claim.sub',
      actor?.id ?? '',
    ]);
    if (actor) await client.query('set local role authenticated');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function query<T = Record<string, unknown>>(
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withSession(actor, null, async (c) => (await c.query(sql, params)).rows as T[]);
}

export async function write<T = Record<string, unknown>>(
  actor: Actor,
  reason: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withSession(actor, reason, async (c) => (await c.query(sql, params)).rows as T[]);
}

export async function tx<T>(
  actor: Actor,
  reason: string | null,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  return withSession(actor, reason, fn);
}

/** Turns a Postgres rule violation into a message a person (or the bot) can act on. */
export function readableError(e: unknown): string {
  const err = e as { message?: string; code?: string; detail?: string };
  if (!err?.message) return 'Something went wrong.';
  if (err.code === '23505') {
    if (err.message.includes('clients_name_active_uniq'))
      return 'A client with that name already exists.';
    if (err.message.includes('deals_code_key')) return 'That deal code is already taken.';
    return 'That record already exists.';
  }
  return err.message.replace(/^.*?ERROR:\s*/i, '');
}
