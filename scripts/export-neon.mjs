// ---------------------------------------------------------------------------
// Dump every table out of the current database into scripts/dump/<table>.json.
//
//   node scripts/export-neon.mjs
//
// Reads DATABASE_URL (or SOURCE_DATABASE_URL). Paginates so a big table can't
// blow up memory or hit a statement timeout, and writes each table as soon as
// it's read, so a failure part-way still leaves you the tables it finished.
// ---------------------------------------------------------------------------
import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";

const URL_ = process.env.SOURCE_DATABASE_URL || process.env.DATABASE_URL;
if (!URL_) {
  console.error("Set SOURCE_DATABASE_URL (or DATABASE_URL) to the database you're copying FROM.");
  process.exit(1);
}

// Order matters on import: parents before children.
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
  "schema_version",
];

const PAGE = 5000;
const outDir = path.join(process.cwd(), "scripts", "dump");
fs.mkdirSync(outDir, { recursive: true });

const sql = neon(URL_);

for (const table of TABLES) {
  let rows = [];
  try {
    let offset = 0;
    for (;;) {
      const page = await sql.query(`SELECT * FROM ${table} ORDER BY 1 LIMIT $1 OFFSET $2`, [
        PAGE,
        offset,
      ]);
      rows.push(...page);
      if (page.length < PAGE) break;
      offset += PAGE;
      process.stdout.write(`  ${table}: ${rows.length}\r`);
    }
  } catch (err) {
    console.log(`- ${table}: SKIPPED (${String(err.message).slice(0, 70)})`);
    continue;
  }
  fs.writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows));
  console.log(`- ${table}: ${rows.length} rows`);
}

console.log(`\nDump written to ${outDir}`);
