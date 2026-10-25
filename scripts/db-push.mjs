// Applies supabase/migrations to the project in .env.local (SUPABASE_DB_URL).
// The URL is passed as an argument, never printed.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";
config({ path: ".env.local", quiet: true });
const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("SUPABASE_DB_URL is empty in .env.local"); process.exit(1); }
const r = spawnSync("npx", ["supabase", "db", "push", "--db-url", url, "--yes"], { encoding: "utf8" });
process.stdout.write((r.stdout + r.stderr).split(url).join("<db-url>"));
process.exit(r.status ?? 1);
