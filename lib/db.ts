import { Pool, neon, neonConfig, types } from "@neondatabase/serverless";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import postgres from "postgres";

// Run queries over HTTP fetch instead of WebSockets. Short-lived serverless
// functions (Vercel) can't reliably complete the WS wake-handshake against a
// cold Neon compute, which surfaces as an opaque `ErrorEvent { type: 'error' }`.
// HTTP is stateless, wakes the compute reliably, and needs no WS setup.
neonConfig.poolQueryViaFetch = true;

// ---------------------------------------------------------------------------
// Postgres access layer. We keep the old libSQL-style interface (execute /
// batch returning { rows, rowsAffected }) so the rest of the app barely changes,
// and translate the few SQLite-isms (`?` placeholders and datetime/date('now'))
// to Postgres at the adapter boundary. Timestamps are stored as TEXT in the same
// "YYYY-MM-DD HH:MM:SS" / "YYYY-MM-DD" UTC format SQLite used, so all the
// string-based date handling in the app keeps working unchanged.
//
// TWO BACKENDS, chosen automatically from DATABASE_URL:
//   • Neon      — its own serverless driver (HTTP/WS to Neon's proxy).
//   • Anything else (Supabase, plain Postgres) — postgres.js over TCP.
// Switching hosts is therefore only a DATABASE_URL change, and switching back
// is just as quick if a migration goes wrong.
//
// SUPABASE NOTE: use the **transaction pooler** URL (port 6543, host
// aws-*.pooler.supabase.com), not the direct 5432 one. Serverless functions open
// a connection per invocation and would exhaust the direct-connection limit.
// Prepared statements are disabled below because the transaction pooler can't
// support them.
// ---------------------------------------------------------------------------

// Return bigint (COUNT/SUM) as a JS number instead of a string.
types.setTypeParser(20, (v: string) => parseInt(v, 10));

type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as {
  __pool?: Pool;
  __http?: NeonQueryFunction<false, false>;
  __pg?: Sql;
  __init?: Promise<void>;
};

function connString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // Deliberately fatal rather than falling back to a hardcoded database.
    // A silent fallback is dangerous during a host migration: one missing env
    // var and the app quietly keeps writing to the OLD database while you think
    // you have cut over, splitting your data across two of them.
    throw new Error(
      "DATABASE_URL is not set. Point it at your Postgres (Supabase: use the " +
        "transaction pooler URL on port 6543)."
    );
  }
  return url;
}

/** Neon's driver only speaks to Neon; everything else goes through postgres.js. */
function isNeon(): boolean {
  return /\.neon\.tech(?::|\/|$)/i.test(connString());
}

function pool(): Pool {
  if (!g.__pool) g.__pool = new Pool({ connectionString: connString() });
  return g.__pool;
}

/** HTTP (fetch) client — used for transactions so batch() needs no WebSocket. */
function http(): NeonQueryFunction<false, false> {
  if (!g.__http) g.__http = neon(connString());
  return g.__http;
}

/** postgres.js client for Supabase / any standard Postgres. */
function pg(): Sql {
  if (!g.__pg) {
    g.__pg = postgres(connString(), {
      // The Supabase transaction pooler multiplexes connections, so a session
      // can't hold prepared statements.
      prepare: false,
      // COUNT()/SUM() come back as int8. postgres.js hands those over as
      // strings by default, which would silently turn every stat in the
      // dashboard into string maths - parse them to numbers, matching the
      // types.setTypeParser(20, ...) already applied on the Neon path.
      types: {
        int8: {
          to: 20,
          from: [20],
          serialize: (v: number | string) => String(v),
          parse: (v: string) => parseInt(v, 10),
        },
      },
      // Serverless invocations are short-lived; a big pool per instance just
      // wastes the project's connection budget.
      max: Number(process.env.PG_POOL_MAX ?? 3),
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: "require",
      onnotice: () => {},
    });
  }
  return g.__pg;
}

