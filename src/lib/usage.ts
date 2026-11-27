import 'server-only';
import { MongoClient } from 'mongodb';
import { query, tx } from './db';
import { asActor, type Profile } from './auth';

/*
  Client usage from the Revspot admin data (read-only Mongo, database `revv`):
    leads = revv.lead rows created that day (every lead Revspot processed)
    calls = revv.call_log rows created that day, demo calls excluded (every bot dial)
  Both grouped by the row's `client` and the IST calendar day. That `client` is a
  WORKSPACE (revv.client.company_name), not an org: one org can own many brands'
  workspaces (Propstar owns sumadhura, sobha, godrej-mmr...), so clients link to
  workspaces. The client_usage view does the 30-day comparison.
*/

export type UsageTrend = 'stopped' | 'down' | 'up' | 'steady' | 'new' | 'none';

export type ClientUsage = {
  client_id: string;
  leads_30: number;
  leads_prev: number;
  calls_30: number;
  calls_prev: number;
  leads_change_pct: number | null;
  calls_change_pct: number | null;
  workspaces: number;
  synced_at: string | null;
  trend: UsageTrend;
};

const HISTORY_DAYS = 180; // history kept for the trend chart and its date filter
const REFRESH_DAYS = 7; // later runs: re-count at least the last week, late rows included

/** Midnight IST `daysAgo` days back, as the naive UTC Date Mongo stores. */
function istMidnight(daysAgo: number): Date {
  const ist = new Date(Date.now() + 5.5 * 3600_000);
  const day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysAgo);
  return new Date(day - 5.5 * 3600_000);
}

function perWorkspaceDay(field: 'leads' | 'calls', extra: Record<string, unknown>, since: Date, until?: Date) {
  const when: Record<string, Date> = { $gte: since };
  if (until) when.$lt = until;
  return [
    { $match: { created_at: when, client: { $nin: [null, ''] }, ...extra } },
    {
      $group: {
        _id: {
          ws: '$client',
          day: { $dateToString: { date: '$created_at', format: '%Y-%m-%d', timezone: 'Asia/Kolkata' } },
        },
        [field]: { $sum: 1 },
      },
    },
  ];
}

