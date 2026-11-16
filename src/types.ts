/**
 * Shared type contracts for Repo Doctor.
 *
 * These types are the public API of the tool: they are what rules produce,
 * what reports serialize, and what CI pipelines and coding agents consume.
 * Changing them is a breaking change and requires a schema version bump.
 */

export const SCHEMA_VERSION = "1.0.0";
export const TOOL_NAME = "repo-doctor";
export const TOOL_VERSION = "0.1.0";

/** Severity levels, ordered from most to least urgent. */
export const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Numeric weight of each severity. Used for scoring and sorting. */
export const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 40,
  high: 15,
  medium: 6,
  low: 2,
  info: 0,
};

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Rule categories. Each category is scored independently. */
export const CATEGORIES = [
  "documentation",
  "security",
  "dependencies",
  "quality",
  "containers",
  "ci",
  "community",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  documentation: "Documentation",
  security: "Security",
  dependencies: "Dependencies",
  quality: "Code quality",
  containers: "Containers",
  ci: "CI / automation",
  community: "Community",
};

/**
 * A suggested remediation attached to a finding.
 * `kind: "manual"` means a human must decide; nothing is auto-written.
 */
export interface SuggestedFix {
  /** Stable identifier of the fix plan, e.g. `add-contributing`. */
  id: string;
  kind: "create-file" | "append-line" | "manual";
  /** Relative path the fix targets, when applicable. */
  path?: string;
  /** Human description of what will be changed. */
  description: string;
  /** Content that would be written for `create-file` fixes. */
  content?: string;
  /** True when the fix is non-destructive (never overwrites user content). */
  safe: boolean;
}

/** A single problem detected in the scanned repository. */
export interface Finding {
  /** Unique rule identifier, e.g. `security/committed-secret`. */
  ruleId: string;
  /** Category bucket the rule belongs to. */
  category: Category;
  severity: Severity;
  /** Short, stable title (no target-specific data). */
  title: string;
  /** Target-specific explanation, may include file name and line. */
  message: string;
  /** Relative path (POSIX separators) the finding refers to. */
  file?: string;
  line?: number;
  /** Redacted evidence. Secrets are never included verbatim. */
  evidence?: string;
  /** Why this matters, shown in reports. */
  why: string;
  /** What to do about it. */
  suggestion: string;
  /** Optional link to rule documentation. */
  docsUrl?: string;
  /** Optional machine-readable remediation. */
  fix?: SuggestedFix;
  /** Extra structured data for agents (counts, versions, package names...). */
  meta?: Record<string, unknown>;
}

/** A rule definition. Rules are pure functions of the scan context. */
export interface Rule {
  id: string;
  title: string;
  category: Category;
  /** Default severity; overridable through config. */
  severity: Severity;
  /** Short description used by `rules` command and docs generation. */
  description: string;
  /** Link to docs/rules.md anchor. */
  docsUrl?: string;
  /** Only run when a file matching one of these globs exists. */
  requiresFile?: string[];
  /** Only run when none of these globs exist (cheap short-circuit). */
  requiresMissingFile?: string[];
  /** Free-form tags for filtering (`security`, `secrets`, `github`...). */
  tags?: string[];
  run(ctx: RuleContext): Finding[] | Promise<Finding[]>;
}

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  license?: string | { type?: string };
  repository?: string | { url?: string };
  homepage?: string;
  keywords?: string[];
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
  workspaces?: unknown;
  private?: boolean;
  files?: string[];
  [key: string]: unknown;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
  /** `owner/name` derived from the remote URL, when it is a GitHub URL. */
  slug?: string;
  trackedFiles: string[];
  commitCount?: number;
  /** Files with uncommitted changes (staged or not). */
  dirtyFiles?: string[];
  /** Files present on disk that git ignores or has not tracked yet. */
  untrackedFiles?: string[];
}

