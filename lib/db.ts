import { createClient, type Client } from "@libsql/client";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// libSQL client. On Vercel we talk to a hosted Turso database over HTTPS
// (TURSO_DATABASE_URL + TURSO_AUTH_TOKEN). With no env set we fall back to a
// local SQLite file so `pnpm dev` works offline. Either way the SQL is the
// same — Turso *is* SQLite. The handle is cached on globalThis so Next.js dev
// hot-reload and warm serverless invocations reuse one connection.
// ---------------------------------------------------------------------------
const g = globalThis as unknown as { __client?: Client; __init?: Promise<void> };

function buildClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  // Local fallback: a file under DATA_DIR (or ./data).
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.join(dataDir, "app.sqlite")}` });
}

function client(): Client {
  if (!g.__client) g.__client = buildClient();
  return g.__client;
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS smtp_accounts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    host             TEXT    NOT NULL,
    port             INTEGER NOT NULL DEFAULT 587,
    email            TEXT    NOT NULL UNIQUE,
    password         TEXT    NOT NULL,
    daily_limit      INTEGER NOT NULL DEFAULT 2900,
    used_today_count INTEGER NOT NULL DEFAULT 0,
    last_reset_date  TEXT
  );
  CREATE TABLE IF NOT EXISTS campaigns (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    smtp_account_id INTEGER,
    status          TEXT    NOT NULL DEFAULT 'active',
    batch_type      INTEGER NOT NULL DEFAULT 1,
    start_date      TEXT,
    auto_send       INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     INTEGER NOT NULL,
    email           TEXT    NOT NULL,
    name            TEXT,
    smtp_account_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS campaign_stages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     INTEGER NOT NULL,
    contact_id      INTEGER NOT NULL,
    stage           INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    scheduled_label TEXT    NOT NULL,
    send_date       TEXT,
    claimed_at      TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    next_attempt_at TEXT,
    sent_at         TEXT
  );
  CREATE TABLE IF NOT EXISTS email_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id   INTEGER NOT NULL,
    contact_id    INTEGER NOT NULL,
    stage         INTEGER NOT NULL,
    smtp_used     TEXT,
    status        TEXT    NOT NULL,
    error_message TEXT,
    timestamp     TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS email_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    stage       INTEGER NOT NULL,
    subject     TEXT    NOT NULL,
    body        TEXT    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS suppressions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE,
    reason      TEXT,
    campaign_id INTEGER,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS email_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT    NOT NULL,
    campaign_id INTEGER,
    contact_id  INTEGER,
    stage       INTEGER,
    url         TEXT,
    meta        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_stages_lookup ON campaign_stages(campaign_id, stage, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_logs_campaign ON email_logs(campaign_id, id);
  CREATE INDEX IF NOT EXISTS idx_events_campaign ON email_events(campaign_id, type);
  CREATE INDEX IF NOT EXISTS idx_events_contact ON email_events(contact_id, type);
`;

// Bring an older database (pre-batch-scheduler) up to the current schema by
// adding any missing columns. SQLite ALTER TABLE ADD COLUMN is a no-op-safe way
// to migrate; we guard each on the live column list so re-runs are harmless.
async function migrate(c: Client): Promise<void> {
  const columns = async (table: string): Promise<string[]> => {
    const res = await c.execute(`PRAGMA table_info(${table})`);
    return (res.rows as unknown as { name: string }[]).map((r) => r.name);
  };
  const add = async (table: string, have: string[], col: string, ddl: string) => {
    if (!have.includes(col)) await c.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  };

  const camp = await columns("campaigns");
  await add("campaigns", camp, "batch_type", "batch_type INTEGER NOT NULL DEFAULT 1");
  await add("campaigns", camp, "start_date", "start_date TEXT");
  await add("campaigns", camp, "auto_send", "auto_send INTEGER NOT NULL DEFAULT 1");

  const ct = await columns("contacts");
  await add("contacts", ct, "smtp_account_id", "smtp_account_id INTEGER");
  await add("contacts", ct, "unsubscribed_at", "unsubscribed_at TEXT");
  await add("contacts", ct, "replied_at", "replied_at TEXT");

  const sm = await columns("smtp_accounts");
  await add("smtp_accounts", sm, "last_reply_poll", "last_reply_poll TEXT");

  const st = await columns("campaign_stages");
  await add("campaign_stages", st, "send_date", "send_date TEXT");
  await add("campaign_stages", st, "claimed_at", "claimed_at TEXT");
  await add("campaign_stages", st, "attempts", "attempts INTEGER NOT NULL DEFAULT 0");
  await add("campaign_stages", st, "last_error", "last_error TEXT");
  await add("campaign_stages", st, "next_attempt_at", "next_attempt_at TEXT");

  // Created here (not in SCHEMA) so it runs only after send_date is guaranteed
  // to exist on databases that pre-date the scheduler.
  await c.execute("CREATE INDEX IF NOT EXISTS idx_stages_due ON campaign_stages(status, send_date)");
}

async function seedSmtpFromEnv(c: Client): Promise<void> {
  for (let n = 1; n <= 20; n++) {
    const host = process.env[`SMTP${n}_HOST`];
    const email = process.env[`SMTP${n}_EMAIL`];
    const password = process.env[`SMTP${n}_PASSWORD`];
    if (!host || !email || !password) continue;
    const port = Number(process.env[`SMTP${n}_PORT`] ?? 587);
    const limit = Number(process.env[`SMTP${n}_LIMIT`] ?? 2900);
    await c.execute({
      sql: `INSERT INTO smtp_accounts (host, port, email, password, daily_limit)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
              host = excluded.host, port = excluded.port,
              password = excluded.password, daily_limit = excluded.daily_limit`,
      args: [host, port, email, password, limit],
    });
  }
}

async function init(): Promise<void> {
  const c = client();
  await c.executeMultiple(SCHEMA);
  await migrate(c);
  await seedSmtpFromEnv(c);
}

/** Ensure schema + seed have run (once per warm instance), then return client. */
export async function db(): Promise<Client> {
  if (!g.__init) g.__init = init();
  await g.__init;
  return client();
}
