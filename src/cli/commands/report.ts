import path from "node:path";

import { parseReport } from "../../report/json.js";
import type { ReportFormat } from "../../types.js";
import { booleanFlag, stringFlag, type FlagValue } from "../args.js";
import { EXIT, fail, resolveFormat } from "../shared.js";
import { existsRelative, paint, print, readInput, style, writeOutput } from "../output.js";
import { renderConsole } from "../../report/console.js";
import { renderJson } from "../../report/json.js";
import { renderMarkdown } from "../../report/markdown.js";
import { renderSarif } from "../../report/sarif.js";

export const reportHelp = `Usage: repo-doctor report [options]

Re-render a previously saved scan result without scanning again. Useful in CI
where the scan runs once and several artefacts are produced from one result.

Options:
  --from <file>     Report JSON to read (default: .repo-doctor/report.json)
  --format <console|markdown|json|sarif>  Output format (default: markdown)
  --output <file>   Write to a file instead of stdout
  --no-color        Disable ANSI colors
`;

export const DEFAULT_REPORT_PATH = path.join(".repo-doctor", "report.json");

/** `repo-doctor report` */
export async function reportCommand(positionals: string[], flags: Record<string, FlagValue>, cwd: string): Promise<number> {
  const source = stringFlag(flags, "from") ?? positionals[0] ?? DEFAULT_REPORT_PATH;

  if (!existsRelative(source, cwd)) {
    return fail(
      `No report found at ${source}. Run \`repo-doctor scan --save\` first, or pass --from <file>.`,
    );
  }

  let result;
  try {
    result = parseReport(readInput(source, cwd));
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }

  const format = resolveFormat(flags, "markdown") as ReportFormat | null;
  if (!format) return fail("--format must be one of: console, markdown, json, sarif.");

  const colour = !booleanFlag(flags, "no-color", false);
  let rendered: string;
  switch (format) {
    case "json":
      rendered = renderJson(result);
      break;
    case "sarif":
      rendered = renderSarif(result);
      break;
    case "console":
      rendered = renderConsole(result, { color: colour, verbose: booleanFlag(flags, "verbose") });
      break;
    case "markdown":
    default:
      rendered = renderMarkdown(result);
  }

  const output = stringFlag(flags, "output");
  if (output) {
    const written = writeOutput(output, rendered, cwd);
    print(paint(`Report written to ${path.relative(cwd, written) || written}`, style.green));
    return EXIT.ok;
  }

  print(rendered);
  return EXIT.ok;
}
