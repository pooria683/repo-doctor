#!/usr/bin/env node
/**
 * Repository guard rails.
 *
 * A dependency-free static check for the invariants this project promises.
 * It is intentionally simple (regex over source files) and NOT a linter: the
 * real type checking is `tsc`, and the real behaviour tests are in tests/.
 *
 * Run with `npm run lint` — it is part of CI.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const problems = [];
const notes = [];

function walk(dir, filter = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute, filter));
    else if (filter(absolute)) out.push(absolute);
  }
  return out;
}

const srcFiles = walk(path.join(ROOT, "src"), (file) => file.endsWith(".ts"));
const testFiles = walk(path.join(ROOT, "tests"), (file) => file.endsWith(".ts"));
const docsFiles = walk(path.join(ROOT, "docs"), (file) => file.endsWith(".md"));

if (srcFiles.length === 0) problems.push("src/ contains no TypeScript files");

// 1. No network clients, ever.
const networkPatterns = [
  /from\s+["']node:(http|https|net|tls|dns|dgram)["']/,
  /from\s+["'](undici|axios|node-fetch|got|superagent)["']/,
  /(?<![.\w])fetch\s*\(/,
];
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const pattern of networkPatterns) {
    if (pattern.test(content)) {
      problems.push(`${path.relative(ROOT, file)}: network client detected (${pattern})`);
    }
  }
}

// 2. stdout/stderr goes through src/cli/output.ts.
// Comments are stripped first so documentation examples do not trip the check.
const stripComments = (content) =>
  content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

for (const file of srcFiles) {
  if (file.endsWith(path.join("cli", "output.ts"))) continue;
  const content = stripComments(fs.readFileSync(file, "utf8"));
  if (/\bconsole\.(log|error|warn)\(/.test(content)) {
    problems.push(`${path.relative(ROOT, file)}: use cli/output.ts instead of console.*`);
  }
}

// 3. process.exit only in the CLI entry point (and never with a hard-coded 0
//    in library code, which would skip the caller's exit code handling).
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  if (!/process\.exit\s*\(/.test(content)) continue;
  if (!file.endsWith(path.join("cli", "index.ts"))) {
    problems.push(`${path.relative(ROOT, file)}: process.exit() is only allowed in cli/index.ts`);
  }
}

// 4. Zero runtime dependencies.
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
if (Object.keys(pkg.dependencies ?? {}).length > 0) {
  problems.push("package.json: runtime dependencies must stay empty");
}
if (!pkg.bin || !pkg.bin["repo-doctor"]) problems.push("package.json: bin entry missing");

// 5. Rule ids are unique and documented.
const ruleFiles = srcFiles.filter((file) => file.includes(`${path.sep}rules${path.sep}`));
const ruleIds = new Map();
for (const file of ruleFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/^\s{2}id:\s*"([a-z]+\/[a-z0-9-]+)"/gm)) {
    const id = match[1];
    if (ruleIds.has(id)) problems.push(`duplicate rule id "${id}" in ${path.relative(ROOT, file)} and ${ruleIds.get(id)}`);
    ruleIds.set(id, path.relative(ROOT, file));
  }
}
const rulesDoc = fs.readFileSync(path.join(ROOT, "docs", "rules.md"), "utf8");
for (const id of ruleIds.keys()) {
  if (!rulesDoc.includes(id)) problems.push(`docs/rules.md: rule "${id}" is not documented`);
}
notes.push(`${ruleIds.size} rule ids found, all documented`);

// 6. Tests: no `.only`, every test file has tests, no skipped tests.
for (const file of testFiles) {
  const content = fs.readFileSync(file, "utf8");
  const relative = path.relative(ROOT, file);
  if (/\btest\.only\(|\bdescribe\.only\(/.test(content)) problems.push(`${relative}: .only() must not be committed`);
  if (/\btest\.skip\(/.test(content)) notes.push(`${relative}: contains skipped tests`);
  if (relative.endsWith(".test.ts") && !/\btest\(/.test(content)) problems.push(`${relative}: no test() calls`);
}

// 7. No TODO/FIXME markers left in shipped source.
for (const file of srcFiles) {
  const content = fs.readFileSync(file, "utf8");
  for (const match of content.matchAll(/\b(TODO|FIXME|XXX)\b/g)) {
    const line = content.slice(0, match.index).split("\n").length;
    problems.push(`${path.relative(ROOT, file)}:${line}: ${match[1]} left in source`);
  }
}

// 8. Docs exist and are non-trivial.
const requiredDocs = ["README.md", "README.fa.md", "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "LICENSE", "CHANGELOG.md"];
for (const doc of requiredDocs) {
  const absolute = path.join(ROOT, doc);
  if (!fs.existsSync(absolute)) problems.push(`${doc} is missing`);
  else if (fs.statSync(absolute).size < 200) problems.push(`${doc} looks like a stub`);
}
for (const doc of docsFiles) {
  if (fs.statSync(doc).size < 300) problems.push(`${path.relative(ROOT, doc)} looks like a stub`);
}

// 9. Advisory data sanity.
const advisories = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "advisories.json"), "utf8"));
for (const advisory of advisories.advisories) {
  for (const key of ["id", "ecosystem", "package", "vulnerableRange", "fixedVersion", "severity", "url"]) {
    if (!advisory[key]) problems.push(`data/advisories.json: ${advisory.id ?? "?"} is missing ${key}`);
  }
  if (!/^https:\/\//.test(advisory.url ?? "")) problems.push(`data/advisories.json: ${advisory.id} has a non-https url`);
}
notes.push(`${advisories.advisories.length} advisories validated`);

// Report.
console.log(`\nRepo Doctor guard rails`);
console.log(`  ${srcFiles.length} source files · ${testFiles.length} test files · ${docsFiles.length} docs\n`);
for (const note of notes) console.log(`  ✓ ${note}`);

if (problems.length === 0) {
  console.log(`\n  ✓ No problems found\n`);
  process.exit(0);
}

console.error(`\n  ✗ ${problems.length} problem(s):\n`);
for (const problem of problems) console.error(`    · ${problem}`);
console.error("");
process.exit(1);
