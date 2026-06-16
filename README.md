# EmailTrackingOne

**Automatic** two-batch email campaign dashboard. Upload an Excel/CSV list, pick
a **batch**, and the fixed follow-up sequence sends itself on schedule — no
clicking. SMTP accounts are a rotating pool with daily quotas.

## The two batches

| Batch       | Sends on days | Emails (touches)                         |
| ----------- | ------------- | ---------------------------------------- |
| **Batch 1** | 1, 3, 5, 7    | Invitation → Reminder → Early Bird → Final Call |
| **Batch 2** | 2, 4, 6       | Invitation → Reminder → Final Call       |

Both batches draw from one fixed template library (`lib/templates.ts`). Because
Batch 2 starts a day after Batch 1 and both step by 2 days, **only one batch
sends on any given day** — no conflicts. If two batches would ever land on the
same day, the new one's start auto-shifts forward until it doesn't.

**Mental model:** `Excel → pick batch → per-touch send dates → cron drains the due queue → Logs`

## Stack

- **Next.js 15** (App Router) — dashboard pages **and** API routes in one app
- **libSQL / Turso** — SQLite-compatible DB. Hosted Turso in production
  (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`); falls back to a local
  `data/app.sqlite` file when unset, so `dev` works offline.
- **Nodemailer** — sending over your SMTP accounts
- **Cron-driven sending** — an external pinger hits `/api/cron/tick` every few
  minutes; each ping claims and sends one small batch of due emails. Works on
  serverless (Vercel) with no background worker, Redis, or queue.

## Automatic sending (cron-job.org)

Vercel can't run long background jobs, so an external scheduler triggers each
day's send. The endpoint is idempotent (already-sent rows are skipped) and
secured by a secret.

1. Set **`CRON_SECRET`** to a long random string (in `.env.local` and in Vercel
   → Settings → Environment Variables). Generate one:
   ```powershell
   & "C:\Program Files\nodejs\node.exe" -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
   ```
2. Create a free job at **<https://cron-job.org>** (or UptimeRobot) that requests:
   ```
   https://<your-app>.vercel.app/api/cron/tick?key=YOUR_CRON_SECRET
   ```
   - **Schedule:** every **2–5 minutes** (so large lists drain steadily and stay
     under SMTP limits).
   - **Method:** GET (POST also works).
3. That's it. Each ping returns a small JSON summary
   (`{ claimed, sent, failed, remaining }`). When `remaining` hits 0 for the day,
   later pings are no-ops until the next batch comes due.

> `CRON_BATCH_SIZE` (default 50) controls how many emails go out per ping —
> keep it modest so each ping finishes inside the 60s function limit.

## Deploy to Vercel (with Turso)

1. **Create a Turso database** at <https://turso.tech>. Grab its **Database URL**
   (`libsql://<name>-<org>.turso.io`) and create an **auth token**.
2. **Import the repo into Vercel** (New Project → pick the GitHub repo).
3. In Vercel → **Settings → Environment Variables**, add (Production + Preview):
   - `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
   - `CRON_SECRET` (same value the pinger uses)
   - Optionally `SMTP1_*`…`SMTP5_*`, `MAIL_FROM_NAME`, `SEND_DELAY_MS`,
     `CRON_BATCH_SIZE`
4. **Deploy.** First request auto-creates/migrates the schema and seeds senders.
5. Point cron-job.org at `/api/cron/tick?key=…` (above).

## Setup

```powershell
Copy-Item .env.local.example .env.local   # then edit it
```

The `SMTP*` accounts are seeded into `smtp_accounts` the first time the DB is
created (only when the table is empty).

> ⚠️ This machine's global `npm`/`pnpm` shims are broken — invoke Next directly
> with Node, or use `.\dev.ps1`.

## Run

```powershell
.\dev.ps1
# or:
& "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev
```

Open http://localhost:3000. Production: `next build` then `next start`.

To trigger a send locally while developing:
```
http://localhost:3000/api/cron/tick?key=YOUR_CRON_SECRET
```

## How to use

1. **Upload** (`/upload`) — name it, pick the `.xlsx`/`.csv` (an `email` column,
   optional `name`), choose **Batch 1** or **Batch 2**, optionally set a start
   date. No templates to write — they're fixed.
2. **Campaign page** (`/campaigns/[id]`) — shows the schedule, what's been sent,
   and what's due next. Sending happens automatically; a **Send now** override is
   there if you want to push a specific email immediately.
3. **Tracking** (`/campaigns/[id]/tracking`) — every contact across each
   scheduled email with its send date.
4. **Logs / Database** — every send attempt with the SMTP used, status, errors.

## Data model

| Table             | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `campaigns`       | one per upload — `batch_type`, `start_date`, `auto_send`    |
| `contacts`        | one per email                                               |
| `campaign_stages` | **core** — one row per touch per contact, with `send_date`  |
| `email_templates` | per-campaign copy of the baked templates (keyed by touch)   |
| `email_logs`      | every send attempt                                          |
| `smtp_accounts`   | the rotating pool with `daily_limit` + daily usage          |

`campaign_stages.status` flows `pending → sending → sent` (or `failed`).
`sending` is a short-lived claim so two overlapping cron pings can't double-send.

## API

- `POST /api/upload` — multipart: `name`, `file`, `batch_type` (1|2), optional `start_date`
- `GET  /api/campaigns` — list with counts
- `GET  /api/campaigns/:id` — campaign + summaries + per-touch rows
- `GET  /api/cron/tick?key=CRON_SECRET` — **the auto-send heartbeat**; sends one due batch
- `POST /api/send-stage` — `{ campaign_id, stage }` manual override for one touch
- `GET  /api/logs/:id` — send log for a campaign

## SMTP pool logic & sender pinning

Each account has a daily limit (e.g. 5 accounts × 2,900). On a contact's **first**
email the scheduler picks the first account with quota; that account is then
**pinned to the contact** (`contacts.smtp_account_id`). **Every follow-up for
that contact is sent from the same account** — so a big list spreads across the
5 senders on day 1, and each recipient keeps hearing from one address. If a
contact's pinned sender is out of quota, that contact's follow-up simply waits
for the next tick/day (it is never sent from a different address).

## Reliability (retries, bounces, suppression)

- **Retry with backoff** — transient failures (4xx, timeouts, connection drops)
  are retried up to `MAX_SEND_ATTEMPTS` (default 3), waiting `RETRY_BACKOFF_MIN`
  minutes (default 30) between tries.
- **Permanent failures** — 5xx / bad-address errors are not retried; the row is
  marked `failed`.
- **Suppression** — a hard bounce cancels that contact's remaining touches
  (status `canceled`) so a dead address is never mailed again.
- **No double-send** — due rows are atomically claimed (`pending → sending`)
  before sending, so overlapping cron pings can't send the same email twice.
- **Retry failed** — the campaign page has a button to re-queue `failed` rows
  (`POST /api/campaigns/:id/retry`); `canceled` bounces are left alone.

Stage status: `pending → sending → sent` | `failed` | `canceled`.

## Tracking, suppression & replies

- **Open & click tracking** — every send gets a 1x1 open pixel and its links
  rewritten through `/api/track/click` (signed, so no open-redirect). Events land
  in `email_events`. Requires **`APP_URL`** set to your public https URL.
- **One-click unsubscribe** — every email carries a `List-Unsubscribe` header
  (+ RFC 8058 one-click) and a footer link to `/api/unsubscribe`. Opting out adds
  the address to the global `suppressions` table, marks the contact, and cancels
  remaining touches.
- **Global suppression** — the send path checks `suppressions` + the contact's
  `unsubscribed_at`/`replied_at` before every email, so a suppressed address is
  never mailed again, in this or any future campaign.
- **Reply detection (auto-stop)** — `/api/cron/poll-replies` scans each sender
  mailbox over IMAP; when a contact replies, their follow-ups are canceled and a
  `reply` event is logged. Point a **second** cron-job.org schedule (≈ every
  15 min) at:
  ```
  https://<your-app>/api/cron/poll-replies?key=CRON_SECRET
  ```
  Uses the SMTP account's own credentials; IMAP host defaults to the SMTP host
  with `smtp.`→`imap.` (override with `IMAP_HOST`).
- **Plain-text part** — every email is sent as multipart (text + HTML) for better
  inbox placement.
- **Deliverability dashboard** (`/deliverability`) — open/click/reply/unsub rates,
  per-campaign breakdown, and per-sender failure rates.
