/**
 * Small semver implementation (no dependencies).
 *
 * Supports: `1.2.3`, `v1.2.3`, `=1.2.3`, `>`, `>=`, `<`, `<=`, `^`, `~`,
 * `*`/`x` wildcards, `1.x`, `1.2.x`, hyphen ranges (`1.2.3 - 2.0.0`) and `||`.
 * Prerelease/build metadata is parsed and ignored for ordering, which is a
 * deliberate simplification: Repo Doctor only needs enough precision to decide
 * whether a dependency *may* resolve to a known-bad version.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  raw: string;
}

const VERSION_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[-+]([0-9A-Za-z.-]+))?$/;

export function parseVersion(input: string): Version | null {
  const match = VERSION_RE.exec(input.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    patch: match[3] === undefined ? 0 : Number(match[3]),
    prerelease: match[4] ?? "",
    raw: input.trim(),
  };
}

export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === "") return 1; // release > prerelease
  if (b.prerelease === "") return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

export function compare(a: string, b: string): number {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (!va || !vb) return 0;
  return compareVersions(va, vb);
}

interface Comparator {
  op: ">" | ">=" | "<" | "<=" | "=";
  version: Version;
}

const WILDCARD_RE = /^[*xX]$/;

function parsePartial(part: string): { major: number; minor: number | null; patch: number | null } | null {
  const cleaned = part.replace(/^v/, "");
  const bits = cleaned.split(".");
  const major = WILDCARD_RE.test(bits[0] ?? "") ? null : Number(bits[0]);
  if (major === null) return null;
  if (Number.isNaN(major)) return null;

  let minor: number | null = null;
  if (bits.length > 1) {
    if (WILDCARD_RE.test(bits[1] ?? "")) return { major, minor, patch: null };
    minor = Number(bits[1]);
    if (Number.isNaN(minor)) return null;
  }
  let patch: number | null = null;
  if (bits.length > 2) {
    if (WILDCARD_RE.test(bits[2] ?? "")) return { major, minor, patch: null };
    patch = Number(bits[2]);
    if (Number.isNaN(patch)) return null;
  }
  return { major, minor, patch };
}

function toVersion(major: number, minor: number | null, patch: number | null): Version {
  return { major, minor: minor ?? 0, patch: patch ?? 0, prerelease: "", raw: `${major}.${minor ?? 0}.${patch ?? 0}` };
}

/** Expand a single range token into comparators. */
export function expandToken(token: string): Comparator[] {
  const trimmed = token.trim();
  if (trimmed === "" || WILDCARD_RE.test(trimmed)) return [];

  const match = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(trimmed);
  if (!match) return [];
  const op = match[1] ?? "";
  const body = match[2]!.trim();
  const partial = parsePartial(body);
  if (!partial) return [];

  const base = toVersion(partial.major, partial.minor, partial.patch);

  if (op === "^") {
    const lower: Comparator = { op: ">=", version: base };
    let upper: Version;
    if (partial.minor === null || partial.patch === null) {
      // `^1` or `^1.2` — treat like `~` on the specified parts.
      upper = partial.minor === null ? { ...toVersion(partial.major + 1, 0, 0), raw: "" } : toVersion(partial.major + 1, 0, 0);
    } else if (partial.major !== 0) {
      upper = toVersion(partial.major + 1, 0, 0);
    } else if (partial.minor !== 0) {
      upper = toVersion(0, partial.minor + 1, 0);
    } else {
      upper = toVersion(0, 0, partial.patch + 1);
    }
    return [lower, { op: "<", version: upper }];
  }

  if (op === "~") {
    const lower: Comparator = { op: ">=", version: base };
    const upper = partial.minor === null ? toVersion(partial.major + 1, 0, 0) : toVersion(partial.major, partial.minor + 1, 0);
    return [lower, { op: "<", version: upper }];
  }

  if (op === "" || op === "=") {
    if (partial.minor === null) {
      return [
        { op: ">=", version: base },
        { op: "<", version: toVersion(partial.major + 1, 0, 0) },
      ];
    }
    if (partial.patch === null) {
      return [
        { op: ">=", version: base },
        { op: "<", version: toVersion(partial.major, partial.minor + 1, 0) },
      ];
    }
    return [{ op: "=", version: base }];
  }

  return [{ op: op as Comparator["op"], version: base }];
}

const ZERO: Version = { major: 0, minor: 0, patch: 0, prerelease: "", raw: "0.0.0" };