/** Everything a rule is allowed to touch. File-system access is mediated here. */
export interface RuleContext {
  /** Absolute path of the scanned repository root. */
  root: string;
  /** Relative POSIX paths of the candidate files (tracked or walked). */
  files: string[];
  /** Lower-cased relative path → actual relative path. */
  fileIndex: Map<string, string>;
  exists(relPath: string): boolean;
  /** Read a text file; returns null for missing/binary/oversized files. */
  readFile(relPath: string, maxBytes?: number): string | null;
  /** All files whose path matches a glob pattern. */
  find(patterns: string | string[]): string[];
  /** First existing path among candidates. */
  firstExisting(candidates: string[]): string | undefined;
  pkg: PackageJson | null;
  git: GitInfo;
  /** Resolved tool configuration. */
  config: ResolvedConfig;
  /** Lines of a file with 1-based line numbers, for regex scanning. */
  lines(relPath: string, maxBytes?: number): Array<{ number: number; text: string }>;
}

/** User-facing configuration (`.repodoctorrc.json` / CLI flags). */
export interface RepoDoctorConfig {
  /** Glob patterns to exclude from scanning. */
  ignore?: string[];
  /** Rule id → "off" | severity, or rule-level options. */
  rules?: Record<string, RuleSetting | "off" | Severity>;
  /** Fail the process when a finding at or above this severity exists. */
  failOn?: Severity | "never";
  /** Extra paths treated as sensitive files. */
  sensitiveFiles?: string[];
  /** Extra regexes treated as secret patterns (matched case-insensitively). */
  secretPatterns?: string[];
  /** Scoring weights per category (defaults to 1). */
  weights?: Partial<Record<Category, number>>;
  /** Include low-signal rules (`info`). Default true. */
  includeInfo?: boolean;
  /** Maximum number of files to scan. */
  maxFiles?: number;
  /** License SPDX id used by `fix` / `init` when creating a LICENSE. */
  license?: string;
  /** Copyright holder used when creating LICENSE. */
  copyrightHolder?: string;
}

export type RuleSetting =
  | { enabled?: boolean; severity?: Severity; options?: Record<string, unknown> }
  | Severity;

export interface ResolvedConfig extends RepoDoctorConfig {
  ignore: string[];
  rules: Record<string, { enabled: boolean; severity?: Severity; options: Record<string, unknown> }>;
  failOn: Severity | "never";
  sensitiveFiles: string[];
  secretPatterns: string[];
  weights: Record<Category, number>;
  includeInfo: boolean;
  maxFiles: number;
  license: string;
  copyrightHolder: string;
  /** Where the config came from, if any. */
  source?: string;
}

export interface CategoryScore {
  category: Category;
  label: string;
  score: number;
  grade: string;
  counts: Record<Severity, number>;
  findings: number;
  rulesRun: number;
}

export interface ScanSummary {
  score: number;
  grade: string;
  counts: Record<Severity, number>;
  totalFindings: number;
  rulesRun: number;
  rulesFailed: number;
  filesScanned: number;
  durationMs: number;
  topPriorities: string[];
}

export interface FixPlan {
  id: string;
  title: string;
  description: string;
  safe: boolean;
  ruleIds: string[];
  files: string[];
}

export interface ScanResult {
  schemaVersion: string;
  tool: { name: string; version: string };
  target: {
    path: string;
    /** Absolute path was requested; we only ever store a display path. */
    displayPath: string;
    git: {
      isRepo: boolean;
      branch?: string;
      remote?: string;
      slug?: string;
    };
    filesScanned: number;
  };
  generatedAt: string;
  config: {
    failOn: Severity | "never";
    ignoreCount: number;
    disabledRules: string[];
    configFile?: string;
  };
  summary: ScanSummary;
  categories: CategoryScore[];
  findings: Finding[];
  fixes: FixPlan[];
  /** Non-fatal problems encountered while scanning. */
  warnings: string[];
}

export type ReportFormat = "markdown" | "json" | "sarif" | "console";
