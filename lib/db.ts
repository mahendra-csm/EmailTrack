import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

// ---------------------------------------------------------------------------
// Singleton connection. Next.js dev mode hot-reloads modules, which would
// otherwise open a new SQLite handle on every change and leak file locks.
// Stash the handle on globalThis so it survives reloads.
// ---------------------------------------------------------------------------
const g = globalThis as unknown as { __db?: Database.Database };

function createDb(): Database.Database {
  // DATA_DIR lets a host point the SQLite file at a persistent, writable volume
  // (e.g. a Railway volume mounted at /data). Falls back to ./data locally.
  const dataDir = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, "app.sqlite"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS smtp_accounts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      host             TEXT    NOT NULL,
      port             INTEGER NOT NULL DEFAULT 465,
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
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      email       TEXT    NOT NULL,
      name        TEXT
    );

    CREATE TABLE IF NOT EXISTS campaign_stages (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      contact_id      INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
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
      campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      stage       INTEGER NOT NULL,
      subject     TEXT    NOT NULL,
      body        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stages_lookup
      ON campaign_stages(campaign_id, stage, status);
    CREATE INDEX IF NOT EXISTS idx_contacts_campaign
      ON contacts(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_logs_campaign
      ON email_logs(campaign_id, timestamp);
  `);

  seedSmtpFromEnv(db);
  return db;
}

// Seed / sync the SMTP pool from SMTP1_*..SMTPn_* env vars. Idempotent: new
// accounts are inserted, existing ones (matched by email) have their host /
// port / password / daily_limit refreshed, while the live usage counters
// (used_today_count, last_reset_date) are preserved. Runs on every startup.
function seedSmtpFromEnv(db: Database.Database) {
  const upsert = db.prepare(
    `INSERT INTO smtp_accounts (host, port, email, password, daily_limit)
     VALUES (@host, @port, @email, @password, @limit)
     ON CONFLICT(email) DO UPDATE SET
       host        = excluded.host,
       port        = excluded.port,
       password    = excluded.password,
       daily_limit = excluded.daily_limit`
  );

  for (let n = 1; n <= 20; n++) {
    const host = process.env[`SMTP${n}_HOST`];
    const email = process.env[`SMTP${n}_EMAIL`];
    const password = process.env[`SMTP${n}_PASSWORD`];
    if (!host || !email || !password) continue;
    const port = Number(process.env[`SMTP${n}_PORT`] ?? 587);
    const limit = Number(process.env[`SMTP${n}_LIMIT`] ?? 2900);
    upsert.run({ host, port, email, password, limit });
  }
}

export function getDb(): Database.Database {
  if (!g.__db) g.__db = createDb();
  return g.__db;
}
