'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { UsageDay } from '@/lib/usage';
import { USAGE_PRESETS, type UsageRange } from '@/lib/usage-range';
import { count } from '@/lib/format';
import { btn, btnPrimary } from './forms';

/*
  Daily usage as two single-line charts, leads and bot calls. Their scales differ by
  ~1000x, so they never share an axis. Hovering either chart shows that day's values
  for both, with a crosshair on each.
*/

const H = 150;
const M = { top: 10, right: 12, bottom: 22, left: 44 };

const fullDate = (d: string) =>
  new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(d));
const shortDate = (d: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(d));

/** 0 and up to 4 clean steps covering max (1/2/5 × 10^n). */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough)!;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) out.push(v);
  return out;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function UsageTrend({ days }: { days: UsageDay[] }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="space-y-4" data-testid="usage-trend">
      <LineChart title="Leads processed per day" metric="leads" days={days} hover={hover} setHover={setHover} />
      <LineChart title="Bot calls per day" metric="calls" days={days} hover={hover} setHover={setHover} />
      <details className="text-[12px]">
        <summary className="cursor-pointer text-[var(--ink-muted)]">Daily numbers</summary>
        <div className="mt-2 max-h-64 overflow-y-auto">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 bg-[var(--paper)] text-left">
              <tr>
                <th className="t-label py-1">Day</th>
                <th className="t-label py-1 text-right">Leads</th>
                <th className="t-label py-1 text-right">Bot calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {[...days].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="py-1">{fullDate(d.day)}</td>
                  <td className="py-1 text-right">{d.leads.toLocaleString('en-IN')}</td>
                  <td className="py-1 text-right">{d.calls.toLocaleString('en-IN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function LineChart({
  title,
  metric,
  days,
  hover,
  setHover,
}: {
  title: string;
  metric: 'leads' | 'calls';
  days: UsageDay[];
  hover: number | null;
  setHover: (i: number | null) => void;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const values = days.map((d) => d[metric]);
  const total = values.reduce((a, b) => a + b, 0);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1];
  const w = Math.max(width - M.left - M.right, 1);
  const h = H - M.top - M.bottom;
  const x = (i: number) => M.left + (days.length <= 1 ? w / 2 : (i * w) / (days.length - 1));
  const y = (v: number) => M.top + h - (v / top) * h;

  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = values.length
    ? `${line}L${x(values.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
    : '';
  const xLabels = days.length > 2 ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : days.map((_, i) => i);

  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const px = clientX - r.left - M.left;
    const i = days.length <= 1 ? 0 : Math.round((px / w) * (days.length - 1));
    setHover(Math.min(days.length - 1, Math.max(0, i)));
  };

  const hv = hover !== null && hover < days.length ? hover : null;
  const tipLeft = hv !== null ? Math.min(Math.max(x(hv) - 80, 0), Math.max(width - 168, 0)) : 0;

  return (
    <figure className="m-0" data-testid={`usage-chart-${metric}`}>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium">{title}</span>
        <span className="text-[12px] tabular-nums text-[var(--ink-muted)]">{total.toLocaleString('en-IN')} in range</span>
      </figcaption>
      <div ref={ref} className="relative mt-1">
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${title}, ${days.length} days, ${total.toLocaleString('en-IN')} in total. Use left and right arrows to read each day.`}
            tabIndex={0}
            className="block touch-none outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-100)]"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              const cur = hv ?? days.length - 1;
              setHover(Math.min(days.length - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + w} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-faint)" className="tabular-nums">
                  {count(t)}
                </text>
              </g>
            ))}
            {xLabels.map((i, k) => (
              <text
                key={i}
                x={x(i)}
                y={H - 6}
                fontSize={11}
                fill="var(--ink-faint)"
                textAnchor={k === 0 ? 'start' : k === xLabels.length - 1 ? 'end' : 'middle'}
              >
                {shortDate(days[i].day)}
              </text>
            ))}
            {total > 0 && (
              <>
                <path d={area} fill="var(--accent)" fillOpacity={0.1} />
                <path d={line} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            {total === 0 && (
              <text x={M.left + w / 2} y={M.top + h / 2} textAnchor="middle" fontSize={12} fill="var(--ink-faint)">
                None in this range
              </text>
            )}
            {hv !== null && (
              <>
                <line x1={x(hv)} x2={x(hv)} y1={M.top} y2={M.top + h} stroke="var(--ink-faint)" strokeWidth={1} />
                <circle cx={x(hv)} cy={y(values[hv])} r={4} fill="var(--accent)" stroke="var(--paper)" strokeWidth={2} />
              </>
            )}
          </svg>
        )}
        {hv !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-40 rounded-md border border-[var(--line)] bg-[var(--paper)] px-2.5 py-1.5 text-[12px] shadow-sm"
            style={{ left: tipLeft }}
            role="status"
          >
            <p className="text-[var(--ink-muted)]">{fullDate(days[hv].day)}</p>
            <p className="flex justify-between tabular-nums">
              <span>Leads</span>
              <span className={metric === 'leads' ? 'font-medium' : ''}>{days[hv].leads.toLocaleString('en-IN')}</span>
            </p>
            <p className="flex justify-between tabular-nums">
              <span>Bot calls</span>
              <span className={metric === 'calls' ? 'font-medium' : ''}>{days[hv].calls.toLocaleString('en-IN')}</span>
            </p>
          </div>
        )}
      </div>
    </figure>
  );
}

/** Date filter for the Usage tab: presets first, then a custom range. Scopes the charts and the table. */
export function UsageRangeFilter({
  range,
  earliest,
  through,
}: {
  range: UsageRange;
  earliest: string | null;
  through: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);

  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    q.set('tab', 'usage');
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    start(() => router.push(`${pathname}?${q.toString()}`, { scroll: false }));
  };

  return (
    <div className="flex flex-wrap items-end gap-2" data-testid="usage-range-filter" aria-busy={pending}>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Date range">
        {USAGE_PRESETS.map((p) => {
          const on = range.key === p.key;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              data-testid={`usage-range-${p.key}`}
              className={on ? btnPrimary : btn}
              onClick={() => go({ range: p.key, from: null, to: null })}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <form
        className="flex flex-wrap items-end gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          go({ range: null, from, to });
        }}
      >
        <label className="text-[12px] text-[var(--ink-muted)]">
          From
          <input
            type="date"
            value={from}
            min={earliest ?? undefined}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="ml-1 rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-1.5 py-[3px] text-[12px]"
            data-testid="usage-from"
          />
        </label>
        <label className="text-[12px] text-[var(--ink-muted)]">
          To
          <input
            type="date"
            value={to}
            min={from}
            max={through ?? undefined}
            onChange={(e) => setTo(e.target.value)}
            className="ml-1 rounded-md border border-[var(--line-strong)] bg-[var(--paper)] px-1.5 py-[3px] text-[12px]"
            data-testid="usage-to"
          />
        </label>
        <button type="submit" className={range.key === 'custom' ? btnPrimary : btn} data-testid="usage-range-apply">
          {range.key === 'custom' ? 'Custom range' : 'Apply'}
        </button>
      </form>
      {pending && <span className="text-[12px] text-[var(--ink-faint)]">Loading…</span>}
      {through && (
        <span className="text-[12px] text-[var(--ink-faint)]" data-testid="usage-through">
          Data through {shortDate(through)}
        </span>
      )}
      {earliest && earliest > range.from && (
        <span className="text-[12px] text-[var(--amber)]">Usage history starts {earliest}; earlier days show as zero.</span>
      )}
    </div>
  );
}
