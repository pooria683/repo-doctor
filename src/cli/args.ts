/**
 * Tiny argument parser. Zero dependencies, predictable behaviour:
 * unknown options are an error instead of being silently ignored.
 */

export type FlagValue = string | boolean | string[];

export interface ParsedArgs {
  command?: string;
  positionals: string[];
  flags: Record<string, FlagValue>;
  errors: string[];
}

/** Options that never take a value. */
const BOOLEAN_FLAGS = new Set([
  "help",
  "version",
  "dry-run",
  "apply",
  "force",
  "verbose",
  "quiet",
  "color",
  "save",
  "ci",
  "yes",
  "validate",
  "list",
  "diff",
  "include-info",
  "no-color",
  "no-info",
  "minimal",
]);

/** Options that require a value. */
const VALUE_FLAGS = new Set([
  "config",
  "ignore",
  "fail-on",
  "format",
  "output",
  "from",
  "license",
  "owner",
  "name",
  "description",
  "max-files",
  "only",
  "severity",
  "category",
]);

/** Flags that may be repeated and accumulate. */
const REPEATABLE = new Set(["ignore", "only", "category"]);

const SHORT_ALIASES: Record<string, string> = {
  h: "help",
  v: "version",
  f: "format",
  o: "output",
  c: "config",
  q: "quiet",
  s: "save",
};

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = { positionals: [], flags: {}, errors: [] };
  const args = [...argv];

  // First non-flag token is the command.
  while (args.length > 0) {
    const token = args[0]!;
    if (!token.startsWith("-")) {
      result.command = token;
      args.shift();
      break;
    }
    break;
  }

  while (args.length > 0) {
    const token = args.shift()!;

    if (token === "--") {
      result.positionals.push(...args);
      args.length = 0;
      break;
    }

    if (!token.startsWith("-")) {
      result.positionals.push(token);
      continue;
    }

    if (token.startsWith("--")) {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const name = eq === -1 ? body : body.slice(0, eq);
      const inlineValue = eq === -1 ? undefined : body.slice(eq + 1);

      if (BOOLEAN_FLAGS.has(name)) {
        result.flags[name] = inlineValue !== undefined ? !/^(false|0|no)$/i.test(inlineValue) : true;
        continue;
      }

      if (VALUE_FLAGS.has(name)) {
        let value = inlineValue;
        if (value === undefined) {
          const next = args[0];
          if (next === undefined || next.startsWith("-")) {
            result.errors.push(`Option --${name} requires a value.`);
            continue;
          }
          value = args.shift()!;
        }
        if (REPEATABLE.has(name)) {
          const existing = result.flags[name];
          const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
          list.push(value);
          result.flags[name] = list;
        } else {
          result.flags[name] = value;
        }
        continue;
      }

      result.errors.push(`Unknown option --${name}.`);
      continue;
    }

    // Short flags, possibly bundled (-vq).
    const shorts = token.slice(1);
    for (const char of shorts) {
      const name = SHORT_ALIASES[char];
      if (!name) {
        result.errors.push(`Unknown option -${char}.`);
        continue;
      }
      if (BOOLEAN_FLAGS.has(name)) {
        result.flags[name] = true;
        continue;
      }
      const next = args.shift();
      if (next === undefined) {
        result.errors.push(`Option -${char} requires a value.`);
        continue;
      }
      result.flags[name] = next;
    }
  }

  return result;
}

export function stringFlag(flags: Record<string, FlagValue>, name: string): string | undefined {
  const value = flags[name];
  return typeof value === "string" ? value : undefined;
}

export function booleanFlag(flags: Record<string, FlagValue>, name: string, fallback = false): boolean {
  const value = flags[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return !/^(false|0|no)$/i.test(value);
  return fallback;
}

export function listFlag(flags: Record<string, FlagValue>, name: string): string[] {
  const value = flags[name];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}
