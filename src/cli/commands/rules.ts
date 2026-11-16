import { ALL_RULES, validateRegistry } from "../../rules/index.js";
import { CATEGORY_LABELS, type Category } from "../../types.js";
import { booleanFlag, listFlag, stringFlag, type FlagValue } from "../args.js";
import { EXIT } from "../shared.js";
import { paint, print, style } from "../output.js";

export const rulesHelp = `Usage: repo-doctor rules [options]

List every available rule, its category and default severity. Use this to decide
what to disable in .repodoctorrc.json.

Options:
  --format <table|json>   Output format (default: table)
  --category <name>       Filter by category (repeatable)
  --validate              Check the registry for duplicate ids and bad metadata
`;

/** `repo-doctor rules` */
export async function rulesCommand(_positionals: string[], flags: Record<string, FlagValue>, _cwd: string): Promise<number> {
  if (booleanFlag(flags, "validate")) {
    const problems = validateRegistry();
    if (problems.length === 0) {
      print(paint(`✓ Rule registry is valid (${ALL_RULES.length} rules).`, style.green));
      return EXIT.ok;
    }
    for (const problem of problems) print(paint(`✗ ${problem.kind}: ${problem.detail}`, style.red));
    return EXIT.usage;
  }

  const categories = listFlag(flags, "category");
  const filtered = categories.length > 0 ? ALL_RULES.filter((rule) => categories.includes(rule.category)) : ALL_RULES;

  if ((stringFlag(flags, "format") ?? "table").toLowerCase() === "json") {
    print(
      JSON.stringify(
        filtered.map((rule) => ({
          id: rule.id,
          title: rule.title,
          category: rule.category,
          severity: rule.severity,
          description: rule.description,
          tags: rule.tags ?? [],
          docsUrl: rule.docsUrl ?? null,
        })),
        null,
        2,
      ),
    );
    return EXIT.ok;
  }

  let currentCategory = "";
  for (const rule of filtered) {
    if (rule.category !== currentCategory) {
      currentCategory = rule.category;
      print("");
      print(paint(`  ${CATEGORY_LABELS[currentCategory as Category]}`, style.bold));
    }
    print(`    ${paint(rule.severity.padEnd(8), style.dim)} ${paint(rule.id, style.cyan)}`);
    print(`             ${paint(rule.title, style.dim)}`);
  }
  print("");
  print(paint(`  ${filtered.length} rules · disable one with {"rules": {"<id>": "off"}} in .repodoctorrc.json`, style.dim));
  print("");
  return EXIT.ok;
}
