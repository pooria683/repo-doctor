import type { ScanResult, Severity } from "../types.js";

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  orange: "\u001b[38;5;208m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  gray: "\u001b[90m",
  green: "\u001b[32m",
  cyan: "\u001b[36m",
};

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: ANSI.red,
  high: ANSI.orange,
  medium: ANSI.yellow,
  low: ANSI.blue,
  info: ANSI.gray,
};

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "✖",
  high: "✖",
  medium: "▲",
  low: "•",
  info: "·",
};

export interface ConsoleOptions {
  color?: boolean;
  verbose?: boolean;
  maxPerSeverity?: number;
}

function makePainter(enabled: boolean) {
  return (text: string, ...codes: string[]): string => (enabled ? `${codes.join("")}${text}${ANSI.reset}` : text);
}

/** Human-friendly terminal output: summary first, then findings by severity. */
export function renderConsole(result: ScanResult, options: ConsoleOptions = {}): string {
  const paint = makePainter(options.color ?? false);
  const max = options.maxPerSeverity ?? 10;
  const lines: string[] = [];

  lines.push("");
  lines.push(paint(`  Repo Doctor`, ANSI.bold) + paint(`  ${result.target.displayPath}`, ANSI.dim));
  lines.push("");

  const scoreColor = result.summary.score >= 80 ? ANSI.green : result.summary.score >= 60 ? ANSI.yellow : ANSI.red;
  lines.push(
    `  Health  ${paint(`${String(result.summary.score).padStart(3)}/100`, ANSI.bold, scoreColor)}  ${paint(
      `(${result.summary.grade})`,
      scoreColor,
    )}   ${paint(`${result.summary.filesScanned} files · ${result.summary.rulesRun} rules · ${result.summary.durationMs}ms`, ANSI.dim)}`,
  );
  lines.push("");

  // Category bar chart.
  for (const category of result.categories) {
    if (category.rulesRun === 0) continue;
    const filled = Math.round(category.score / 5);
    const bar = "█".repeat(filled) + "░".repeat(20 - filled);
    const color = category.score >= 80 ? ANSI.green : category.score >= 60 ? ANSI.yellow : ANSI.red;
    lines.push(`  ${category.label.padEnd(16)} ${paint(bar, color)} ${String(category.score).padStart(3)}`);
  }
  lines.push("");

  const visible = result.findings.filter((finding) => finding.severity !== "info" || options.verbose);
  if (visible.length === 0) {
    lines.push(paint("  ✓ No findings. This repository is in good shape.", ANSI.green));
    lines.push("");
  }

  for (const severity of ["critical", "high", "medium", "low"] as Severity[]) {
    const group = visible.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    lines.push(`  ${paint(`${SEVERITY_ICON[severity]} ${severity.toUpperCase()} (${group.length})`, ANSI.bold, SEVERITY_COLOR[severity])}`);
    for (const finding of group.slice(0, max)) {
      const where = finding.file ? paint(` ${finding.file}${finding.line ? `:${finding.line}` : ""}`, ANSI.dim) : "";
      lines.push(`    ${paint(finding.title, SEVERITY_COLOR[severity])}${where}`);
      lines.push(`      ${paint(finding.ruleId, ANSI.dim)} — ${truncateText(finding.message, 110)}`);
    }
    if (group.length > max) {
      lines.push(`    ${paint(`… and ${group.length - max} more (use --verbose to see all)`, ANSI.dim)}`);
    }
    lines.push("");
  }

  if (result.fixes.length > 0) {
    lines.push(`  ${paint(`${result.fixes.length} safe fix(es) available`, ANSI.bold, ANSI.cyan)} ${paint("→ npx repo-doctor fix --dry-run", ANSI.dim)}`);
    lines.push("");
  }

  const counts = result.summary.counts;
  lines.push(
    paint(
      `  ${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low · ${counts.info} info`,
      ANSI.dim,
    ),
  );
  if (result.warnings.length > 0) {
    for (const warning of result.warnings) lines.push(paint(`  ! ${warning}`, ANSI.yellow));
  }
  lines.push("");

  return lines.join("\n");
}

function truncateText(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + "…";
}