/** One statement, whichever backend is configured. */
async function runOne(sql: string, args: unknown[]): Promise<DbResult> {
  if (isNeon()) {
    const res = await pool().query(sql, args);
    return { rows: res.rows as Record<string, unknown>[], rowsAffected: res.rowCount ?? 0 };
  }
  const res = await pg().unsafe(sql, args as never[]);
  const rows = res as unknown as Record<string, unknown>[];
  return { rows, rowsAffected: res.count ?? rows.length };
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
  return {
    async execute(q) {
      const sql = typeof q === "string" ? q : q.sql;
      const args = typeof q === "string" ? [] : q.args ?? [];
      return runOne(toPg(sql), args as unknown[]);
    },
    async batch(stmts) {
      if (isNeon()) {
        // Run as a single atomic transaction over HTTP (no WebSocket/session).
        const sql = http();
        await sql.transaction(
          stmts.map((s) => sql.query(toPg(s.sql), (s.args ?? []) as unknown[]))
        );
        return;
      }
      // postgres.js: one real transaction, so a half-written upload rolls back.
      await pg().begin(async (tx) => {
        for (const s of stmts) {
          await tx.unsafe(toPg(s.sql), (s.args ?? []) as never[]);
        }
      });
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
    bot         INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT ${NOW_TS}
  )`,
  // The IMAP poller stamps this after each successful mailbox scan so the next
  // run only looks at new mail. It was missing from the original CREATE TABLE,
  // which made every reply/bounce poll fail on "column does not exist".
  `ALTER TABLE smtp_accounts ADD COLUMN IF NOT EXISTS last_reply_poll TEXT`,
  // Migrations for DBs created before these columns existed (idempotent).
  `ALTER TABLE email_events ADD COLUMN IF NOT EXISTS bot INTEGER NOT NULL DEFAULT 0`,
  // Why a hit was flagged as machine traffic (prefetch / privacy-proxy /
  // scanner-ua / no-ua), plus the raw signals behind the call.
  `ALTER TABLE email_events ADD COLUMN IF NOT EXISTS bot_reason TEXT`,
  `ALTER TABLE email_events ADD COLUMN IF NOT EXISTS ip TEXT`,
  `ALTER TABLE email_events ADD COLUMN IF NOT EXISTS ms_since_send BIGINT`,
  // Custom-mail campaigns: how many recipients were queued and how fast to send.
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS send_limit INTEGER`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS concurrency INTEGER`,
  `ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delay_ms INTEGER`,
  // Reusable custom-mail templates. Every custom mail that goes out is saved
  // here (keyed by a fingerprint of subject+body so re-sending the same content
  // just bumps the counter instead of piling up duplicates), so the next send is
  // "pick a template" rather than "paste the HTML again".
  `CREATE TABLE IF NOT EXISTS custom_templates (
    id           SERIAL PRIMARY KEY,
    name         TEXT    NOT NULL,
    subject      TEXT    NOT NULL,
    body         TEXT    NOT NULL,
    fingerprint  TEXT    NOT NULL UNIQUE,
    created_at   TEXT    NOT NULL DEFAULT ${NOW_TS},
    last_used_at TEXT,
    use_count    INTEGER NOT NULL DEFAULT 0
  )`,
  // Reply/bounce mailbox polling history, so the dashboard can show whether the
  // IMAP poll is actually running and what it saw (or why it failed).
  `CREATE TABLE IF NOT EXISTS reply_polls (
    id         SERIAL PRIMARY KEY,
    ran_at     TEXT    NOT NULL DEFAULT ${NOW_TS},
    source     TEXT,
    accounts   INTEGER NOT NULL DEFAULT 0,
    scanned    INTEGER NOT NULL DEFAULT 0,
    replies    INTEGER NOT NULL DEFAULT 0,
    bounces    INTEGER NOT NULL DEFAULT 0,
    errors     TEXT
  )`,
  // ID-REUSE GUARD. Deleting a campaign removes its events, but tracking pixels
  // in mail already delivered keep firing for days afterwards and insert fresh
  // rows for that dead id. If the id sequence is ever behind those ids (it was —
  // the sequence sat at 13 while events referenced campaigns up to 17, a
  // leftover of the Turso->Neon migration inserting rows with explicit ids), a
  // NEW campaign is handed an id that old events already point at and is born
  // showing someone else's opens and clicks. Pushing both sequences past
  // anything ever referenced makes that impossible. Cheap and idempotent.
  `SELECT setval('campaigns_id_seq', GREATEST(
     (SELECT COALESCE(MAX(id), 0) FROM campaigns),
     (SELECT COALESCE(MAX(campaign_id), 0) FROM email_events), 1))`,
  `SELECT setval('contacts_id_seq', GREATEST(
     (SELECT COALESCE(MAX(id), 0) FROM contacts),
     (SELECT COALESCE(MAX(contact_id), 0) FROM email_events), 1))`,
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

// Bump this whenever SCHEMA changes; that's what makes the migrations re-run
// (and re-seeds SMTP accounts from env). Leaving it alone is what keeps cold
// starts cheap.
const SCHEMA_VERSION = 4;

async function init(): Promise<void> {
  // COMPUTE COST: a serverless app cold-starts constantly and Neon bills by
  // compute time, so replaying ~40 DDL statements plus the SMTP seed on every
  // single cold start was a real chunk of the monthly quota. One cheap lookup
  // tells us the database is already at this version, and we skip all of it.
  try {
    const cur = await runOne("SELECT 1 FROM schema_version WHERE version >= $1 LIMIT 1", [
      SCHEMA_VERSION,
    ]);
    if (cur.rows.length > 0) return;
  } catch {
    // No schema_version table yet - this is a first boot, fall through. On a
    // brand-new (e.g. freshly created Supabase) database this is what builds
    // every table from scratch.
  }

  for (const stmt of SCHEMA) await runOne(stmt, []);
  await seedSmtpFromEnv(makeDb());
  await runOne("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)", []);
  await runOne("INSERT INTO schema_version (version) VALUES ($1) ON CONFLICT DO NOTHING", [
    SCHEMA_VERSION,
  ]);
}

/** Ensure schema + seed have run (once per warm instance), then return the db. */
export async function db(): Promise<Db> {
  if (!g.__init) g.__init = init();
  await g.__init;
  return makeDb();
}
