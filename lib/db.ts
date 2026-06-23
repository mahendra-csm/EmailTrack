import { Pool, types } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Neon serverless Postgres. We keep the old libSQL-style interface (execute /
// batch returning { rows, rowsAffected }) so the rest of the app barely changes,
// and translate the few SQLite-isms (`?` placeholders and datetime/date('now'))
// to Postgres at the adapter boundary. Timestamps are stored as TEXT in the same
// "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DD" UTC format SQLite used, so all the
// string-based date handling in the app keeps working unchanged.
// ---------------------------------------------------------------------------

// Return bigint (COUNT/SUM) as a JS number instead of a string.
types.setTypeParser(20, (v: string) => parseInt(v, 10));

const g = globalThis as unknown as { __pool?: Pool; __init?: Promise<void> };

function pool(): Pool {
  if (!g.__pool) {
    const cs = process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL is not set (Neon Postgres connection string).");
    g.__pool = new Pool({ connectionString: cs });
  }
  return g.__pool;
}

/** Translate SQLite-flavoured SQL to Postgres. */
function toPg(sql: string): string {
  let i = 0;
  let out = sql.replace(/\?/g, () => `$${++i}`);
  // datetime('now','-5 minutes') — literal interval
  out = out.replace(
    /datetime\('now',\s*'([^']+)'\)/gi,
    (_m, intv) => `to_char((now() + interval '${intv}') at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`
  );
  // datetime('now', $n) — bind-param interval (after ?->$n above)
  out = out.replace(
    /datetime\('now',\s*(\$\d+)\)/gi,
    (_m, p) => `to_char((now() + (${p})::interval) at time zone 'utc', 'YYYY-MM-DD HH24:MI:SS')`
  );
  // datetime('now')
  out = out.replace(
    /datetime\('now'\)/gi,
    `to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')`
  );
  // date('now')
  out = out.replace(/date\('now'\)/gi, `to_char((now() at time zone 'utc'), 'YYYY-MM-DD')`);
  return out;
}

export interface DbResult {
  rows: Record<string, unknown>[];
  rowsAffected: number;
}
type Stmt = { sql: string; args?: unknown[] };

export interface Db {
  execute(q: Stmt | string): Promise<DbResult>;
  batch(stmts: Stmt[], mode?: string): Promise<void>;
}

