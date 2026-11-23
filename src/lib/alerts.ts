import 'server-only';
import { query } from './db';
import { appUrl } from './gmail';

/*
  Alerts go to one Slack channel through an incoming webhook (SLACK_WEBHOOK_URL).
  Without the webhook, alerts are skipped quietly: nothing else depends on them.
*/

export const slackConfigured = () => Boolean(process.env.SLACK_WEBHOOK_URL);

export async function postSlack(text: string): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, unfurl_links: false }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const link = (path: string, label: string) => `<${appUrl()}${path}|${label}>`;
const inr = (v: string | number) => '₹' + Math.round(Number(v)).toLocaleString('en-IN');

export async function alertHealthRed(dealId: string, reason: string, by: string) {
  const rows = await query<{ title: string; client_name: string }>(
    null, 'select title, client_name from deal_view where id = $1', [dealId]);
  if (!rows[0]) return;
  await postSlack(`:red_circle: ${link(`/deals/${dealId}`, `${rows[0].client_name} · ${rows[0].title}`)} turned red (${by}): ${reason}`);
}

export async function alertPayment(billId: string, amount: number) {
  const rows = await query<{ client_name: string; pi_number: string | null; balance: string; deal_id: string }>(
    null, 'select client_name, pi_number, balance, deal_id from bill_view where id = $1', [billId]);
  const b = rows[0];
  if (!b) return;
  await postSlack(
    `:moneybag: ${inr(amount)} received from ${b.client_name} against ${link(`/deals/${b.deal_id}`, b.pi_number ?? 'a PI')}` +
      (Number(b.balance) > 0 ? ` · ${inr(b.balance)} still due` : ' · paid in full, issue the TI'),
  );
}

/** The morning summary: what needs someone today. */
export async function dailyDigest(): Promise<string> {
  const [overdue, replies, red, renewals, late, queued, tiDue] = await Promise.all([
    query<{ client_name: string; pi_number: string | null; balance: string; days_overdue: number; deal_id: string }>(
      null, `select client_name, pi_number, balance, days_overdue, deal_id from bill_view
              where overdue order by days_overdue desc limit 8`),
    query<{ client_name: string; reply_snippet: string; deal_id: string }>(
      null, `select bv.client_name, r.reply_snippet, bv.deal_id from billing_reminders r
               join bill_view bv on bv.id = r.invoice_id
              where r.replied_at > now() - interval '1 day' order by r.replied_at desc limit 5`),
    query<{ id: string; client_name: string; title: string; health_reason: string | null }>(
      null, `select id, client_name, title, health_reason from deal_view
              where health = 'red' and not stage_is_terminal and archived_at is null order by client_name`),
    query<{ id: string; client_name: string; title: string; end_date: string; monthly_value: string | null }>(
      null, `select id, client_name, title, end_date, monthly_value from deal_view
              where category = 'retention' and not stage_is_terminal and archived_at is null
                and end_date between today_ist() and today_ist() + 30 order by end_date`),
    query<{ n: number }>(
      null, `select count(*)::int as n from deal_view
              where next_step_overdue and not stage_is_terminal and archived_at is null`),
    query<{ n: number }>(null, `select count(*)::int as n from billing_reminders where status = 'queued'`),
    query<{ n: number }>(null, `select count(*)::int as n from bill_view where step = 'paid'`),
  ]);

  const lines: string[] = [`*Revspot Central · ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}*`];
  if (replies.length) {
    lines.push('', '*Clients replied on payment reminders*');
    replies.forEach((r) => lines.push(`• ${link(`/deals/${r.deal_id}`, r.client_name)}: "${r.reply_snippet.slice(0, 120)}"`));
  }
  if (overdue.length) {
    lines.push('', '*Overdue payments*');
    overdue.forEach((b) => lines.push(`• ${link(`/deals/${b.deal_id}`, b.client_name)} · ${b.pi_number ?? 'PI'} · ${inr(b.balance)} · ${b.days_overdue}d`));
  }
  if (queued[0].n) lines.push('', `${link('/finance', `${queued[0].n} reminder${queued[0].n > 1 ? 's' : ''} waiting to be sent`)}`);
  if (tiDue[0].n) lines.push(`${link('/finance?view=ti', `${tiDue[0].n} paid bill${tiDue[0].n > 1 ? 's' : ''} need a TI`)}`);
  if (red.length) {
    lines.push('', '*Red deals*');
    red.forEach((d) => lines.push(`• ${link(`/deals/${d.id}`, `${d.client_name} · ${d.title}`)}${d.health_reason ? `: ${d.health_reason}` : ''}`));
  }
  if (renewals.length) {
    lines.push('', '*Renewing in the next 30 days*');
    renewals.forEach((d) => lines.push(`• ${link(`/deals/${d.id}`, `${d.client_name} · ${d.title}`)} · ends ${d.end_date}${d.monthly_value ? ` · ${inr(d.monthly_value)}/mo` : ''}`));
  }
  if (late[0].n) lines.push('', `${link('/tasks', `${late[0].n} deal${late[0].n > 1 ? 's have' : ' has'} an overdue next step`)}`);
  if (lines.length === 1) lines.push('Nothing needs attention today.');
  return lines.join('\n');
}
