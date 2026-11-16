#!/usr/bin/env node
/**
 * Repo Doctor CLI entry point.
 *
 * Design rules for this file:
 *  - no network access, ever;
 *  - every code path returns an exit code;
 *  - errors are actionable, never stack traces (unless --debug).
 */

import { TOOL_VERSION } from "../types.js";
import { booleanFlag, parseArgs, type FlagValue } from "./args.js";
import { fixCommand } from "./commands/fix.js";
import { initCommand } from "./commands/init.js";
import { reportCommand } from "./commands/report.js";
import { rulesCommand } from "./commands/rules.js";
import { scanCommand } from "./commands/scan.js";
import { MAIN_HELP, commandHelp } from "./help.js";
import { print, printError, paint, style } from "./output.js";
import { EXIT } from "./shared.js";

const COMMANDS = new Set(["scan", "fix", "report", "init", "rules"]);

/** `repo-doctor ... | head` must not crash with EPIPE. */
function guardStdio(): void {
  const swallow = (error: NodeJS.ErrnoException): void => {
    if (error.code === "EPIPE") process.exit(0);
  };
  process.stdout.on("error", swallow);
  process.stderr.on("error", swallow);
}

export async function main(argv: string[] = process.argv.slice(2), cwd = process.cwd()): Promise<number> {
  const parsed = parseArgs(argv);
  const { command, positionals, flags } = parsed;

  if (parsed.errors.length > 0) {
    for (const error of parsed.errors) printError(`repo-doctor: ${error}`);
    printError("Run `repo-doctor --help` for usage.");
    return EXIT.usage;
  }

  if (booleanFlag(flags, "version") && !command) {
    print(TOOL_VERSION);
    return EXIT.ok;
  }

  if (!command || command === "help") {
    const topic = command === "help" ? positionals[0] : undefined;
    print(topic ? (commandHelp(topic) ?? MAIN_HELP) : MAIN_HELP);
    return EXIT.ok;
  }

  if (booleanFlag(flags, "help")) {
    print(commandHelp(command) ?? MAIN_HELP);
    return EXIT.ok;
  }

  if (!COMMANDS.has(command)) {
    printError(`repo-doctor: unknown command "${command}".`);
    printError("Available commands: scan, fix, report, init, rules.");
    return EXIT.usage;
  }

  try {
    switch (command) {
      case "scan":
        return await scanCommand(positionals, flags, cwd);
      case "fix":
        return await fixCommand(positionals, flags, cwd);
      case "report":
        return await reportCommand(positionals, flags, cwd);
      case "init":
        return await initCommand(positionals, flags, cwd);
      case "rules":
        return await rulesCommand(positionals, flags, cwd);
      default:
        return EXIT.usage;
    }
  } catch (error) {
    const debug = process.env.REPO_DOCTOR_DEBUG === "1" || booleanFlag(flags as Record<string, FlagValue>, "verbose");
    const message = error instanceof Error ? error.message : String(error);
    printError(`repo-doctor: ${message}`);
    if (debug && error instanceof Error && error.stack) printError(error.stack);
    return EXIT.failure;
  }
}

/** Only run when executed directly (not when imported by tests). */
const invokedDirectly =
  process.argv[1] !== undefined && /(?:^|\/)(?:cli\/index|repo-doctor)(?:\.js)?$/.test(process.argv[1]);

if (invokedDirectly) {
  guardStdio();
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      printError(`repo-doctor: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = EXIT.failure;
    });
}

export { paint, style };
