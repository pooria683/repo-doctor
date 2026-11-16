import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(absolute));
    else if (entry.name.endsWith(".ts")) out.push(absolute);
  }
  return out;
}

/**
 * These tests exist because the core promise of this tool is that it never
 * sends repository data anywhere. They fail loudly if that ever changes.
 */
test("privacy: no networking modules are imported anywhere in src", () => {
  const forbidden = [
    /from\s+["']node:http["']/,
    /from\s+["']node:https["']/,
    /from\s+["']node:net["']/,
    /from\s+["']node:dgram["']/,
    /from\s+["']node:tls["']/,
    /from\s+["']node:dns["']/,
    /from\s+["']undici["']/,
    /require\(\s*["'](http|https|net)["']\s*\)/,
  ];
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, "utf8");
    for (const pattern of forbidden) {
      if (pattern.test(content)) offenders.push(`${path.relative(SRC, file)}: ${pattern}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("privacy: no global fetch() calls in src", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, "utf8");
    // `fetch` as a call, not as part of a longer identifier.
    if (/(?<![.\w])fetch\s*\(/.test(content)) offenders.push(path.relative(SRC, file));
  }
  assert.deepEqual(offenders, []);
});

test("privacy: the only child process usage is local git and it is read-only", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, "utf8");
    if (!content.includes("node:child_process")) continue;
    // Only git.ts may shell out, and only with the git binary.
    if (!file.endsWith(path.join("util", "git.ts"))) offenders.push(path.relative(SRC, file));
    if (!content.includes('execFileSync("git"')) offenders.push(`${path.relative(SRC, file)} (unexpected exec)`);
  }
  assert.deepEqual(offenders, []);
});

test("privacy: package.json declares zero runtime dependencies", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.deepEqual(pkg.dependencies ?? {}, {});
});

test("privacy: telemetry-related identifiers do not appear in src", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const content = fs.readFileSync(file, "utf8").toLowerCase();
    for (const word of ["telemetry", "analytics.track", "posthog", "sentry.io", "mixpanel"]) {
      if (content.includes(word)) offenders.push(`${path.relative(SRC, file)}: ${word}`);
    }
  }
  assert.deepEqual(offenders, []);
});
