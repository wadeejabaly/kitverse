#!/usr/bin/env node
/**
 * KitVerse preflight — the project's own rules, enforced as code.
 * Run: `npm run preflight` (per-check ✓/✗; exits non-zero on any failure).
 *
 * Checks: leftover placeholder markers · hardcoded absolute domains outside
 * getSiteUrl() · physical-direction Tailwind classes (the #1 RTL bug source) ·
 * the mandatory /privacy + /terms routes · PAYPAL_ENV and PAYPLUS_ENV declared
 * in .env.example.
 *
 * `--template` relaxes the placeholder-marker check. Nothing in this project
 * should need it; it exists only for scratch experiments.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const args = process.argv.slice(2);

const templateMode = args.includes("--template");

let failed = false;
const pass = (msg) => console.log(`✓ ${msg}`);
const fail = (msg) => {
  console.log(`✗ ${msg}`);
  failed = true;
};

/** Recursively collect files under dir, skipping build output. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "out"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Strip comments, preserving line numbers (markers in comments are fine). */
function stripComments(content, file) {
  if (file.endsWith(".json")) return content; // JSON has no comments
  let out = content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""));
  if (!file.endsWith(".css")) {
    // Line comments — but never the `//` inside a URL (preceded by `:`).
    out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  }
  return out;
}

const srcDir = join(root, "src");
const scanned = (existsSync(srcDir) ? walk(srcDir) : [])
  .filter((f) => /\.(ts|tsx|css|json|mjs)$/.test(f));
if (existsSync(join(root, "next.config.ts"))) scanned.push(join(root, "next.config.ts"));

const rel = (f) => relative(root, f);

/** Report violating file:line pairs for a per-line predicate. */
function findViolations(files, predicate) {
  const hits = [];
  for (const file of files) {
    const stripped = stripComments(readFileSync(file, "utf8"), file);
    stripped.split("\n").forEach((line, i) => {
      if (predicate(line, file)) hits.push(`${rel(file)}:${i + 1}`);
    });
  }
  return hits;
}

// --- (a) No brand/placeholder markers outside comments -----------------------
const MARKER_RE = /REPLACE-PER-BRAND|\[PLACEHOLDER\]/;
if (templateMode) {
  pass("placeholder markers allowed (template mode)");
} else {
  const hits = findViolations(scanned, (line) => MARKER_RE.test(line));
  hits.length
    ? fail(`unreplaced REPLACE-PER-BRAND/[PLACEHOLDER] markers: ${hits.join(", ")}`)
    : pass("no unreplaced brand markers");
}

// --- (b) No hardcoded absolute domains outside getSiteUrl/allowlist ----------
// src/lib/site.ts is the ONE place absolute URLs are assembled. Everything
// else derives from getSiteUrl(), so a wrong domain can never reach production.
// schema.org is a vocabulary namespace, not a deployment domain: JSON-LD
// @context/@type/availability values are fixed identifiers defined by the
// standard, and rewriting them through getSiteUrl() would emit invalid
// structured data. The rule this check exists for — "the site's own domain
// lives in exactly one place" — is unaffected.
//
// Three integration files additionally carry a third party's FIXED API
// endpoints. Those hosts belong to the provider, not to this store, so they
// cannot derive from getSiteUrl() and are not a deployment domain that could
// go stale. Each file is allowed only its own named hosts and nothing else,
// so the rule this check exists for — the site's own domain lives in exactly
// one place — is untouched.
// www.w3.org is the same category as schema.org: an XML namespace identifier,
// not a host anything is fetched from. An inline SVG in a CSS data: URI is
// parsed as a standalone document and does not render at all without
// xmlns="http://www.w3.org/2000/svg" — the string is part of the format, it is
// fixed by the spec, and no request is ever made to it. The rule this check
// exists for — the site's own domain lives in exactly one place — is untouched.
const ALLOWED_HOSTS = new Set(["localhost", "schema.org", "www.w3.org"]);
const FILE_HOST_ALLOWLIST = new Map([
  // null = the one file that assembles this site's own absolute URLs.
  [join("src", "lib", "site.ts"), null],
  [
    join("src", "lib", "paypal.ts"),
    new Set(["api-m.paypal.com", "api-m.sandbox.paypal.com"]),
  ],
  [
    join("src", "lib", "payplus.ts"),
    new Set(["restapi.payplus.co.il", "restapidev.payplus.co.il"]),
  ],
  [join("src", "lib", "notify.ts"), new Set(["api.resend.com"])],
]);
const URL_RE = /https?:\/\/([a-zA-Z0-9.-]+)/g;
{
  const hits = [];
  for (const file of scanned) {
    const name = rel(file);
    const hasEntry = FILE_HOST_ALLOWLIST.has(name);
    const fileHosts = hasEntry ? FILE_HOST_ALLOWLIST.get(name) : undefined;
    if (hasEntry && fileHosts === null) continue;
    const stripped = stripComments(readFileSync(file, "utf8"), file);
    stripped.split("\n").forEach((line, i) => {
      for (const match of line.matchAll(URL_RE)) {
        if (ALLOWED_HOSTS.has(match[1])) continue;
        if (fileHosts && fileHosts.has(match[1])) continue;
        hits.push(`${name}:${i + 1} (${match[1]})`);
      }
    });
  }
  hits.length
    ? fail(`hardcoded absolute URLs outside getSiteUrl()/allowlist: ${hits.join(", ")}`)
    : pass("no hardcoded domains — absolute URLs derive from getSiteUrl()");
}

// --- (c) Logical Tailwind properties only (the #1 RTL bug source) ------------
const PHYSICAL_RE = /(^|[^a-zA-Z0-9-])(ml-|mr-|pl-|pr-|text-left([^a-z-]|$)|text-right([^a-z-]|$))/;
{
  const codeFiles = scanned.filter((f) => /\.(ts|tsx|css)$/.test(f));
  const hits = findViolations(codeFiles, (line) => PHYSICAL_RE.test(line));
  hits.length
    ? fail(`physical-direction Tailwind classes (use ms-/me-/ps-/pe-/text-start/text-end): ${hits.join(", ")}`)
    : pass("logical properties only (no ml-/mr-/pl-/pr-/text-left/text-right)");
}

// --- (d) Mandatory legal routes exist ----------------------------------------
// A store may not launch without a published privacy policy and terms.
for (const route of ["privacy", "terms"]) {
  const multilingual = join(root, "src", "app", "[locale]", route, "page.tsx");
  const single = join(root, "src", "app", route, "page.tsx");
  existsSync(multilingual) || existsSync(single)
    ? pass(`/${route} route exists`)
    : fail(`missing mandatory /${route} route — the pre-launch gate blocks without it`);
}

// --- (e) Processor environment flags declared --------------------------------
// This build has no TEST_MODE flag. PAYPAL_ENV and PAYPLUS_ENV are the two
// switches that decide whether real money moves, so each must be an explicit,
// documented variable. Both default to sandbox in code; only the exact string
// "live" flips one over.
{
  const envExample = join(root, ".env.example");
  const contents = existsSync(envExample) ? readFileSync(envExample, "utf8") : "";
  for (const name of ["PAYPAL_ENV", "PAYPLUS_ENV"]) {
    new RegExp(`^${name}=`, "m").test(contents)
      ? pass(`${name} declared in .env.example — REMINDER: ${name}=live only in Production`)
      : fail(`${name} missing from .env.example — checkout must never guess sandbox vs live`);
  }
}

console.log("");
if (failed) {
  console.log("PREFLIGHT FAILED");
  process.exit(1);
}
console.log(templateMode ? "Preflight clean (template mode)." : "Preflight clean.");