/** Split a range into alternative comparator sets (OR of ANDs). */
export function parseRange(range: string): Comparator[][] {
  return range
    .split("||")
    .map((alternative) => alternative.replace(/\s+-\s+/g, " - ").trim())
    .filter((alternative) => alternative.length > 0)
    .map((alternative) => {
      const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(alternative);
      if (hyphen) {
        const low = parsePartial(hyphen[1]!);
        const high = parsePartial(hyphen[2]!);
        const comparators: Comparator[] = [];
        if (low) comparators.push({ op: ">=", version: toVersion(low.major, low.minor, low.patch) });
        if (high) comparators.push({ op: "<=", version: toVersion(high.major, high.minor, high.patch) });
        return comparators;
      }
      return alternative
        .split(/\s+/)
        .filter((token) => token.length > 0)
        .flatMap((token) => expandToken(token));
    });
}

function satisfiesComparators(version: Version, comparators: Comparator[]): boolean {
  for (const comparator of comparators) {
    const cmp = compareVersions(version, comparator.version);
    switch (comparator.op) {
      case ">":
        if (cmp <= 0) return false;
        break;
      case ">=":
        if (cmp < 0) return false;
        break;
      case "<":
        if (cmp >= 0) return false;
        break;
      case "<=":
        if (cmp > 0) return false;
        break;
      case "=":
        if (cmp !== 0) return false;
        break;
    }
  }
  return true;
}

export function satisfies(versionInput: string, range: string): boolean {
  const version = parseVersion(versionInput);
  if (!version) return false;
  const sets = parseRange(range);
  if (sets.length === 0) return true; // `*`
  return sets.some((set) => satisfiesComparators(version, set));
}

export interface Interval {
  min: Version;
  max: Version | null;
}

/** Lower/upper bound of a comparator set. */
export function intervalOf(comparators: Comparator[]): Interval {
  let min: Version = ZERO;
  let max: Version | null = null;

  const raise = (candidate: Version) => {
    if (compareVersions(candidate, min) > 0) min = candidate;
  };
  const lower = (candidate: Version) => {
    if (max === null || compareVersions(candidate, max) < 0) max = candidate;
  };

  for (const { op, version } of comparators) {
    switch (op) {
      case ">=":
        raise(version);
        break;
      case ">":
        // Smallest version strictly greater than the bound, at patch granularity.
        raise(nextPatch(version));
        break;
      case "=":
        raise(version);
        lower(nextPatch(version));
        break;
      case "<":
      case "<=":
        lower(version);
        break;
    }
  }
  return { min, max };
}

function nextPatch(version: Version): Version {
  return { major: version.major, minor: version.minor, patch: version.patch + 1, prerelease: "", raw: "" };
}

/**
 * Does the declared range possibly resolve to a version inside `vulnerableRange`?
 * Returns `"no"`, `"yes"` (lower bound is already vulnerable) or `"maybe"`
 * (the range spans vulnerable versions but resolves higher or is open-ended).
 */
export function rangeIntersectsVulnerable(
  declaredRange: string,
  vulnerableRange: string,
): { result: "no" | "yes" | "maybe"; vulnerableFloor: string } {
  const declaredSets = parseRange(declaredRange);
  const vulnerableSets = parseRange(vulnerableRange);
  const vulnerableIntervals = vulnerableSets.map(intervalOf);
  const vulnerableFloor = vulnerableIntervals
    .map((interval) => interval.min)
    .reduce((acc, current) => (compareVersions(current, acc) < 0 ? current : acc), ZERO);

  if (declaredSets.length === 0) return { result: "maybe", vulnerableFloor: vulnerableFloor.raw };

  let best: "no" | "yes" | "maybe" = "no";
  for (const set of declaredSets) {
    const declared = intervalOf(set);
    for (const vulnerable of vulnerableIntervals) {
      if (!intervalsOverlap(declared, vulnerable)) continue;
      const lowerBoundVulnerable = compareVersions(declared.min, vulnerable.min) >= 0 && (vulnerable.max === null || compareVersions(declared.min, vulnerable.max) < 0);
      if (lowerBoundVulnerable) return { result: "yes", vulnerableFloor: vulnerableFloor.raw };
      best = "maybe";
    }
  }
  return { result: best, vulnerableFloor: vulnerableFloor.raw };
}

function intervalsOverlap(a: Interval, b: Interval): boolean {
  const aMinVsBMax = b.max === null ? -1 : compareVersions(a.min, b.max);
  if (aMinVsBMax >= 0) return false;
  const bMinVsAMax = a.max === null ? -1 : compareVersions(b.min, a.max);
  if (bMinVsAMax >= 0) return false;
  return true;
}

/** True when the declared range is a wildcard/`latest` style range. */
export function isWildcardRange(range: string): boolean {
  const trimmed = range.trim();
  if (trimmed === "" || trimmed === "latest" || trimmed === "*" || trimmed === "x") return true;
  return parseRange(trimmed).every((set) => set.length === 0);
}

/** True when a range pins an exact version. */
export function isExactVersion(range: string): boolean {
  return /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(range.trim());
}
