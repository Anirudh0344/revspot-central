import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { currentProfile } from '@/lib/auth';
import { dealList, profiles, stages } from '@/lib/queries';
import { moveStageAction } from '@/lib/actions';
import { Board } from '@/components/board';
import { btnPrimary } from '@/components/forms';
import { inr } from '@/lib/format';

export const dynamic = 'force-dynamic';

const TITLES: Record<string, string> = {
  pilot: 'Pilots',
  retention: 'Retention',
  expansion: 'Expansion',
};

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect('/login');
  const { category } = await params;
  if (!TITLES[category]) notFound();
  const sp = await searchParams;

  const [stageList, deals, people] = await Promise.all([
    stages(me, category),
    dealList(me, {
      category,
      health: sp.health,
      intern: sp.intern,
      product: sp.product,
      includeTerminal: true,
    }),
    profiles(me),
  ]);

  const live = deals.filter((d) => !d.stage_is_terminal);
  const monthly = live.reduce((s, d) => s + Number(d.monthly_value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">
          {TITLES[category]} <span className="text-neutral-400">{live.length} live</span>
        </h1>
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{inr(monthly, true)}/mo in flight</span>
          <Link href={`/deals/new?category=${category}`} className={btnPrimary}>
            New deal
          </Link>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <Select
          name="health"
          label="Health"
          value={sp.health}
          options={[
            ['red', 'Red'],
            ['amber', 'Amber'],
            ['green', 'Green'],
          ]}
        />
        <Select
          name="intern"
          label="Intern"
          value={sp.intern}
          options={people.filter((p) => p.role !== 'viewer').map((p) => [p.id, p.name])}
        />
        <label className="block">
          <span className="block text-[11px] uppercase tracking-wide text-neutral-500">Product</span>
          <input
            name="product"
            defaultValue={sp.product ?? ''}
            data-testid="filter-product"
            className="mt-1 w-36 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <button className={btnPrimary}>Apply</button>
        <Link href={`/boards/${category}`} className="pb-1.5 text-xs text-neutral-500 hover:underline">
          Clear
        </Link>
      </form>

      <Board stages={stageList} deals={deals} move={moveStageAction} />
    </div>
  );
}

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-neutral-500">{label}</span>
      <select
        name={name}
        defaultValue={value ?? ''}
        data-testid={`filter-${name}`}
        className="mt-1 w-36 rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
      >
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
