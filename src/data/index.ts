import fs from "node:fs";

import type { Severity } from "../types.js";

export interface Advisory {
  id: string;
  cve?: string | null;
  ecosystem: Ecosystem;
  package: string;
  vulnerableRange: string;
  fixedVersion: string;
  severity: Severity;
  title: string;
  summary: string;
  url: string;
}

export type Ecosystem = "npm" | "pypi" | "cargo" | "go" | "rubygems" | "composer";

interface AdvisoryFile {
  meta: { version: string; generatedAt: string; entryCount?: number };
  advisories: Advisory[];
}

interface KnownVersionsFile {
  meta: { version: string; generatedAt: string };
  packages: Partial<Record<Ecosystem, Record<string, string>>>;
}

export interface KnownVersions {
  meta: { version: string; generatedAt: string };
  packages: Record<string, Partial<Record<Ecosystem, string>>>;
}

const EMPTY_META = { version: "0.0.0", generatedAt: "unknown" };

/** Resolve bundled data relative to the compiled file (works from src and dist). */
function dataUrl(fileName: string): URL {
  return new URL(`../../data/${fileName}`, import.meta.url);
}

function readJsonFile<T>(fileName: string): T | null {
  const candidates = [dataUrl(fileName), new URL(`../../../data/${fileName}`, import.meta.url)];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      return JSON.parse(fs.readFileSync(candidate, "utf8")) as T;
    } catch {
      continue;
    }
  }
  return null;
}

let advisoryCache: { meta: AdvisoryFile["meta"]; advisories: Advisory[] } | null = null;

export function loadAdvisories(): { meta: AdvisoryFile["meta"]; advisories: Advisory[] } {
  if (advisoryCache) return advisoryCache;
  const file = readJsonFile<AdvisoryFile>("advisories.json");
  advisoryCache = {
    meta: file?.meta ?? EMPTY_META,
    advisories: Array.isArray(file?.advisories) ? file!.advisories : [],
  };
  return advisoryCache;
}

let knownCache: KnownVersions | null = null;

export function loadKnownVersions(): KnownVersions {
  if (knownCache) return knownCache;
  const file = readJsonFile<KnownVersionsFile>("known-versions.json");
  const packages: KnownVersions["packages"] = {};
  for (const [ecosystem, entries] of Object.entries(file?.packages ?? {})) {
    for (const [name, version] of Object.entries(entries ?? {})) {
      if (!packages[name]) packages[name] = {};
      (packages[name] as Record<string, string>)[ecosystem] = version as string;
    }
  }
  knownCache = { meta: file?.meta ?? EMPTY_META, packages };
  return knownCache;
}

/** Packages that are officially deprecated, with a suggested replacement. */
export const DEPRECATED_PACKAGES: Record<string, { ecosystem: Ecosystem; replacement: string }> = {
  request: { ecosystem: "npm", replacement: "undici, got, axios or node:fetch" },
  tslint: { ecosystem: "npm", replacement: "eslint with @typescript-eslint" },
  "node-uuid": { ecosystem: "npm", replacement: "uuid" },
  "gulp-util": { ecosystem: "npm", replacement: "individual gulp plugins / fancy-log" },
  "babel-eslint": { ecosystem: "npm", replacement: "@babel/eslint-parser" },
  nomnom: { ecosystem: "npm", replacement: "commander" },
  istanbul: { ecosystem: "npm", replacement: "nyc / c8" },
  "left-pad": { ecosystem: "npm", replacement: "String.prototype.padStart" },
  faker: { ecosystem: "npm", replacement: "@faker-js/faker" },
  "crypto": { ecosystem: "npm", replacement: "node:crypto" },
  nose: { ecosystem: "pypi", replacement: "pytest" },
  "mock": { ecosystem: "pypi", replacement: "unittest.mock" },
  "distribute": { ecosystem: "pypi", replacement: "setuptools" },
};
