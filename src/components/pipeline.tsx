'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { input } from './forms';

/** Owner, client and "stuck only", written to the URL so a view can be shared. */
export function PipelineFilters({
  people,
  clients,
  values,
}: {
  people: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  values: { owner?: string; client?: string; stuck?: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const u = new URLSearchParams(sp.toString());
    if (v) u.set(k, v);
    else u.delete(k);
    router.push(`${pathname}?${u}`);
  };
  const sel = `${input} sm:w-auto sm:min-w-[9rem]`;
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center" data-testid="pipeline-filters">
      <select aria-label="Owner" className={sel} value={values.owner ?? ''} onChange={(e) => set('owner', e.target.value)}>
        <option value="">Every owner</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select aria-label="Client" className={sel} value={values.client ?? ''} onChange={(e) => set('client', e.target.value)}>
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="col-span-2 flex items-center gap-1.5 text-[13px] text-[var(--ink-muted)] sm:col-span-1">
        <input
          type="checkbox"
          checked={Boolean(values.stuck)}
          onChange={(e) => set('stuck', e.target.checked ? '1' : '')}
          data-testid="stuck-only"
        />
        Stuck only
      </label>
    </div>
  );
}
