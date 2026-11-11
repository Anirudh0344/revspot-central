# Revspot CS Command Center

Internal system of record for customer success: every client and deal, each deal's
health against written success criteria, and the activity log behind it all.

Next.js (App Router) on a Postgres database with Supabase Auth and Row Level
Security. Built from `Revspot CS Command Center Product Requirements.md`.

## What is here (today's MVP)

| Module | State |
| --- | --- |
| 1 Clients and contacts | Built — list with computed status and health, client page with tabs, contacts with roles, single-threaded flag, email-domain capture |
| 2 Deals, pipelines, criteria, health | Built — three Kanban boards, exit-requirement gating, six criteria fields, health with required reason and history, line items, pilot conversion, handover form |
| 3 Tasks and activity log | Built — tasks, My work, next-step mirroring, activity log by database trigger, field-level undo |
| 8 Home screen | Built — HM-1 to HM-4 (reds, due today, pilots ending, hygiene) |
| 9 Grok bot access | Built — bot role, required reason on bot writes, bot work queue, bot digest, undo, stable `data-testid`s, `/deals/{id}/summary` |
| 3 Internal requests | Schema, SLA config and due-date calculation are in; the board is Phase 2 |
| 4 Communication | Manual interaction logging and check-in-due computation are in; Gmail sync is Phase 2 |
| 5–7 Outcomes, notes, billing | Schema only |

## Getting started

1. **Database.** Postgres 17 (`brew install postgresql@17 && brew services start postgresql@17`).

```bash
npm run db:reset
```

That drops and recreates `cs_cc`, applies every migration and loads the seed.

2. **App.**

```bash
npm run dev
```

Open http://localhost:3000. Without a Supabase project configured, the login
screen lets you pick a profile (Anunay, two interns, the Grok bot, sales) so
every role is reachable locally.

3. **Tests.**

```bash
npm run db:test
```

39 checks against a throwaway database, written straight from the PRD's
acceptance criteria — criteria gating, health rules, conversion, SLA dates,
the audit log, undo, and the RLS/grant behaviour the app actually runs under.

## Moving to Supabase

1. Create the project, then run `supabase/migrations/*.sql` in order (they are
   plain SQL; `npx supabase db push` works once the project is linked).
   Do **not** run `supabase/local-shim.sql` — it only stands in for the `auth`
   schema locally.
2. Enable Google sign-in and restrict it to `revspot.ai`.
3. Fill `.env.local`:

```
DATABASE_URL=<the project's pooler connection string>
NEXT_PUBLIC_SUPABASE_URL=<project url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
ALLOWED_EMAIL_DOMAIN=revspot.ai
```

4. Insert a `profiles` row per person, keyed on their `auth.users` id.

## How writes work

Every write — UI, future API, bot — goes through `src/lib/db.ts`, which opens a
transaction, sets `app.actor` and `app.reason`, and switches to the
`authenticated` role so Row Level Security applies exactly as it would through
PostgREST. A trigger on each core table writes the `activity` row with the actor,
the changed fields and their before and after values. The trigger function is
`security definer`, so the log is written even though `authenticated` cannot
insert into `activity` directly, and nothing can forge or delete a log row.

The business rules live in the database, not the UI:

- a live deal cannot be saved without a dated next step
- a stage move checks that stage's `exit_requirements` and names what is missing
- health always carries a reason, and green needs all six criteria
- a terminal stage needs a close reason
- bot writes are refused without a reason
- there is no delete path anywhere; records are archived

So the API and the bot get the same answers as a person clicking, and the error
text is written to be read by either.

## Decisions worth knowing

- **Client status order.** The PRD lists Pilot, Active, Paused, Churned,
  Prospect in that order, but a client whose only open deal is paused matches
  both "any retention deal is open" and "every open deal is paused". The more
  specific rule wins here, so such a client reads **Paused**, not Active.
- **Postgres over PostgREST.** The app talks to Postgres directly rather than
  through `supabase-js`, because per-request `app.actor` and `app.reason` are
  what make the audit trail honest. Auth still goes through Supabase.
- **`exit_requirements` are entry requirements.** The column keeps its PRD name,
  but it lists what a deal needs to *enter* that stage, which is how DL-4 reads.
- **Handover fields.** `handover_notes` and `conversion_price` were added to
  `deals`; the handover form captures promises and dependencies that had no home
  in the PRD schema.
- **Dates.** `DATE` columns are read as `YYYY-MM-DD` strings, never JS `Date`s,
  so an IST calendar date never shifts a day in a different server zone.

## Open questions from the PRD

Still unanswered, and all Phase 2 or later: the Grok bot's runtime and whether
it wants MCP, which inboxes Gmail sync covers, where daily delivery numbers come
from, Slack or WhatsApp for alerts, the accounting tool of record, and whether
sales gets logins.
