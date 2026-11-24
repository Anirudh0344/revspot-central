import Link from "next/link";
import { redirect } from "next/navigation";
import { currentProfile } from "@/lib/auth";
import { clientList, profiles, stages } from "@/lib/queries";
import { moveStageAction } from "@/lib/actions";
import { pipeline } from "@/lib/pipeline";
import { Board } from "@/components/board";
import { Card, DealCard, Empty, type CardFlags } from "@/components/ui";
import { PipelineFilters } from "@/components/pipeline";
import { btnPrimary } from "@/components/forms";

export const dynamic = "force-dynamic";

function Tile({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "bad" | "good";
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--paper)] p-3">
      <p className="t-label">{label}</p>
      <p
        className={`mt-1 text-[20px] font-semibold tabular-nums tracking-[-0.01em] ${
          tone === "bad"
            ? "text-[var(--red)]"
            : tone === "good"
              ? "text-[var(--green-ink)]"
              : ""
        }`}
      >
        {value}
      </p>
      {note && (
        <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{note}</p>
      )}
    </div>
  );
}

/** A single-series horizontal bar: the accent fill, the number in ink beside it. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--paper-sunk)]">
      <span
        className="h-full rounded-full bg-[var(--accent)]"
        style={{ width: `${max ? (value / max) * 100 : 0}%` }}
      />
    </span>
  );
}

export default async function PilotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const me = await currentProfile();
  if (!me) redirect("/login");
  const sp = await searchParams;
  const filters = {
    owner: sp.owner || undefined,
    client: sp.client || undefined,
    stuck: sp.stuck === "1",
  };

  const [data, people, clients, pilotStages] = await Promise.all([
    pipeline(me, filters),
    profiles(me),
    clientList(me),
    stages(me, "pilot"),
  ]);
  const owners = people.filter(
    (p) => p.role === "admin" || p.role === "intern",
  );

  const flags: Record<string, CardFlags> = Object.fromEntries(
    data.deals.map((d) => [
      d.id,
      { reasons: d.reasons, questions: d.signal?.open_questions ?? 0 },
    ]),
  );
  const pilotDeals = data.deals.filter((d) => d.category === "pilot");
  const implementation = data.deals.filter((d) => d.category === "retention");
  const maxStage = Math.max(1, ...data.byStage.map((s) => s.deals));
  const maxReason = Math.max(1, ...data.byReason.map((r) => r.n));
  const o = data.outcomes;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            Pilots &amp; implementation
          </h1>
          <p className="text-[13px] text-[var(--ink-muted)]">
            Every live pilot and every client still onboarding, with who owns it
            and what it is stuck on.
          </p>
        </div>
        <Link href="/handover" className={btnPrimary}>
          Hand over a pilot
        </Link>
      </div>

      <PipelineFilters people={owners} clients={clients} values={filters} />

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        data-testid="pilot-tiles"
      >
        <Tile label="Live pilots" value={String(data.totals.pilots)} />
        <Tile
          label="Implementing"
          value={String(data.totals.implementation)}
          note="Retention, onboarding"
        />
        <Tile
          label="Stuck"
          value={String(data.totals.stuck)}
          tone={data.totals.stuck ? "bad" : undefined}
          note="Any reason below"
        />
        <Tile
          label="No owner"
          value={String(data.totals.noOwner)}
          tone={data.totals.noOwner ? "bad" : undefined}
        />
        <Tile
          label="Need a CRM integration"
          value={String(data.totals.crmNeeded)}
          note={`${data.totals.inCrm} in integration${data.totals.crmUnanswered ? ` · ${data.totals.crmUnanswered} not answered` : ""}`}
          tone={data.totals.crmUnanswered ? "bad" : undefined}
        />
        <Tile
          label="In testing"
          value={String(data.totals.testing)}
          note="Agent or customer testing"
        />
        <Tile
          label="In feedback rounds"
          value={String(data.totals.feedback)}
          note="Rounds 1 to 5"
        />
        <Tile
          label="Won, 90 days"
          value={o.rate === null ? "—" : `${Math.round(o.rate * 100)}%`}
          note={`${o.converted} live · ${o.stopped} lost · ${o.started} started`}
        />
        <Tile
          label="Days to go live"
          value={o.avgDays === null ? "—" : String(o.avgDays)}
          note="Average, last 90 days"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Card title="Where it slows down" testId="pilot-by-stage">
            <table className="w-full text-[13px]">
              <thead className="t-label text-left">
                <tr>
                  <th className="pb-1.5 font-medium">Stage</th>
                  <th className="w-[45%] pb-1.5 font-medium" />
                  <th className="pb-1.5 pl-2 text-right font-medium">Deals</th>
                  <th className="pb-1.5 pl-2 text-right font-medium">Stuck</th>
                  <th
                    className="whitespace-nowrap pb-1.5 pl-2 text-right font-medium"
                    title="Average days in stage / the aim"
                  >
                    Days
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.byStage.map((s) => (
                  <tr key={s.label}>
                    <td className="py-1.5 pr-2">{s.label}</td>
                    <td className="py-1.5 pr-2">
                      <Bar value={s.deals} max={maxStage} />
                    </td>
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {s.deals}
                    </td>
                    <td
                      className={`py-1.5 pl-2 text-right tabular-nums ${s.stuck ? "text-[var(--red)]" : "text-[var(--ink-faint)]"}`}
                    >
                      {s.stuck}
                    </td>
                    <td
                      className={`whitespace-nowrap py-1.5 pl-2 text-right tabular-nums ${s.avgDays !== null && s.maxDays && s.avgDays > s.maxDays ? "font-medium text-[var(--red)]" : ""}`}
                      title={s.maxDays ? `Aim: ${s.maxDays} days` : undefined}
                    >
                      {s.avgDays ?? "—"}
                      {s.maxDays && (
                        <span className="text-[11px] text-[var(--ink-faint)]">
                          {" "}
                          / {s.maxDays}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        <Card title="Why things are stuck" testId="pilot-by-reason">
          {data.byReason.length === 0 ? (
            <Empty>Nothing is stuck.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.byReason.map((r) => (
                <li key={r.label} className="text-[13px]">
                  <div className="flex justify-between gap-2">
                    <span>{r.label}</span>
                    <span className="tabular-nums text-[var(--ink-muted)]">
                      {r.n}
                    </span>
                  </div>
                  <Bar value={r.n} max={maxReason} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By owner" testId="pilot-by-owner">
          <table className="w-full text-[13px]">
            <thead className="t-label text-left">
              <tr>
                <th className="pb-1.5 font-medium">Owner</th>
                <th className="pb-1.5 text-right font-medium">Deals</th>
                <th className="pb-1.5 text-right font-medium">Stuck</th>
                <th
                  className="pb-1.5 text-right font-medium"
                  title="Next step missing or overdue"
                >
                  Late
                </th>
                <th
                  className="pb-1.5 text-right font-medium"
                  title="Open questions"
                >
                  Qs
                </th>
              </tr>
            </thead>
            <tbody>
              {data.byOwner.map((p) => (
                <tr key={p.id ?? "none"}>
                  <td
                    className={`py-1.5 ${p.id ? "" : "font-medium text-[var(--red)]"}`}
                  >
                    {p.id ? (
                      <Link
                        href={`/pilots?owner=${p.id}`}
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{p.deals}</td>
                  <td
                    className={`py-1.5 text-right tabular-nums ${p.stuck ? "text-[var(--red)]" : ""}`}
                  >
                    {p.stuck}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {p.overdue}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {p.questions}
                  </td>
                </tr>
              ))}
              {data.byOwner.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <Empty>No pilots or implementations.</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold">Pilot board</h2>
        <p className="mb-3 text-[12px] text-[var(--ink-muted)]">
          Drag a card to move it. Each card shows its owner, whether it needs a
          CRM integration, and anything holding it up. Pilots that need a CRM
          integration go through CRM integration initiated; the rest skip it.
        </p>
        <Board
          stages={pilotStages.filter((s) => !s.is_terminal)}
          deals={pilotDeals}
          move={moveStageAction}
          flags={flags}
        />
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold">Implementation</h2>
        {implementation.length === 0 ? (
          <Empty>
            No client is onboarding right now. Retention deals in Onboarding
            show up here.
          </Empty>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {implementation.map((d) => (
              <DealCard key={d.id} deal={d} flags={flags[d.id]} />
            ))}
          </div>
        )}
      </section>

      <Card title="Stuck list" count={data.stuck.length} testId="stuck-list">
        {data.stuck.length === 0 ? (
          <Empty>Nothing is stuck.</Empty>
        ) : (
          <div className="scroll-x overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="t-label text-left">
                <tr>
                  <th className="pb-1.5 font-medium">Deal</th>
                  <th className="pb-1.5 font-medium">Stage</th>
                  <th className="pb-1.5 font-medium">Owner</th>
                  <th className="pb-1.5 font-medium">Why</th>
                  <th className="pb-1.5 text-right font-medium">
                    Last activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {data.stuck.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-2 pr-3">
                      <Link
                        href={`/deals/${d.id}`}
                        className="font-medium hover:underline"
                      >
                        {d.title}
                      </Link>
                      <p className="text-[12px] text-[var(--ink-muted)]">
                        {d.client_name}
                      </p>
                    </td>
                    <td className="py-2 pr-3">
                      {d.category === "retention"
                        ? "Implementation"
                        : d.stage_label}
                      <p className="text-[12px] text-[var(--ink-faint)]">
                        {d.days_in_stage} days
                      </p>
                    </td>
                    <td
                      className={`py-2 pr-3 ${d.intern_owner_name ? "" : "font-medium text-[var(--red)]"}`}
                    >
                      {d.intern_owner_name ?? "No owner"}
                    </td>
                    <td className="py-2 pr-3">
                      <ul className="space-y-0.5">
                        {d.reasons.map((r) => (
                          <li
                            key={r.text}
                            className={
                              r.severity === "red"
                                ? "text-[var(--red)]"
                                : "text-[var(--amber)]"
                            }
                          >
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="py-2 text-right tabular-nums text-[var(--ink-muted)]">
                      {d.idleDays === null
                        ? "—"
                        : d.idleDays === 0
                          ? "today"
                          : `${d.idleDays}d ago`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
