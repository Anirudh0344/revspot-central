# Deploying Revspot Central

The app is a Next.js server and one Postgres database (15+). It runs on our own
server; a move to the Revspot Marketplace comes later (see the end). `vercel.json`
is left over from an earlier plan and does nothing on our server: scheduled jobs
are run by the server's cron (step 4).

## 1. Google (sign-in and Gmail)

One OAuth client covers sign-in, the finance mailbox and personal mailboxes.

1. Google Cloud console → new project → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen** → User type **Internal** (only @revspot.ai accounts; no Google review needed).
3. **Credentials → Create credentials → OAuth client ID** → Web application. Authorised redirect URIs:
   - `http://localhost:3000/api/google/callback`
   - `https://<your-domain>/api/google/callback`
4. Keep the client ID and secret for step 3.

## 2. Database

Production runs on **Neon**, project `revspot-central`, region AWS Singapore
(`ap-southeast-1`; Neon has no Mumbai region). Use the **pooled** connection string.
Point `PROD_DATABASE_URL` at the production Postgres. For a first deploy into an
empty database, from this folder:

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

Run `db:deploy` **before** starting a build that needs a new migration: pages
read the new tables as soon as they are up.

## 3. The app

On the server, from a checkout of `main`:

```bash
npm ci
npm run build
PORT=3000 npm start        # keep it running under the server's process manager
```

Put it behind the server's reverse proxy with HTTPS. Give requests at least a
**120 s** timeout: the first usage sync from **Sync now** takes 60–90 s (later
ones take a few seconds). The environment, in `.env.production` or the process
manager's config:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the production Postgres connection string |
| `APP_URL` | `https://<your-domain>` (no trailing slash) |
| `ALLOWED_EMAIL_DOMAIN` | `revspot.ai` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from step 1 |
| `SESSION_SECRET` | `openssl rand -base64 48` (new value, not the local one) |
| `MAIL_TOKEN_KEY` | `openssl rand -base64 32` (new value) |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `SLACK_WEBHOOK_URL` | optional: a Slack incoming webhook for the alerts channel |
| `ACCESS_CODE` | until Google is set up: shared code for pick-your-profile sign-in |
| `MONGODB_URI` | read-only connection string to the Revspot admin Mongo, for client usage; without it the usage sync skips |
| `REVV_DB` | `revv` |

Leave `NEXT_PUBLIC_SUPABASE_URL` unset.

## 4. Scheduled jobs

The server's cron calls two endpoints with `CRON_SECRET`:

| Job | When | Does |
| --- | --- | --- |
| `/api/cron/daily` | 09:00 IST | syncs email and client usage, moves term deals to Renewal due, queues payment reminders, posts the Slack summary |
| `/api/cron/sync` | every 3 hours | syncs email |

Crontab (`crontab -e` as the app's user; times are UTC, 03:30 UTC = 09:00 IST):

```cron
30 3 * * *   curl -fsS -m 600 -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/daily > /dev/null
0 */3 * * *  curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" https://<your-domain>/api/cron/sync > /dev/null
```

Set `CRON_SECRET` at the top of the crontab (`CRON_SECRET=...`), or call
`http://localhost:3000/...` from the same machine to skip the proxy timeout.
Settings shows each run and whether it worked.

## 5. First sign-in

1. Open the site and **Continue with Google** with your @revspot.ai account. Existing
   profiles match by email; anyone new arrives as a viewer, and an admin raises them.
2. **Settings → Connect finance@revspot.ai** (sign in as finance@ when Google asks).
3. **Settings → Connect your mailbox** for each person whose client email should be logged.
4. **Settings → Run now** once, to check the daily jobs end to end.

## Backups

- A full copy any time: `BACKUP_DATABASE_URL='postgresql://…' npm run db:backup`
  writes `backups/<name>-<time>.dump` and keeps 30 days of them.
- Restore into a database: `bash scripts/db.sh restore backups/<file>.dump <database-url>`.

## Revspot Marketplace

Served at **https://marketplace.revspot.ai/p/cs-dashboard-1/** (slug `cs-dashboard-1`).

How the app fits Marketplace:

- **One container** from the root `Dockerfile`: `next build`, then `node server.mjs`
  on port 80. There is no separate backend; the app's `/api/...` routes are part of
  the same server.
- **Base path.** `next.config.ts` sets Next.js `basePath` from `BASE_PATH`, baked in
  at build. Marketplace writes its own compose file, so build args may not arrive;
  a bare `/` therefore counts as unset and the value is read from `.env`
  (`BASE_PATH=/p/cs-dashboard-1/`). `server.mjs` puts the prefix back if the platform
  strips it, and serves `/p/cs-dashboard-1` and `/p/cs-dashboard-1/` without the redirect
  loop the two would otherwise cause. `<Link>` and `redirect()` add the prefix
  themselves; plain links use `withBase()`, absolute URLs use `appUrl()`.
- **Local dev is unaffected:** `.env.local` sets `BASE_PATH=/`, and only a production
  build reads the prefix from `.env`.

### First upload

1. Fill the blanks in `.env` (kept out of git; it ships inside the zip):
   `DATABASE_URL` (production Postgres reachable from the Marketplace server),
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` when Google is ready. Until then,
   `ACCESS_CODE` (generated in `.env`) is the team's sign-in: enter it on /login and
   pick your profile; it gives the same signed session as Google. Anyone with the
   code can pick any profile, admin included, so share it only with the team, and
   change it to sign everyone out of new sign-ins. Once the Google keys are set,
   the access code stops working and Google takes over.
2. In the Google OAuth client, add the redirect URI
   `https://marketplace.revspot.ai/p/cs-dashboard-1/api/google/callback`.
3. Apply migrations to that database: `PROD_DATABASE_URL='…' npm run db:deploy`.
4. Build the zip from the repo root (keeps `.git` and `.env`, drops local files):

   ```bash
   zip -r ../cs-dashboard-1.zip . -x "node_modules/*" ".next/*" ".next-test/*" ".env.local" "backups/*" "*.tsbuildinfo" ".claude/*"
   ```

5. Upload it on Marketplace with the slug `cs-dashboard-1`.

### Auto-deploy

After the first upload, open the deployment's **Auto-deploy** tab, copy the
workflow (it has the real `DEPLOY_PATH`, `deploy-{id}-cs-dashboard-1`) and commit it as
`.github/workflows/deploy.yml`. Every push to `main` then rebuilds the app. Keep
`.env` untracked: the workflow's `git reset --hard` leaves untracked files alone.

### Scheduled jobs

Marketplace runs no cron. Something must call, with `Authorization: Bearer <CRON_SECRET>`:

```cron
30 3 * * *   curl -fsS -m 600 -H "Authorization: Bearer $CRON_SECRET" https://marketplace.revspot.ai/p/cs-dashboard-1/api/cron/daily > /dev/null
0 */3 * * *  curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" https://marketplace.revspot.ai/p/cs-dashboard-1/api/cron/sync > /dev/null
```

The daily job also runs the client usage sync, which needs the Marketplace server to
reach the Revspot admin Mongo (`MONGODB_URI`; mind its IP allowlist).
