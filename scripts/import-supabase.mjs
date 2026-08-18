// ---------------------------------------------------------------------------
// Load scripts/dump/*.json into a Postgres database (Supabase).
//
//   TARGET_DATABASE_URL="postgresql://...pooler.supabase.com:6543/postgres" \
//   node scripts/import-supabase.mjs
//
// Assumes the schema already exists — start the app once against the new
// database and lib/db.ts builds every table itself. Then run this.
//
// Safe to re-run: rows are inserted ON CONFLICT (id) DO NOTHING, and each
// table's id sequence is pushed past the imported ids at the end (the same
// id-reuse guard the app applies, so restored campaigns can never collide with
// old tracking events).
// ---------------------------------------------------------------------------
import postgres from "postgres";
import fs from "node:fs";
import path from "node:path";

const URL_ = process.env.TARGET_DATABASE_URL;
if (!URL_) {
  console.error("Set TARGET_DATABASE_URL to the Supabase transaction-pooler connection string.");
  process.exit(1);
}

const TABLES = [
  "smtp_accounts",
  "campaigns",
  "contacts",
  "campaign_stages",
  "email_templates",
  "email_logs",
  "email_events",
  "suppressions",
  "custom_templates",
  "reply_polls",
];

const dumpDir = path.join(process.cwd(), "scripts", "dump");
const sql = postgres(URL_, { prepare: false, max: 1, ssl: "require", onnotice: () => {} });
const CHUNK = 500;

try {
  for (const table of TABLES) {
    const file = path.join(dumpDir, `${table}.json`);
    if (!fs.existsSync(file)) {
      console.log(`- ${table}: no dump file, skipped`);
      continue;
    }
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    if (rows.length === 0) {
      console.log(`- ${table}: empty`);
      continue;
    }

    // smtp_accounts is special. Booting the app against an empty database seeds
    // the senders from env with fresh ids and DEFAULT limits, which would then
    // (a) make ON CONFLICT (id) DO NOTHING silently skip the real rows, keeping
    // the wrong daily/hourly caps, and (b) collide with UNIQUE(email) whenever
    // the source id differs, aborting the import. Contacts are pinned to sender
    // ids too (contacts.smtp_account_id), so the source ids MUST survive.
    // Clear the auto-seeded rows first and let the dump land verbatim.
    if (table === "smtp_accounts") {
      const emails = rows.map((r) => String(r.email).toLowerCase());
      const ids = rows.map((r) => r.id);
      await sql.unsafe(
        `DELETE FROM smtp_accounts WHERE lower(email) = ANY($1) OR id = ANY($2)`,
        [emails, ids]
      );
    }

    const cols = Object.keys(rows[0]);
    const quoted = cols.map((c) => `"${c}"`).join(", ");
    let done = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const params = [];
      const tuples = chunk.map(
        (r) => `(${cols.map((c) => `$${params.push(r[c] ?? null)}`).join(", ")})`
      );
      const conflict = cols.includes("id") ? "ON CONFLICT (id) DO NOTHING" : "ON CONFLICT DO NOTHING";
      await sql.unsafe(
        `INSERT INTO ${table} (${quoted}) VALUES ${tuples.join(", ")} ${conflict}`,
        params
      );
      done += chunk.length;
      process.stdout.write(`  ${table}: ${done}/${rows.length}\r`);
    }
    console.log(`- ${table}: ${done} rows imported     `);
  }

  // Push every sequence past the highest imported id, including ids that only
  // survive in email_events, so a new campaign can never inherit old stats.
  for (const [table, seq, alsoFrom] of [
    ["campaigns", "campaigns_id_seq", "SELECT COALESCE(MAX(campaign_id),0) FROM email_events"],
    ["contacts", "contacts_id_seq", "SELECT COALESCE(MAX(contact_id),0) FROM email_events"],
    ["campaign_stages", "campaign_stages_id_seq", null],
    ["email_logs", "email_logs_id_seq", null],
    ["email_events", "email_events_id_seq", null],
    ["email_templates", "email_templates_id_seq", null],
    ["suppressions", "suppressions_id_seq", null],
    ["smtp_accounts", "smtp_accounts_id_seq", null],
    ["custom_templates", "custom_templates_id_seq", null],
    ["reply_polls", "reply_polls_id_seq", null],
  ]) {
    const extra = alsoFrom ? `, (${alsoFrom})` : "";
    await sql.unsafe(
      `SELECT setval('${seq}', GREATEST((SELECT COALESCE(MAX(id),0) FROM ${table})${extra}, 1))`
    );
  }
  console.log("\nSequences advanced. Import complete.");

  for (const t of TABLES) {
    const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${t}`);
    console.log(`  ${t.padEnd(18)} ${count}`);
  }
} finally {
  await sql.end();
}
