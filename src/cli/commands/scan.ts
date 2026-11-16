import path from "node:path";

import { runScan } from "../../core/engine.js";
import { meetsFailThreshold } from "../../core/score.js";
import { renderJson } from "../../report/json.js";
import { renderMarkdown } from "../../report/markdown.js";
import type { ReportFormat } from "../../types.js";
import { booleanFlag, stringFlag, type FlagValue } from "../args.js";
import { EXIT, buildSetup, fail, renderReport, resolveFormat } from "../shared.js";
import { paint, print, printWarn, style, writeOutput } from "../output.js";
import { renderConsole } from "../../report/console.js";
import { renderSarif } from "../../report/sarif.js";

export const scanHelp = `Usage: repo-doctor scan [path] [options]

Scan a repository and report documentation, security, dependency, quality,
container, CI and community findings.

Options:
  --format <console|markdown|json|sarif>  Output format (default: console)
  --output <file>                         Write the report to a file
  --save                                  Save JSON to .repo-doctor/report.json
  --fail-on <severity|never>              Exit 1 at or above this severity (default: high)
  --ignore <glob>                         Additional ignore pattern (repeatable)
  --only <rule|category>                  Run only these rules/categories (repeatable)
  --category <name>                       Shorthand for --only <category>
  --config <file>                         Use a specific config file
  --license <spdx>                        License to offer in fixes
  --max-files <n>                         Cap the number of files walked
  --include-info / --no-info              Toggle info-level findings
  --verbose                               Show every finding in console output
  --no-color                              Disable ANSI colors
  --quiet                                 Only print nothing; use the exit code
`;

/** `repo-doctor scan` */
export async function scanCommand(positionals: string[], flags: Record<string, FlagValue>, cwd: string): Promise<number> {
  const setupResult = buildSetup(positionals, flags, cwd);
  if (!setupResult.ok) return fail(setupResult.message);
  const { setup } = setupResult;

  const format = resolveFormat(flags);
  if (!format) return fail("--format must be one of: console, markdown, json, sarif.");

  const includeInfo = setup.config.includeInfo;
  const color = !booleanFlag(flags, "no-color", false);
  const verbose = booleanFlag(flags, "verbose");

  const { result } = await runScan({
    root: setup.root,
    config: setup.config,
    rules: setup.rules,
    displayPath: setup.displayPath,
  });

  for (const warning of setup.warnings) printWarn(`warning: ${warning}`);

  // Console output is special-cased: it renders to the terminal even when the
  // requested format is a file format, unless --quiet was passed.
  const quiet = booleanFlag(flags, "quiet");
  const outputTarget = stringFlag(flags, "output");
  const save = booleanFlag(flags, "save");

  if (!quiet) {
    if (format === "console") {
      print(renderConsole(result, { color, verbose, maxPerSeverity: verbose ? 100 : 10 }));
    } else if (!outputTarget) {
      print(renderReport(result, format, { color, verbose, includeInfo }));
    } else {
      print(renderConsole(result, { color, verbose, maxPerSeverity: 5 }));
    }
  }

  if (outputTarget) {
    const written = writeOutput(outputTarget, renderForFile(result, format, includeInfo), cwd);
    if (!quiet) print(paint(`Report written to ${path.relative(cwd, written) || written}`, style.green));
  }

  if (save) {
    const jsonPath = writeOutput(path.join(".repo-doctor", "report.json"), renderJson(result), cwd);
    writeOutput(path.join(".repo-doctor", "report.md"), renderMarkdown(result, { includeInfo }), cwd);
    if (!quiet) print(paint(`Saved ${path.relative(cwd, jsonPath)}`, style.dim));
  }

  // Human hints must never contaminate machine-readable output.
  if (format === "console" && !quiet && result.summary.counts.critical > 0) {
    print(paint(`\n  ${result.summary.counts.critical} critical finding(s) need attention before this repository is safe to publish.`, style.red));
  }

  const threshold = setup.config.failOn;
  if (meetsFailThreshold(result.findings, threshold)) {
    if (format === "console" && !quiet) {
      print(paint(`\n  Failing: findings at or above "${threshold}" (see --fail-on).`, style.dim));
    }
    return EXIT.findings;
  }
  return EXIT.ok;
}

/** Pick a renderer for file output, falling back to markdown for console. */
function renderForFile(
  result: Parameters<typeof renderSarif>[0],
  format: ReportFormat,
  includeInfo: boolean,
): string {
  switch (format) {
    case "json":
      return renderJson(result);
    case "sarif":
      return renderSarif(result);
    case "markdown":
    case "console":
    default:
      return renderMarkdown(result, { includeInfo });
  }
}
