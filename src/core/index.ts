/**
 * Programmatic API.
 *
 * ```ts
 * import { scan } from "repo-doctor";
 * const result = await scan({ path: "." });
 * console.log(result.summary.score);
 * ```
 */

import path from "node:path";

import { runScan } from "./engine.js";
import { loadConfig, resolveConfig } from "./config.js";
import { ALL_RULES, RULES_BY_ID, getRule } from "../rules/index.js";
import { meetsFailThreshold } from "./score.js";
import { renderJson } from "../report/json.js";
import { renderMarkdown } from "../report/markdown.js";
import { renderSarif } from "../report/sarif.js";
import type { RepoDoctorConfig, ScanResult } from "../types.js";

export interface ScanApiOptions extends RepoDoctorConfig {
  /** Path to the repository. Defaults to the current working directory. */
  path?: string;
}

export interface ScanApiResult {
  result: ScanResult;
  /** Convenience: true when findings meet the configured fail-on threshold. */
  failed: boolean;
}

/** Scan a repository without the CLI. */
export async function scan(options: ScanApiOptions = {}): Promise<ScanApiResult> {
  const root = path.resolve(options.path ?? process.cwd());
  const { config } = loadConfig(root, options);
  const { result } = await runScan({ root, config, displayPath: options.path ?? path.basename(root) });
  return { result, failed: meetsFailThreshold(result.findings, config.failOn) };
}

export { ALL_RULES, RULES_BY_ID, getRule, loadConfig, resolveConfig, renderJson, renderMarkdown, renderSarif };
export type {
  Finding,
  Rule,
  ScanResult,
  Severity,
  Category,
  RepoDoctorConfig,
  ReportFormat,
  FixPlan,
  CategoryScore,
  ScanSummary,
} from "../types.js";
export { SCHEMA_VERSION, TOOL_VERSION } from "../types.js";
