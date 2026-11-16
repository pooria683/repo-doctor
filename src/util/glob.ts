/**
 * Minimal glob matcher (no dependencies).
 *
 * Supports the subset Repo Doctor needs:
 *   *        any characters except `/`
 *   **       any characters including `/` (with `**\/` matching zero+ segments)
 *   ?        a single character except `/`
 *   [abc]    character class, supports negation with `!` or `^`
 *   {a,b}    alternation (no nesting)
 *
 * Matching is case-sensitive, paths use POSIX separators.
 */

const cache = new Map<string, RegExp>();

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Expand `{a,b}` groups into concrete patterns (one level of nesting). */
export function expandBraces(pattern: string): string[] {
  const start = pattern.indexOf("{");
  if (start === -1) return [pattern];
  let depth = 0;
  let end = -1;
  for (let i = start; i < pattern.length; i++) {
    if (pattern[i] === "{") depth++;
    else if (pattern[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return [pattern];
  const prefix = pattern.slice(0, start);
  const suffix = pattern.slice(end + 1);
  const options = pattern.slice(start + 1, end).split(",");
  const out: string[] = [];
  for (const option of options) {
    for (const expanded of expandBraces(prefix + option + suffix)) out.push(expanded);
  }
  return out;
}

export function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;

  let src = "";
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i]!;
    if (char === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        const followedBySlash = pattern[i + 2] === "/";
        if (followedBySlash) {
          // `**/` matches zero or more leading path segments.
          src += "(?:[^/]+/)*";
          i += 3;
          continue;
        }
        src += ".*";
        i += 2;
        continue;
      }
      src += "[^/]*";
      i += 1;
      continue;
    }
    if (char === "?") {
      src += "[^/]";
      i += 1;
      continue;
    }
    if (char === "[") {
      const close = pattern.indexOf("]", i + 1);
      if (close === -1) {
        src += "\\[";
        i += 1;
        continue;
      }
      let body = pattern.slice(i + 1, close);
      if (body.startsWith("!")) body = "^" + body.slice(1);
      src += "[" + body.replace(/\\/g, "\\\\") + "]";
      i = close + 1;
      continue;
    }
    src += escapeRegex(char);
    i += 1;
  }

  const regex = new RegExp("^" + src + "$");
  cache.set(pattern, regex);
  return regex;
}

/** True when `path` matches `pattern`. A bare name like `Dockerfile` matches at any depth. */
export function matchGlob(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  for (const expanded of expandBraces(pattern)) {
    if (globToRegExp(expanded).test(path)) return true;
    // Bare file names (no slash, no wildcard) match basenames at any depth.
    if (!expanded.includes("/") && !/[*?[]/.test(expanded)) {
      const base = path.slice(path.lastIndexOf("/") + 1);
      if (base === expanded) return true;
    }
  }
  return false;
}

export function matchAnyGlob(patterns: readonly string[], path: string): boolean {
  return patterns.some((pattern) => matchGlob(pattern, path));
}

/** Escape a literal string so it can be used inside a glob. */
export function escapeGlob(value: string): string {
  return value.replace(/[*?[\]{}]/g, "\\$&");
}
