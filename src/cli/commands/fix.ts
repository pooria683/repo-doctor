import { runScan } from "../../core/engine.js";
import { applyFixes, executableFixes, formatNewFileDiff, planFixes } from "../../fix/planner.js";
import { FIX_RECIPES } from "../../fix/recipes.js";
import { booleanFlag, listFlag, stringFlag, type FlagValue } from "../args.js";
import { EXIT, buildSetup, fail } from "../shared.js";
import { paint, print, style } from "../output.js";

export const fixHelp = `Usage: repo-doctor fix [path] [options]

Preview (default) or apply the safe fixes implied by a scan. Repo Doctor only
creates files that do not exist; it never edits or deletes your content.

Options:
  --dry-run              Show the diff without writing anything (default)
  --apply                Write the files to disk
  --only <fix-id>        Apply only specific fixes (repeatable)
  --diff                 Print unified diffs for every file
  --format <text|json>   Output format (default: text)
  --license <spdx>       License for the generated LICENSE file
  --owner <name>         Copyright holder for the LICENSE file
  --config <file>        Use a specific config file
  --no-color             Disable ANSI colors
`;

interface FixJson {
  mode: "dry-run" | "apply";
  fixes: Array<{ id: string; title: string; description: string; safe: boolean; files: string[] }>;
  written: string[];
  skipped: Array<{ path: string; reason: string }>;
}

/** `repo-doctor fix` */
export async function fixCommand(positionals: string[], flags: Record<string, FlagValue>, cwd: string): Promise<number> {
  const setupResult = buildSetup(positionals, flags, cwd);
  if (!setupResult.ok) return fail(setupResult.message);
  const { setup } = setupResult;

  const apply = booleanFlag(flags, "apply");
  const dryRun = !apply || booleanFlag(flags, "dry-run");
  const showDiff = booleanFlag(flags, "diff") || dryRun;
  const jsonMode = (stringFlag(flags, "format") ?? "text").toLowerCase() === "json";
  const colour = !booleanFlag(flags, "no-color", false);

  const { result, ctx } = await runScan({ root: setup.root, config: setup.config, rules: setup.rules, displayPath: setup.displayPath });

  const only = listFlag(flags, "only");
  if (only.length > 0) {
    const unknown = only.filter((id) => !FIX_RECIPES[id]);
    if (unknown.length > 0) return fail(`Unknown fix id: ${unknown.join(", ")}.`);
  }

  const allPlans = planFixes(result.findings, ctx);
  const plans = only.length > 0 ? allPlans.filter((plan) => only.includes(plan.id)) : allPlans;
  const executable = executableFixes(plans, ctx);

  if (executable.length === 0) {
    if (jsonMode) {
      print(JSON.stringify({ mode: dryRun ? "dry-run" : "apply", fixes: [], written: [], skipped: [] } satisfies FixJson, null, 2));
      return EXIT.ok;
    }
    print(paint("\n  Nothing to fix automatically.\n", colour ? style.dim : ""));
    const manual = allPlans.filter((plan) => !FIX_RECIPES[plan.id]);
    if (manual.length > 0) {
      print("  These findings need a human decision:");
      for (const plan of manual) print(`    · ${plan.title} — ${plan.description}`);
      print("");
    }
    return EXIT.ok;
  }

  const maybeWrite = apply && !booleanFlag(flags, "dry-run");
  const outcome = applyFixes(executable, { root: setup.root, dryRun: !maybeWrite });

  if (jsonMode) {
    const payload: FixJson = {
      mode: maybeWrite ? "apply" : "dry-run",
      fixes: executable.map((fix) => ({
        id: fix.plan.id,
        title: fix.plan.title,
        description: fix.plan.description,
        safe: fix.plan.safe,
        files: fix.files.map((file) => file.path),
      })),
      written: outcome.written,
      skipped: outcome.skipped,
    };
    print(JSON.stringify(payload, null, 2));
    return EXIT.ok;
  }

  const p = (text: string, ...codes: string[]) => paint(text, ...(colour ? codes : []));

  print("");
  print(
    maybeWrite
      ? p(`  Applying ${executable.length} fix(es)`, style.bold)
      : p(`  Dry run — ${executable.length} fix(es) available, nothing written`, style.bold, style.yellow),
  );
  print("");

  for (const fix of executable) {
    print(`  ${p(fix.plan.title, style.bold)} ${p(`(${fix.plan.id})`, style.dim)}`);
    print(p(`    ${fix.plan.description}`, style.dim));
    for (const file of fix.files) {
      if (file.exists) {
        print(p(`    = ${file.path} (exists, will not be touched)`, style.yellow));
        continue;
      }
      print(`    ${maybeWrite ? p("+", style.green) : p("+", style.cyan)} ${file.path}`);
      if (showDiff) {
        const diff = formatNewFileDiff(file.path, file.content)
          .split("\n")
          .slice(1)
          .map((line) => (line.startsWith("@@") ? p(`      ${line}`, style.dim) : line.startsWith("+") ? p(`      ${line}`, style.green) : `      ${line}`))
          .join("\n");
        print(diff);
      }
    }
    print("");
  }

  if (outcome.skipped.length > 0) {
    print(p(`  Skipped ${outcome.skipped.length} existing file(s) — Repo Doctor never overwrites content.`, style.yellow));
    print("");
  }

  if (maybeWrite) {
    print(p(`  ✓ Wrote ${outcome.written.length} file(s). Review the changes with \`git diff\`, then run \`repo-doctor scan\` again.`, style.green));
  } else {
    print(p("  Re-run with --apply to write these files:", style.dim));
    print(p("    npx repo-doctor fix --apply", style.bold));
  }
  print("");
  print(p(`  After applying, edit the generated files: placeholders like OWNER/REPO and the Code of Conduct contact must be filled in.`, style.dim));
  print("");

  return EXIT.ok;
}
