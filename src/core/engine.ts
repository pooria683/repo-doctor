import { buildContext } from "./context.js";
import { computeScores, sortFindings } from "./score.js";
import { planFixes } from "../fix/planner.js";
import { ALL_RULES } from "../rules/index.js";
import {
  SCHEMA_VERSION,
  TOOL_NAME,
  TOOL_VERSION,
  type Category,
  type Finding,
  type ResolvedConfig,
  type Rule,
  type RuleContext,
  type ScanResult,
} from "../types.js";

export interface ScanOptions {
  /** Absolute path of the repository to scan. */
  root: string;
  config: ResolvedConfig;
  /** Rule subset (defaults to the full registry). */
  rules?: Rule[];
  /** Pre-computed file list, mainly for tests. */
  files?: string[];
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
  /** Display path for the report (defaults to the basename). */
  displayPath?: string;
}

export interface ScanOutcome {
  result: ScanResult;
  ctx: RuleContext;
}

function emptyCategoryCounts(): Record<Category, number> {
  return {
    documentation: 0,
    security: 0,
    dependencies: 0,
    quality: 0,
    containers: 0,
    ci: 0,
    community: 0,
  };
}

/**
 * Run all enabled rules against a repository and assemble the report model.
 * This function never writes to disk and never performs network I/O.
 */
export async function runScan(options: ScanOptions): Promise<ScanOutcome> {
  const startedAt = Date.now();
  const config = options.config;
  const { ctx, warnings } = buildContext(options.root, config, { files: options.files });
  const rules = options.rules ?? ALL_RULES;

  const findings: Finding[] = [];
  const rulesRunByCategory = emptyCategoryCounts();
  const ruleWarnings: string[] = [];

  for (const rule of rules) {
    const setting = config.rules[rule.id];
    if (setting && setting.enabled === false) continue;

    if (rule.requiresFile && rule.requiresFile.length > 0) {
      const present = rule.requiresFile.some((pattern) => (ctx.exists(pattern) ? true : ctx.find([pattern]).length > 0));
      if (!present) continue;
    }
    if (rule.requiresMissingFile && rule.requiresMissingFile.some((pattern) => ctx.exists(pattern))) continue;

    rulesRunByCategory[rule.category] += 1;

    let produced: Finding[];
    try {
      produced = await rule.run(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ruleWarnings.push(`Rule ${rule.id} failed: ${message}`);
      continue;
    }

    const overrideSeverity = setting?.severity;
    for (const finding of produced) {
      if (!finding.message || !finding.title) continue;
      findings.push(overrideSeverity ? { ...finding, severity: overrideSeverity } : finding);
    }
  }

  const filtered = config.includeInfo ? findings : findings.filter((finding) => finding.severity !== "info");
  const sorted = sortFindings(filtered);

  const { summary, categories } = computeScores({
    findings: sorted,
    rulesRunByCategory,
    config,
    durationMs: 0,
    filesScanned: ctx.files.length,
  });
  summary.durationMs = Date.now() - startedAt;

  const disabledRules = Object.entries(config.rules)
    .filter(([, setting]) => setting.enabled === false)
    .map(([ruleId]) => ruleId);

  const result: ScanResult = {
    schemaVersion: SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    target: {
      path: ".",
      displayPath: options.displayPath ?? ".",
      git: {
        isRepo: ctx.git.isRepo,
        ...(ctx.git.branch ? { branch: ctx.git.branch } : {}),
        ...(ctx.git.remoteUrl ? { remote: ctx.git.remoteUrl } : {}),
        ...(ctx.git.slug ? { slug: ctx.git.slug } : {}),
      },
      filesScanned: ctx.files.length,
    },
    generatedAt: (options.now?.() ?? new Date()).toISOString(),
    config: {
      failOn: config.failOn,
      ignoreCount: config.ignore.length,
      disabledRules,
      ...(config.source ? { configFile: config.source } : {}),
    },
    summary,
    categories,
    findings: sorted,
    fixes: planFixes(sorted, ctx),
    warnings: [...warnings, ...ruleWarnings],
  };

  return { result, ctx };
}
