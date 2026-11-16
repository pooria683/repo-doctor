import {
  CATEGORIES,
  CATEGORY_LABELS,
  SEVERITIES,
  SEVERITY_WEIGHT,
  type Category,
  type CategoryScore,
  type Finding,
  type ResolvedConfig,
  type ScanSummary,
  type Severity,
} from "../types.js";

/** Maximum penalty a single rule can contribute, no matter how many hits. */
const REPEAT_CAP = 3;

export function emptyCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts = emptyCounts();
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/**
 * Category score = 100 − Σ (severity weight × min(occurrences, 3)), floored at 0.
 * Repeated hits from the same rule count at most three times so that one noisy
 * rule cannot zero out an otherwise healthy category.
 */
export function categoryScore(findings: Finding[]): number {
  const perRule = new Map<string, number>();
  for (const finding of findings) {
    perRule.set(finding.ruleId, (perRule.get(finding.ruleId) ?? 0) + 1);
  }
  let penalty = 0;
  for (const [ruleId, count] of perRule) {
    const worst = findings
      .filter((finding) => finding.ruleId === ruleId)
      .reduce<Severity>((acc, finding) => (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[acc] ? finding.severity : acc), "info");
    penalty += SEVERITY_WEIGHT[worst] * Math.min(count, REPEAT_CAP);
  }
  return Math.max(0, Math.round(100 - penalty));
}

export function gradeOf(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

export interface ScoreInput {
  findings: Finding[];
  rulesRunByCategory: Record<Category, number>;
  config: ResolvedConfig;
  durationMs: number;
  filesScanned: number;
}

export interface ScoreOutput {
  summary: ScanSummary;
  categories: CategoryScore[];
}

/** Compute the overall health score and per-category breakdown. */
export function computeScores(input: ScoreInput): ScoreOutput {
  const { findings, rulesRunByCategory, config } = input;

  const categories: CategoryScore[] = [];
  for (const category of CATEGORIES) {
    const categoryFindings = findings.filter((finding) => finding.category === category);
    const score = categoryScore(categoryFindings);
    categories.push({
      category,
      label: CATEGORY_LABELS[category],
      score,
      grade: gradeOf(score),
      counts: countBySeverity(categoryFindings),
      findings: categoryFindings.length,
      rulesRun: rulesRunByCategory[category] ?? 0,
    });
  }

  const activeCategories = categories.filter((entry) => entry.rulesRun > 0);
  const weightSum = activeCategories.reduce((sum, entry) => sum + (config.weights[entry.category] ?? 1), 0);
  const weighted = activeCategories.reduce((sum, entry) => sum + entry.score * (config.weights[entry.category] ?? 1), 0);
  const score = weightSum > 0 ? Math.round(weighted / weightSum) : 100;

  const counts = countBySeverity(findings);
  const rulesFailed = new Set(findings.map((finding) => finding.ruleId)).size;
  const rulesRun = Object.values(rulesRunByCategory).reduce((sum, count) => sum + count, 0);

  return {
    summary: {
      score,
      grade: gradeOf(score),
      counts,
      totalFindings: findings.length,
      rulesRun,
      rulesFailed,
      filesScanned: input.filesScanned,
      durationMs: input.durationMs,
      topPriorities: findings
        .filter((finding) => finding.severity === "critical" || finding.severity === "high")
        .slice(0, 5)
        .map((finding) => `${finding.title}${finding.file ? ` (${finding.file})` : ""}`),
    },
    categories,
  };
}

/** Deterministic severity-aware ordering for reports. */
export function sortFindings(findings: Finding[]): Finding[] {
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...findings].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.ruleId !== b.ruleId) return a.ruleId.localeCompare(b.ruleId);
    const fileA = a.file ?? "";
    const fileB = b.file ?? "";
    if (fileA !== fileB) return fileA.localeCompare(fileB);
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

/** True when a finding at or above `threshold` exists. */
export function meetsFailThreshold(findings: Finding[], threshold: Severity | "never"): boolean {
  if (threshold === "never") return false;
  const limit = SEVERITIES.indexOf(threshold);
  return findings.some((finding) => SEVERITIES.indexOf(finding.severity) <= limit);
}

export const SEVERITY_LIST = SEVERITIES;
