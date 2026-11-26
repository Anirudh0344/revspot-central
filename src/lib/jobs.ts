import 'server-only';
import { query } from './db';
import { syncAllMailboxes } from './gmail-sync';
import { dailyDigest, postSlack } from './alerts';
import { syncUsage } from './usage';

/** Runs a job and records it, so Settings can show what ran and whether it worked. */
async function logged<T>(job: string, fn: () => Promise<T>): Promise<T> {
  const [run] = await query<{ id: number }>(null, 'insert into job_runs (job) values ($1) returning id', [job]);
  try {
    const out = await fn();
    await query(null, 'update job_runs set finished_at = now(), ok = true, summary = $2 where id = $1', [run.id, JSON.stringify(out ?? null)]);
    return out;
  } catch (e) {
    await query(null, 'update job_runs set finished_at = now(), ok = false, summary = $2 where id = $1', [run.id, JSON.stringify({ error: (e as Error).message })]);
    throw e;
  }
}

/** Every few hours: pull new client email. */
export function runMailSync() {
  return logged('mail_sync', () => syncAllMailboxes());
}

/** Client usage (leads + bot calls) from the Revspot admin data. */
export function runUsageSync() {
  return logged('usage_sync', () => syncUsage());
}

/** Every morning: mail, usage, renewals, reminders, then the Slack summary. */
export function runDaily() {
  return logged('daily', async () => {
    const mail = await syncAllMailboxes().catch((e) => ({ error: (e as Error).message }));
    const usage = await runUsageSync().catch((e) => ({ error: (e as Error).message }));
    const [renewals] = await query<{ n: number }>(null, 'select run_renewal_watch() as n');
    const [reminders] = await query<{ n: number }>(null, 'select queue_billing_reminders() as n');
    const digest = await dailyDigest();
    const posted = await postSlack(digest);
    return { mail, usage, renewals_moved: renewals.n, reminders_queued: reminders.n, slack: posted };
  });
}

export async function recentJobs(limit = 10) {
  return query<{ id: number; job: string; started_at: string; finished_at: string | null; ok: boolean | null; summary: unknown }>(
    null, 'select id, job, started_at, finished_at, ok, summary from job_runs order by started_at desc limit $1', [limit]);
}