/** Pulls workspaces (with their owning org) and per-day counts into Postgres. Safe to run any time. */
export async function syncUsage() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { skipped: 'MONGODB_URI is not set' };

  // Re-count from the newest day already held, so days missed while the job was
  // down (or Mongo was unreachable) get filled instead of reading as zero. When the
  // history is shorter than HISTORY_DAYS (first run, or a store built before the
  // window grew), fill all of it once.
  const [{ behind, span }] = await query<{ behind: number | null; span: number | null }>(
    null, 'select (today_ist() - max(day))::int as behind, (today_ist() - min(day))::int as span from usage_daily');
  const days =
    behind === null || span === null || span < HISTORY_DAYS - REFRESH_DAYS
      ? HISTORY_DAYS
      : Math.min(HISTORY_DAYS, Math.max(REFRESH_DAYS, behind + 1));
  const since = istMidnight(days);

  const mongo = new MongoClient(uri, { readPreference: 'secondaryPreferred' });
  try {
    await mongo.connect();
    const revv = mongo.db(process.env.REVV_DB || 'revv');
    const opts = { allowDiskUse: true, maxTimeMS: 150_000 };
    // call_log holds millions of rows a week (~17s per week to group), so count
    // it in weekly slices, four at a time, instead of one long scan.
    const slices: [Date, Date | undefined][] = [];
    for (let d = days; d > 0; d -= 7) slices.push([istMidnight(d), d > 7 ? istMidnight(d - 7) : undefined]);
    const calls: Awaited<ReturnType<typeof callSlice>> = [];
    const callSlice = (from: Date, to?: Date) =>
      revv.collection('call_log').aggregate(perWorkspaceDay('calls', { is_demo: { $ne: true } }, from, to), opts).toArray();
    const runCalls = async () => {
      const queue = [...slices];
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let s = queue.shift(); s; s = queue.shift()) calls.push(...(await callSlice(s[0], s[1])));
        }),
      );
    };
    const [accounts, workspaces, leads] = await Promise.all([
      revv.collection('accounts').find({}, { projection: { account_id: 1, display_name: 1 } }).toArray(),
      revv.collection('client')
        .find({}, { projection: { company_name: 1, display_name: 1, parent_account_id: 1, is_active: 1, updated_at: 1 } })
        .toArray(),
      revv.collection('lead').aggregate(perWorkspaceDay('leads', {}, since), opts).toArray(),
      runCalls(),
    ]);

    const rows = new Map<string, { ws: string; day: string; leads: number; calls: number }>();
    for (const [list, field] of [[leads, 'leads'], [calls, 'calls']] as const) {
      for (const r of list) {
        const key = `${r._id.ws}|${r._id.day}`;
        const row = rows.get(key) ?? { ws: String(r._id.ws), day: r._id.day, leads: 0, calls: 0 };
        row[field] = r[field];
        rows.set(key, row);
      }
    }
    const firstDay = new Date(since.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);

    // One record per workspace key: revv can hold duplicates (a re-created
    // workspace), and one upsert may not touch the same key twice. Keep the
    // active one, then the most recently updated.
    const byKey = new Map<string, (typeof workspaces)[number]>();
    const rank = (w: (typeof workspaces)[number]) => [w.is_active === false ? 0 : 1, new Date(w.updated_at ?? 0).getTime()];
    for (const w of workspaces) {
      const key = typeof w.company_name === 'string' ? w.company_name : null;
      if (!key) continue;
      const had = byKey.get(key);
      const [a1, a2] = rank(w);
      const [b1, b2] = had ? rank(had) : [-1, -1];
      if (!had || a1 > b1 || (a1 === b1 && a2 > b2)) byKey.set(key, w);
    }
    const ws = [...byKey.values()];

    await tx(null, 'Usage sync', async (c) => {
      // One sync at a time: the cron and "Sync now" both replace the same window.
      await c.query(`select pg_advisory_xact_lock(hashtext('usage_sync'))`);
      const orgName = new Map(accounts.map((a) => [a.account_id, a.display_name ?? null]));
      if (ws.length) {
        await c.query(
          `insert into revspot_workspaces (workspace_key, name, parent_org_key, parent_org_name, is_active, synced_at)
           select *, now() from unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::boolean[])
           on conflict (workspace_key) do update
             set name = excluded.name, parent_org_key = excluded.parent_org_key,
                 parent_org_name = excluded.parent_org_name, is_active = excluded.is_active, synced_at = now()`,
          [
            ws.map((w) => w.company_name),
            ws.map((w) => w.display_name ?? null),
            ws.map((w) => w.parent_account_id ?? null),
            ws.map((w) => (w.parent_account_id ? orgName.get(w.parent_account_id) ?? null : null)),
            ws.map((w) => w.is_active ?? null),
          ],
        );
      }
      // Replace the window wholesale, so a day that dropped to zero reads as zero.
      await c.query('delete from usage_daily where day >= $1', [firstDay]);
      const list = [...rows.values()];
      if (list.length) {
        await c.query(
          `insert into usage_daily (workspace_key, day, leads, calls)
           select * from unnest($1::text[], $2::date[], $3::int[], $4::int[])`,
          [list.map((r) => r.ws), list.map((r) => r.day), list.map((r) => r.leads), list.map((r) => r.calls)],
        );
        // A key with usage but no workspace record still has to be linkable.
        await c.query(
          `insert into revspot_workspaces (workspace_key)
           select distinct unnest($1::text[]) on conflict do nothing`,
          [list.map((r) => r.ws)],
        );
      }
    });
    return { days, workspaces: workspaces.length, rows: rows.size };
  } finally {
    await mongo.close().catch(() => {});
  }
}

// ---------------------------------------------------------------- reads

export async function usageForClient(me: Profile, clientId: string): Promise<ClientUsage | null> {
  const rows = await query<ClientUsage>(asActor(me), 'select * from client_usage where client_id = $1', [clientId]);
  return rows[0] ?? null;
}

/** Trend per client, for the clients list. */
export async function usageByClient(me: Profile): Promise<Map<string, ClientUsage>> {
  const rows = await query<ClientUsage>(asActor(me), 'select * from client_usage');
  return new Map(rows.map((r) => [r.client_id, r]));
}

export type UsageSource = { id: string; workspace_key: string; name: string | null; parent_org_name: string | null; leads_30: number; calls_30: number };

