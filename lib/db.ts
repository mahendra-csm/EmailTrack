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
    status          TEXT    NOT NULL DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    email       TEXT    NOT NULL,
    name        TEXT
  );
  CREATE TABLE IF NOT EXISTS campaign_stages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id     INTEGER NOT NULL,
    contact_id      INTEGER NOT NULL,
    stage           INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'pending',
    scheduled_label TEXT    NOT NULL,
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
  CREATE TABLE IF NOT EXISTS send_jobs (
    campaign_id     INTEGER NOT NULL,
    stage           INTEGER NOT NULL,
    smtp_account_id INTEGER NOT NULL,
    status          TEXT    NOT NULL DEFAULT 'running',
    sent            INTEGER NOT NULL DEFAULT 0,
    failed          INTEGER NOT NULL DEFAULT 0,
    message         TEXT,
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (campaign_id, stage)
  );
  CREATE INDEX IF NOT EXISTS idx_stages_lookup ON campaign_stages(campaign_id, stage, status);
  CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_logs_campaign ON email_logs(campaign_id, id);
`;

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
  await seedSmtpFromEnv(c);
}

/** Ensure schema + seed have run (once per warm instance), then return client. */
export async function db(): Promise<Client> {
  if (!g.__init) g.__init = init();
  await g.__init;
  return client();
}