function makeDb(): Db {
  const p = pool();
  return {
    async execute(q) {
      const sql = typeof q === "string" ? q : q.sql;
      const args = typeof q === "string" ? [] : q.args ?? [];
      const res = await p.query(toPg(sql), args as unknown[]);
      return { rows: res.rows as Record<string, unknown>[], rowsAffected: res.rowCount ?? 0 };
    },
    async batch(stmts) {
      const client = await p.connect();
      try {
        await client.query("BEGIN");
        for (const s of stmts) await client.query(toPg(s.sql), (s.args ?? []) as unknown[]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

const NOW_TS = "to_char((now() at time zone 'utc'), 'YYYY-MM-DD HH24:MI:SS')";

const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS smtp_accounts (
    id               SERIAL PRIMARY KEY,
    host             TEXT    NOT NULL,
    port             INTEGER NOT NULL DEFAULT 587,
    email            TEXT    NOT NULL UNIQUE,
    password         TEXT    NOT NULL,
    daily_limit      INTEGER NOT NULL DEFAULT 2900,
    used_today_count INTEGER NOT NULL DEFAULT 0,
    last_reset_date  TEXT,
    hourly_limit     INTEGER NOT NULL DEFAULT 100,
    used_hour_count  INTEGER NOT NULL DEFAULT 0,
    hour_reset_at    TEXT,
    in_pool          INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id              SERIAL PRIMARY KEY,
    name            TEXT    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT ${NOW_TS},
    smtp_account_id INTEGER,
    status          TEXT    NOT NULL DEFAULT 'active',
    batch_type      INTEGER NOT NULL DEFAULT 1,
    start_date      TEXT,
    auto_send       INTEGER NOT NULL DEFAULT 1,
    country         TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS contacts (
    id              SERIAL PRIMARY KEY,
    campaign_id     INTEGER NOT NULL,
    email           TEXT    NOT NULL,
    name            TEXT,
    smtp_account_id INTEGER,
    coupon          TEXT,
    unsubscribed_at TEXT,
    replied_at      TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS campaign_stages (
    id              SERIAL PRIMARY KEY,
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
  )`,
  `CREATE TABLE IF NOT EXISTS email_logs (
    id            SERIAL PRIMARY KEY,
    campaign_id   INTEGER NOT NULL,
    contact_id    INTEGER NOT NULL,
    stage         INTEGER NOT NULL,
    smtp_used     TEXT,
    status        TEXT    NOT NULL,
    error_message TEXT,
    timestamp     TEXT    NOT NULL DEFAULT ${NOW_TS}
  )`,
  `CREATE TABLE IF NOT EXISTS email_templates (
    id          SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    stage       INTEGER NOT NULL,
    subject     TEXT    NOT NULL,
    body        TEXT    NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS suppressions (
    id          SERIAL PRIMARY KEY,
    email       TEXT    NOT NULL UNIQUE,
    reason      TEXT,
    campaign_id INTEGER,
    created_at  TEXT    NOT NULL DEFAULT ${NOW_TS}
  )`,
  `CREATE TABLE IF NOT EXISTS email_events (
    id          SERIAL PRIMARY KEY,
    type        TEXT    NOT NULL,
    campaign_id INTEGER,
    contact_id  INTEGER,
    stage       INTEGER,
    url         TEXT,
    meta        TEXT,
    created_at  TEXT    NOT NULL DEFAULT ${NOW_TS}
  )`,
  `CREATE INDEX IF NOT EXISTS idx_stages_lookup ON campaign_stages(campaign_id, stage, status)`,
  `CREATE INDEX IF NOT EXISTS idx_stages_due ON campaign_stages(status, send_date)`,
  `CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign_id)`,
  `CREATE INDEX IF NOT EXISTS idx_logs_campaign ON email_logs(campaign_id, id)`,
  `CREATE INDEX IF NOT EXISTS idx_events_campaign ON email_events(campaign_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_events_contact ON email_events(contact_id, type)`,
];

async function seedSmtpFromEnv(c: Db): Promise<void> {
  for (let n = 1; n <= 20; n++) {
    const host = process.env[`SMTP${n}_HOST`];
    const email = process.env[`SMTP${n}_EMAIL`];
    const password = process.env[`SMTP${n}_PASSWORD`];
    if (!host || !email || !password) continue;
    const port = Number(process.env[`SMTP${n}_PORT`] ?? 587);
    const limit = Number(process.env[`SMTP${n}_LIMIT`] ?? 2900);
    const hourly = Number(process.env[`SMTP${n}_HOURLY_LIMIT`] ?? process.env.SMTP_HOURLY_LIMIT ?? 100);
    // Limits set only on first insert; on conflict refresh creds only (never
    // clobber tuned daily_limit/hourly_limit).
    await c.execute({
      sql: `INSERT INTO smtp_accounts (host, port, email, password, daily_limit, hourly_limit)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (email) DO UPDATE SET
              host = EXCLUDED.host, port = EXCLUDED.port, password = EXCLUDED.password`,
      args: [host, port, email, password, limit, hourly],
    });
  }
}

async function init(): Promise<void> {
  const p = pool();
  for (const stmt of SCHEMA) await p.query(stmt);
  await seedSmtpFromEnv(makeDb());
}

/** Ensure schema + seed have run (once per warm instance), then return the db. */
export async function db(): Promise<Db> {
  if (!g.__init) g.__init = init();
  await g.__init;
  return makeDb();
}