export async function usageSourcesFor(me: Profile, clientId: string): Promise<UsageSource[]> {
  return query<UsageSource>(
    asActor(me),
    `select s.id, s.workspace_key, o.name, o.parent_org_name,
            coalesce(sum(u.leads) filter (where u.day between usage_through() - 29 and usage_through()), 0)::int as leads_30,
            coalesce(sum(u.calls) filter (where u.day between usage_through() - 29 and usage_through()), 0)::int as calls_30
       from client_usage_sources s
       left join revspot_workspaces o on o.workspace_key = s.workspace_key
       left join usage_daily u on u.workspace_key = s.workspace_key and u.day >= usage_through() - 29
      where s.client_id = $1 and s.removed_at is null
      group by s.id, s.workspace_key, o.name, o.parent_org_name
      order by o.name nulls last, s.workspace_key`,
    [clientId],
  );
}

export const USAGE_HISTORY_DAYS = HISTORY_DAYS;

export type UsageDay = { day: string; leads: number; calls: number };

/** One row per IST day in [from, to], zero-filled, summed over the client's linked workspaces. */
export async function usageDaily(me: Profile, clientId: string, from: string, to: string) {
  return query<UsageDay>(
    asActor(me),
    `select g.day::date::text as day,
            coalesce(sum(u.leads), 0)::int as leads,
            coalesce(sum(u.calls), 0)::int as calls
       from generate_series($2::date, $3::date, interval '1 day') g(day)
       left join client_usage_sources s on s.client_id = $1 and s.removed_at is null
       left join usage_daily u on u.workspace_key = s.workspace_key and u.day = g.day::date
      group by g.day order by g.day`,
    [clientId, from, to],
  );
}

/** Totals for [from, to] and for the same number of days just before it. */
export async function usageRangeTotals(me: Profile, clientId: string, from: string, to: string) {
  const [row] = await query<{
    prev_from: string; prev_to: string; leads: number; calls: number; leads_prev: number; calls_prev: number;
  }>(
    asActor(me),
    `with r as (select $2::date as f, $3::date as t, ($3::date - $2::date + 1) as n)
     select (r.f - r.n)::text as prev_from, (r.f - 1)::text as prev_to,
            coalesce(sum(u.leads) filter (where u.day between r.f and r.t), 0)::int as leads,
            coalesce(sum(u.calls) filter (where u.day between r.f and r.t), 0)::int as calls,
            coalesce(sum(u.leads) filter (where u.day between r.f - r.n and r.f - 1), 0)::int as leads_prev,
            coalesce(sum(u.calls) filter (where u.day between r.f - r.n and r.f - 1), 0)::int as calls_prev
       from r
       left join client_usage_sources s on s.client_id = $1 and s.removed_at is null
       left join usage_daily u on u.workspace_key = s.workspace_key and u.day between r.f - r.n and r.t
      group by r.f, r.t, r.n`,
    [clientId, from, to],
  );
  return row;
}

/**
 * How far the usage store reaches: its first day, and the last COMPLETE day (the day
 * before the last successful sync, IST). Days after that have no data yet; drawing
 * them as zero would read as usage collapsing.
 */
export async function usageBounds(me: Profile) {
  const [row] = await query<{ earliest: string | null; through: string | null }>(
    asActor(me),
    `select (select min(day)::text from usage_daily) as earliest,
            usage_through()::text as through`,
  );
  return { earliest: row?.earliest ?? null, through: row?.through ?? null };
}

export type WorkspaceOption = {
  workspace_key: string;
  name: string | null;
  parent_org_name: string | null;
  volume: number;
};

/** Workspaces not yet linked to any client, busiest first, for the picker. */
export async function unlinkedWorkspaces(me: Profile) {
  return query<WorkspaceOption>(
    asActor(me),
    `select o.workspace_key, o.name, o.parent_org_name,
            coalesce((select sum(u.leads + u.calls) from usage_daily u
                       where u.workspace_key = o.workspace_key and u.day >= today_ist() - 60), 0)::int as volume
       from revspot_workspaces o
      where not exists (select 1 from client_usage_sources s
                         where s.workspace_key = o.workspace_key and s.removed_at is null)
      order by volume desc, coalesce(o.name, o.workspace_key)`,
  );
}

/** Clients whose usage is falling, for the morning digest. */
export async function fallingClients() {
  return query<{ client_id: string; name: string; trend: UsageTrend; leads_change_pct: number | null; calls_change_pct: number | null }>(
    null,
    `select u.client_id, c.name, u.trend, u.leads_change_pct, u.calls_change_pct
       from client_usage u join clients c on c.id = u.client_id
      where u.trend in ('stopped', 'down') and c.archived_at is null
      order by case u.trend when 'stopped' then 0 else 1 end,
               least(coalesce(u.leads_change_pct, 0), coalesce(u.calls_change_pct, 0))`,
  );
}
