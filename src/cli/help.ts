import { TOOL_VERSION } from "../types.js";
import { fixHelp } from "./commands/fix.js";
import { initHelp } from "./commands/init.js";
import { reportHelp } from "./commands/report.js";
import { rulesHelp } from "./commands/rules.js";
import { scanHelp } from "./commands/scan.js";
import { paint, style } from "./output.js";

export const MAIN_HELP = `  ${paint("repo-doctor", style.bold)} ${paint(`v${TOOL_VERSION}`, style.dim)} — offline health scanner for open-source repositories

  ${paint("Usage", style.bold)}
    repo-doctor <command> [path] [options]

  ${paint("Commands", style.bold)}
    scan      Scan a repository and report findings (README, secrets, deps, CI, ...)
    fix       Preview or apply safe fixes for the findings
    report    Re-render a saved scan result (markdown, json, sarif)
    init      Bootstrap docs, community files, CI and config
    rules     List the rule catalogue

  ${paint("Common options", style.bold)}
    --format <console|markdown|json|sarif>   Output format
    --output <file>                          Write the report to a file
    --fail-on <critical|high|medium|low|never>  Exit code threshold (default: high)
    --config <file>                          Use a specific config file
    --ignore <glob>                          Extra ignore pattern (repeatable)
    --no-color                               Disable ANSI colors
    -h, --help                               Show help
    -v, --version                            Show version

  ${paint("Examples", style.bold)}
    ${paint("repo-doctor scan .", style.cyan)}                     Scan the current repository
    ${paint("repo-doctor scan . --format markdown --fail-on high", style.cyan)}
    ${paint("repo-doctor scan . --format sarif --output results.sarif", style.cyan)}
    ${paint("repo-doctor fix --dry-run", style.cyan)}              Preview safe fixes
    ${paint("repo-doctor fix --apply", style.cyan)}                Write them (never overwrites)
    ${paint("repo-doctor init . --name my-lib --license MIT --ci github-actions", style.cyan)}

  ${paint("Privacy", style.bold)}
    Repo Doctor makes no network requests. Everything is computed locally and
    detected secrets are never printed or stored — only a masked fingerprint.

  ${paint("Exit codes", style.bold)}
    0 healthy / no findings at or above --fail-on
    1 findings at or above --fail-on
    2 invalid usage
    3 unexpected failure

  ${paint("Docs", style.bold)}  https://github.com/pooria683/repo-doctor
`;

export function commandHelp(command: string): string | null {
  switch (command) {
    case "scan":
      return scanHelp;
    case "fix":
      return fixHelp;
    case "report":
      return reportHelp;
    case "init":
      return initHelp;
    case "rules":
      return rulesHelp;
    default:
      return null;
  }
}
