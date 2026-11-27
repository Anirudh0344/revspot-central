/*
  The Usage tab's date filter, read from the URL (?range=30 or ?from=…&to=…).
  Ranges end yesterday (IST) by default: today is still filling in, and a half day
  would read as a drop.
*/

export const USAGE_PRESETS = [
  { key: '7', label: 'Last 7 days', days: 7 },
  { key: '30', label: 'Last 30 days', days: 30 },
  { key: '90', label: 'Last 90 days', days: 90 },
  { key: '180', label: 'Last 180 days', days: 180 },
] as const;

export type UsageRange = { key: string; label: string; from: string; to: string; days: number };

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

/** Today's IST calendar date as 'YYYY-MM-DD'. */
export function todayIst(now = Date.now()) {
  return iso(now + 5.5 * 3600_000);
}

/**
 * `through` is the last complete day of data (see usageBounds); ranges end there when
 * the sync is behind, so missing days never draw as zero.
 */
export function resolveUsageRange(
  sp: { range?: string; from?: string; to?: string },
  through: string | null = null,
  now = Date.now(),
): UsageRange {
  const yesterdayIst = Date.parse(todayIst(now)) - DAY;
  // "yesterday" here is the last day a range may include.
  const yesterday = through ? Math.min(yesterdayIst, Date.parse(through)) : yesterdayIst;
  if (isDate(sp.from) && isDate(sp.to)) {
    let f = Date.parse(sp.from);
    let t = Math.min(Date.parse(sp.to), yesterday);
    if (f > t) [f, t] = [t, f];
    const days = Math.round((t - f) / DAY) + 1;
    return { key: 'custom', label: `${iso(f)} to ${iso(t)}`, from: iso(f), to: iso(t), days };
  }
  const preset = USAGE_PRESETS.find((p) => p.key === sp.range) ?? USAGE_PRESETS[1];
  return {
    key: preset.key,
    label: preset.label,
    from: iso(yesterday - (preset.days - 1) * DAY),
    to: iso(yesterday),
    days: preset.days,
  };
}
