# EmailTrackingOne

Manual, multi-stage email campaign dashboard. Upload an Excel/CSV list, and the
system creates **3 stages per contact** (Day 1, Day 5, Day 10). You send each
stage by hand from the campaign page. SMTP accounts are treated as a rotating
pool with daily quotas.

**Mental model:** `Excel → Database → Stage buckets → Manual send buttons → Logs`
(no automatic scheduler).

## Stack

- **Next.js 15** (App Router) — dashboard pages **and** API routes in one app
- **SQLite** via `better-sqlite3` — single file at `data/app.sqlite`, created on first run
- **Nodemailer** — sending over your SMTP accounts
- **In-process job worker** — `Send` starts a background batch; the UI polls for
  progress. No Redis/BullMQ needed.

## Setup

1. Copy the env template and fill in your real SMTP credentials:

   ```powershell
   Copy-Item .env.local.example .env.local
   # then edit .env.local
   ```

   The two `SMTP1_*` / `SMTP2_*` accounts are seeded into the `smtp_accounts`
   table the first time the DB is created (only when the table is empty).

2. Dependencies are already installed (`node_modules/`). If you ever need to
   reinstall, see the note below — `npm`/`pnpm` shims are currently broken on
   this machine, so use `corepack pnpm`.

## Run

> ⚠️ This machine's global `npm` and `pnpm` commands are broken (their
> `node_modules` got wiped). Invoke Next directly with Node, or use the helper
> script:

```powershell
# Dev server (hot reload)
.\dev.ps1
# or directly:
& "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev
```

Then open http://localhost:3000.

Production build + start:

```powershell
& "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" build
& "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start
```

## How to use

1. **Upload** — go to `/upload`, name the campaign, pick an `.xlsx`/`.csv` with
   an `email` column (optional `name`), and tweak the three stage email
   templates. Placeholders: `{{name}}`, `{{email}}`.
2. **Campaign page** (`/campaigns/[id]`) — the control center. Summary cards per
   stage, plus a table for Day 1 / Day 5 / Day 10 each with a **Send** button.
3. **Send a stage** — click `Send Day 1`. A background job sends every pending
   contact in that stage via the SMTP pool, marks them `sent`, and logs each
   send. The page polls live.
4. **Logs** (`/campaigns/[id]/logs`) — every send attempt with SMTP used,
   status, and any error.

## Data model

| Table             | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `campaigns`       | one per upload                                     |
| `contacts`        | one per email                                      |
| `campaign_stages` | **core** — 3 rows per contact (stage 1/5/10)       |
| `email_templates` | per-campaign, per-stage subject + body             |
| `email_logs`      | every send attempt                                 |
| `smtp_accounts`   | the rotating pool with `daily_limit` + daily usage |

## API

- `POST /api/upload` — multipart: `name`, `file`, optional `subject_{1,5,10}` / `body_{1,5,10}`
- `GET  /api/campaigns` — list with counts
- `GET  /api/campaigns/:id` — summaries + per-stage rows + active job
- `POST /api/send-stage` — body `{ campaign_id, stage }`, starts the worker
- `GET  /api/logs/:id` — send log for a campaign

## SMTP pool logic

On each send the worker picks the first account whose `used_today_count <
daily_limit`, rotating to the next when one fills up. Counters auto-reset when
the date rolls over. If every account is exhausted, the remaining contacts stay
`pending` and the run stops cleanly — click Send again tomorrow.
