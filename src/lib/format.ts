/** All money in INR with Indian digit grouping; all dates in IST. */
const IST = 'Asia/Kolkata';

export function inr(v: number | string | null | undefined, short = false): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = typeof v === 'string' ? Number(v) : v;
  if (!Number.isFinite(n)) return '—';
  if (short && Math.abs(n) >= 100000) {
    const lakhs = n / 100000;
    return lakhs >= 100
      ? `₹${(lakhs / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`
      : `₹${lakhs.toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function istDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  }).format(new Date(d));
}

export function istDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(d));
}

/** Today's calendar date in IST, as 'YYYY-MM-DD'. */
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}

/** 'YYYY-MM-DD' for any date-ish value, read in IST. */
export function isoDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(d));
}

export function daysFromToday(d: string | Date | null | undefined): number | null {
  const then = isoDate(d);
  if (!then) return null;
  const ms = Date.parse(then + 'T00:00:00Z') - Date.parse(todayIST() + 'T00:00:00Z');
  return Math.round(ms / 86400000);
}

/** True when a dated thing is in the past, by IST calendar date. */
export function isOverdue(d: string | Date | null | undefined): boolean {
  const n = daysFromToday(d);
  return n !== null && n < 0;
}

export function relativeDue(d: string | Date | null | undefined): string {
  const n = daysFromToday(d);
  if (n === null) return '—';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return '1 day overdue';
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} days`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '··';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

/** 12345 -> '12.3k', 2500000 -> '25L': compact counts in Indian units. */
export function count(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1e7) return `${(v / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 })}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 1 })}L`;
  if (v >= 1e3) return `${(v / 1e3).toLocaleString('en-IN', { maximumFractionDigits: 1 })}k`;
  return v.toLocaleString('en-IN');
}

export function pct(p: number | null | undefined): string {
  if (p === null || p === undefined) return '—';
  return `${p > 0 ? '+' : ''}${p}%`;
}

/** 'leads −35% · calls stopped', naming only the metrics that moved. */
export function usageChangeText(u: {
  leads_change_pct: number | null;
  calls_change_pct: number | null;
}): string {
  const part = (label: string, p: number | null) =>
    p === null ? null : p === -100 ? `${label} stopped` : `${label} ${pct(p)}`;
  return [part('leads', u.leads_change_pct), part('bot calls', u.calls_change_pct)].filter(Boolean).join(' · ') || 'no comparable volume';
}

/** What people are called on screen: Owner (the super admin), Admin, User. */
export function roleLabel(p: { role: string; is_super_admin?: boolean | null }): string {
  if (p.is_super_admin) return 'Owner';
  if (p.role === 'admin') return 'Admin';
  if (p.role === 'bot') return 'Bot';
  return 'User';
}
