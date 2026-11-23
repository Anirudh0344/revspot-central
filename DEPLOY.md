# Deploying Revspot Central

The app is a Next.js server and one Postgres database. The recommended home is
**Vercel** (app, scheduled jobs) with **Neon** (Postgres, daily backups and
point-in-time restore), both in Mumbai. Any Node host with cron plus any
Postgres 15+ works the same way.

## 1. Google (sign-in and Gmail)

One OAuth client covers sign-in, the finance mailbox and personal mailboxes.

1. Google Cloud console → new project → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen** → User type **Internal** (only @revspot.ai accounts; no Google review needed).
3. **Credentials → Create credentials → OAuth client ID** → Web application. Authorised redirect URIs:
   - `http://localhost:3000/api/google/callback`
   - `https://<your-domain>/api/google/callback`
4. Keep the client ID and secret for step 3.

## 2. Database

Create a Neon project (region: AWS Mumbai, `ap-south-1`). Copy the **pooled**
connection string (it ends in `?sslmode=require`). Then, from this folder:

```bash
PROD_DATABASE_URL='postgresql://…' npm run db:publish
```

That copies the local database (schema, clients, deals, contacts, bills,
playbooks) into the empty production one. It refuses to run if production
already has tables.

Later schema changes go out with:

```bash
PROD_DATABASE_URL='postgresql://…' npm run db:deploy
```

## 3. The app

```bash
npx vercel link
npx vercel env add <NAME> production   # once for each variable below
npx vercel deploy --prod
```

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the Neon pooled connection string |
| `APP_URL` | `https://<your-domain>` (no trailing slash) |
| `ALLOWED_EMAIL_DOMAIN` | `revspot.ai` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 1 |
| `SESSION_SECRET` | `openssl rand -base64 48` (new value, not the local one) |
| `MAIL_TOKEN_KEY` | `openssl rand -base64 32` (new value) |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `SLACK_WEBHOOK_URL` | optional: a Slack incoming webhook for the alerts channel |

Leave `NEXT_PUBLIC_SUPABASE_URL` unset.

## 4. Scheduled jobs

`vercel.json` schedules them; Vercel calls them with `CRON_SECRET`.

| Job | When | Does |
| --- | --- | --- |
| `/api/cron/daily` | 09:00 IST | syncs email, moves term deals to Renewal due, queues payment reminders, posts the Slack summary |
| `/api/cron/sync` | every 3 hours | syncs email |

Vercel's free plan runs crons once a day only; the 3-hourly sync needs the Pro
plan. On the free plan, delete the second entry and email syncs each morning
(and whenever someone presses **Sync email now** in Settings).

## 5. First sign-in

1. Open the site and **Continue with Google** with your @revspot.ai account. Existing
   profiles match by email; anyone new arrives as a viewer, and an admin raises them.
2. **Settings → Connect finance@revspot.ai** (sign in as finance@ when Google asks).
3. **Settings → Connect your mailbox** for each person whose client email should be logged.
4. **Settings → Run now** once, to check the daily jobs end to end.

## Backups

- Neon keeps point-in-time restore (7 days on the free plan, longer on paid).
- A full copy any time: `BACKUP_DATABASE_URL='postgresql://…' npm run db:backup`
  writes `backups/<name>-<time>.dump` and keeps 30 days of them.
- Restore into a database: `bash scripts/db.sh restore backups/<file>.dump <database-url>`.
