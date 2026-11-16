import fs from "node:fs";
import path from "node:path";

import { loadConfig } from "../core/config.js";
import { ALL_RULES } from "../rules/index.js";
import { CATEGORIES, SEVERITIES, type RepoDoctorConfig, type ReportFormat, type ResolvedConfig, type Rule, type Severity } from "../types.js";
import { booleanFlag, listFlag, stringFlag, type FlagValue } from "./args.js";
import { printError, readInput } from "./output.js";
import { renderConsole } from "../report/console.js";
import { renderJson } from "../report/json.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderSarif } from "../report/sarif.js";
import type { ScanResult } from "../types.js";

export const EXIT = {
  ok: 0,
  findings: 1,
  usage: 2,
  failure: 3,
} as const;

export interface ScanSetup {
  root: string;
  displayPath: string;
  config: ResolvedConfig;
  warnings: string[];
  rules: Rule[];
}

/** Resolve the target directory and build the effective configuration. */
export function buildSetup(
  positionals: string[],
  flags: Record<string, FlagValue>,
  cwd: string,
): { ok: true; setup: ScanSetup } | { ok: false; message: string } {
  const target = positionals[0] ?? ".";
  const absolute = path.resolve(cwd, target);

  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolute);
  } catch {
    return { ok: false, message: `Path not found: ${target}` };
  }
  if (!stat.isDirectory()) return { ok: false, message: `Not a directory: ${target}` };

  const overrides: RepoDoctorConfig = {};
  const ignore = listFlag(flags, "ignore");
  if (ignore.length > 0) overrides.ignore = ignore;

  const maxFiles = stringFlag(flags, "max-files");
  if (maxFiles) {
    const parsed = Number(maxFiles);
    if (!Number.isInteger(parsed) || parsed <= 0) return { ok: false, message: "--max-files must be a positive integer." };
    overrides.maxFiles = parsed;
  }

  const license = stringFlag(flags, "license");
  if (license) overrides.license = license;

  const owner = stringFlag(flags, "owner");
  if (owner) overrides.copyrightHolder = owner;

  const failOnFlag = stringFlag(flags, "fail-on");
  if (failOnFlag) {
    if (failOnFlag !== "never" && !(SEVERITIES as readonly string[]).includes(failOnFlag)) {
      return { ok: false, message: `--fail-on must be one of: ${SEVERITIES.join(", ")}, never.` };
    }
    overrides.failOn = failOnFlag as Severity | "never";
  }

  if (booleanFlag(flags, "no-info")) overrides.includeInfo = false;
  if (booleanFlag(flags, "include-info")) overrides.includeInfo = true;

  const configPath = stringFlag(flags, "config");
  if (configPath) {
    const resolved = path.resolve(cwd, configPath);
    if (!fs.existsSync(resolved)) return { ok: false, message: `Config file not found: ${configPath}` };
    // A custom config path bypasses discovery: load it directly.
    try {
      const parsed = JSON.parse(readInput(resolved)) as RepoDoctorConfig;
      Object.assign(overrides, parsed, overrides);
      overrides.ignore = [...(parsed.ignore ?? []), ...(overrides.ignore ?? [])];
    } catch {
      return { ok: false, message: `Could not parse config file: ${configPath}` };
    }
  }

  const { config, warnings } = loadConfig(absolute, overrides);

  let rules = ALL_RULES;
  const only = listFlag(flags, "only");
  const categoryFlag = stringFlag(flags, "category");
  const filters = [...only, ...(categoryFlag ? [categoryFlag] : [])];
  if (filters.length > 0) {
    const unknown = filters.filter(
      (id) => !(CATEGORIES as readonly string[]).includes(id) && !ALL_RULES.some((rule) => rule.id === id),
    );
    if (unknown.length > 0) return { ok: false, message: `Unknown rule or category: ${unknown.join(", ")}` };
    rules = ALL_RULES.filter(
      (rule) => filters.includes(rule.category) || filters.includes(rule.id),
    );
  }

  return {
    ok: true,
    setup: {
      root: absolute,
      displayPath: target === "." ? path.basename(absolute) || "." : target,
      config,
      warnings,
      rules,
    },
  };
}

export function resolveFormat(flags: Record<string, FlagValue>, fallback: ReportFormat = "console"): ReportFormat | null {
  const format = stringFlag(flags, "format");
  if (!format) return fallback;
  const normalised = format.toLowerCase();
  if (normalised === "console" || normalised === "markdown" || normalised === "md" || normalised === "json" || normalised === "sarif") {
    return normalised === "md" ? "markdown" : (normalised as ReportFormat);
  }
  return null;
}

export function renderReport(
  result: ScanResult,
  format: ReportFormat,
  options: { color?: boolean; verbose?: boolean; includeInfo?: boolean },
): string {
  switch (format) {
    case "json":
      return renderJson(result);
    case "markdown":
      return renderMarkdown(result, { includeInfo: options.includeInfo ?? true });
    case "sarif":
      return renderSarif(result);
    case "console":
    default:
      return renderConsole(result, { color: options.color, verbose: options.verbose });
  }
}

export function fail(message: string): number {
  printError(`repo-doctor: ${message}`);
  return EXIT.usage;
}
