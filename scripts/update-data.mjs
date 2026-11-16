#!/usr/bin/env node
/**
 * Maintainer script: refresh the bundled advisory snapshot from OSV.
 *
 * This is NOT part of the CLI and never runs at scan time. Repo Doctor itself
 * makes no network requests; only this script does, and only when a maintainer
 * runs it deliberately:
 *
 *     node scripts/update-data.mjs
 *
 * The output (data/advisories.json) is reviewed as a normal diff before being
 * committed, which is why the snapshot is trustworthy enough to ship.
 *
 * Requirements: Node 18+. No dependencies (uses global fetch).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const ADVISORIES_PATH = path.join(ROOT, "data", "advisories.json");
const KNOWN_VERSIONS_PATH = path.join(ROOT, "data", "known-versions.json");
const OSV_BATCH_URL = "https://api.osv.dev/v1/querybatch";
const OSV_VULN_URL = "https://api.osv.dev/v1/vulns";
const ECOSYSTEM_MAP = { npm: "npm", pypi: "PyPI", cargo: "crates.io", go: "Go" };

/** Packages we care about: the ones people actually depend on. */
const TRACKED_PACKAGES = {
  npm: [
    "lodash", "minimist", "node-fetch", "express", "axios", "jsonwebtoken", "semver",
    "ejs", "loader-utils", "tar", "follow-redirects", "braces", "multer", "next",
    "ws", "qs", "body-parser", "cookie", "path-to-regexp", "undici", "vite", "esbuild",
  ],
  pypi: [
    "requests", "urllib3", "pyyaml", "jinja2", "aiohttp", "django", "flask",
    "fastapi", "cryptography", "pillow", "setuptools", "werkzeug", "certifi",
  ],
  cargo: ["time", "smallvec", "openssl", "hyper", "tokio", "regex"],
  go: ["golang.org/x/net", "github.com/gin-gonic/gin", "github.com/gorilla/websocket"],
};

const MAX_AGE_DAYS = 365 * 3;

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function severityOf(vuln) {
  const score = vuln.database_specific?.severity ?? vuln.severity?.find((entry) => entry.type === "CVSS_V3")?.score;
  if (typeof score === "string") {
    const upper = score.toUpperCase();
    if (upper === "CRITICAL" || upper === "HIGH") return upper === "CRITICAL" ? "critical" : "high";
    if (upper === "MODERATE" || upper === "MEDIUM") return "medium";
    if (upper === "LOW") return "low";
  }
  if (typeof score === "number") return score >= 9 ? "critical" : score >= 7 ? "high" : score >= 4 ? "medium" : "low";
  return "medium";
}

function fixedVersionOf(vuln, packageName) {
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== packageName) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}

function vulnerableRangeOf(vuln, packageName) {
  const parts = [];
  for (const affected of vuln.affected ?? []) {
    if (affected.package?.name !== packageName) continue;
    for (const range of affected.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.introduced && event.introduced !== "0") parts.push(`>=${event.introduced}`);
        else if (event.introduced === "0") parts.push(">=0.0.0");
        if (event.last_affected) parts.push(`<=${event.last_affected}`);
      }
    }
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

async function main() {
  const queries = [];
  const index = [];
  for (const [ecosystem, packages] of Object.entries(TRACKED_PACKAGES)) {
    for (const name of packages) {
      queries.push({ package: { name, ecosystem: ECOSYSTEM_MAP[ecosystem] } });
      index.push({ ecosystem, name });
    }
  }

  console.log(`Querying OSV for ${queries.length} packages…`);
  const batch = await postJson(OSV_BATCH_URL, { queries });
  const results = [];

  for (let i = 0; i < index.length; i++) {
    const { ecosystem, name } = index[i];
    const vulns = batch.results?.[i]?.vulns ?? [];
    for (const entry of vulns.slice(0, 6)) {
      const vuln = await getJson(`${OSV_VULN_URL}/${entry.id}`);
      const published = vuln.published ? new Date(vuln.published) : null;
      if (published && (Date.now() - published.getTime()) / 86_400_000 > MAX_AGE_DAYS) continue;
      const vulnerableRange = vulnerableRangeOf(vuln, name);
      const fixedVersion = fixedVersionOf(vuln, name);
      if (!vulnerableRange || !fixedVersion) continue;
      results.push({
        id: vuln.id,
        cve: vuln.aliases?.find((alias) => alias.startsWith("CVE-")) ?? null,
        ecosystem,
        package: name,
        vulnerableRange,
        fixedVersion,
        severity: severityOf(vuln),
        title: vuln.summary ?? vuln.id,
        summary: vuln.details?.split("\n")[0]?.slice(0, 240) ?? vuln.summary ?? "",
        url: `https://osv.dev/vulnerability/${vuln.id}`,
      });
    }
    process.stdout.write(`\r  ${i + 1}/${index.length} packages, ${results.length} advisories`);
  }
  console.log("");

  // De-duplicate and keep the highest severity per (ecosystem, package, fixedVersion).
  const byKey = new Map();
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  for (const advisory of results) {
    const key = `${advisory.ecosystem}:${advisory.package}:${advisory.fixedVersion}`;
    const existing = byKey.get(key);
    if (!existing || order[advisory.severity] < order[existing.severity]) byKey.set(key, advisory);
  }
  const advisories = [...byKey.values()].sort(
    (a, b) => a.ecosystem.localeCompare(b.ecosystem) || a.package.localeCompare(b.package),
  );

  const next = {
    $comment:
      "Offline advisory snapshot bundled with repo-doctor. Generated by scripts/update-data.mjs from OSV, then reviewed as a diff. Not a complete vulnerability database.",
    meta: {
      version: new Date().toISOString().slice(0, 10).replace(/-/g, "."),
      generatedAt: new Date().toISOString().slice(0, 10),
      ecosystems: Object.keys(TRACKED_PACKAGES),
      entryCount: advisories.length,
      source: "https://osv.dev",
    },
    advisories,
  };

  fs.writeFileSync(ADVISORIES_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  console.log(`Wrote ${advisories.length} advisories to ${path.relative(ROOT, ADVISORIES_PATH)}`);
  console.log("Review the diff before committing. Known-versions.json is updated manually.");

  void KNOWN_VERSIONS_PATH;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
