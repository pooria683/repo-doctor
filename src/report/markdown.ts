import type { CategoryScore, Finding, ScanResult, Severity } from "../types.js";

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "🔴 Critical",
  high: "🟠 High",
  medium: "🟡 Medium",
  low: "🔵 Low",
  info: "⚪ Info",
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

const GRADE_NOTE: Record<string, string> = {
  A: "healthy",
  B: "good",
  C: "needs work",
  D: "at risk",
  F: "critical",
};

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function code(value: string): string {
  return `\`${value.replace(/`/g, "\\`")}\``;
}

function location(finding: Finding): string {
  if (!finding.file) return "—";
  return finding.line ? `${code(finding.file)}:${finding.line}` : code(finding.file);
}

function categoryTable(categories: CategoryScore[]): string {
  const rows = categories.map(
    (category) =>
      `| ${category.label} | ${category.score} | ${category.grade} | ${category.counts.critical} | ${category.counts.high} | ${category.counts.medium} | ${category.counts.low} |`,
  );
  return [
    "| Area | Score | Grade | Critical | High | Medium | Low |",
    "| ---- | ----: | :---: | -------: | ---: | -----: | --: |",
    ...rows,
  ].join("\n");
}

function findingBlock(finding: Finding, index: number): string {
  const lines: string[] = [];
  const heading = `#### ${index}. ${SEVERITY_EMOJI[finding.severity]} ${finding.title}`;
  lines.push(heading, "");
  lines.push(`- **Rule:** ${code(finding.ruleId)} · **Severity:** ${SEVERITY_BADGE[finding.severity]} · **Area:** ${finding.category}`);
  lines.push(`- **Where:** ${location(finding)}`);
  lines.push(`- **What:** ${finding.message}`);
  if (finding.evidence) lines.push(`- **Evidence:** ${code(finding.evidence)}`);
  lines.push(`- **Why it matters:** ${finding.why}`);
  lines.push(`- **Fix:** ${finding.suggestion}`);
  if (finding.fix) {
    lines.push(`- **Automatic fix:** ${code(finding.fix.id)}${finding.fix.safe ? " (safe, creates files only)" : " (manual)"}`);
  }
  if (finding.docsUrl) lines.push(`- **Docs:** ${finding.docsUrl}`);
  lines.push("");
  return lines.join("\n");
}

export interface MarkdownOptions {
  /** Include info-level findings (default: true). */
  includeInfo?: boolean;
  /** Include the "How to fix everything" section. */
  includeNextSteps?: boolean;
}

/** Render a human-readable Markdown report. */
export function renderMarkdown(result: ScanResult, options: MarkdownOptions = {}): string {
  const includeInfo = options.includeInfo ?? true;
  const findings = result.findings.filter((finding) => includeInfo || finding.severity !== "info");
  const out: string[] = [];

  out.push("# 🩺 Repo Doctor Report", "");
  out.push(
    `**Target:** ${code(result.target.displayPath)} · **Score:** **${result.summary.score}/100** (${result.summary.grade} — ${
      GRADE_NOTE[result.summary.grade] ?? ""
    }) · **Files scanned:** ${result.summary.filesScanned} · **Rules run:** ${result.summary.rulesRun}`,
  );
  out.push("");

  const counts = result.summary.counts;
  out.push(
    `> ${SEVERITY_EMOJI.critical} **${counts.critical}** critical · ${SEVERITY_EMOJI.high} **${counts.high}** high · ${SEVERITY_EMOJI.medium} **${counts.medium}** medium · ${SEVERITY_EMOJI.low} **${counts.low}** low · ${SEVERITY_EMOJI.info} **${counts.info}** info`,
  );
  out.push("");

  if (result.summary.topPriorities.length > 0) {
    out.push("## Top priorities", "");
    result.summary.topPriorities.forEach((priority, index) => out.push(`${index + 1}. ${priority}`));
    out.push("");
  }

  out.push("## Health by area", "", categoryTable(result.categories), "");

  for (const severity of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    const group = findings.filter((finding) => finding.severity === severity);
    if (group.length === 0) continue;
    out.push(`## ${SEVERITY_BADGE[severity]} (${group.length})`, "");
    group.forEach((finding, index) => out.push(findingBlock(finding, index + 1)));
  }

  if (findings.length === 0) {
    out.push("## No findings 🎉", "", "Every rule passed. Keep the repository in this shape with the same scan in CI.", "");
  }

  if (result.fixes.length > 0 && options.includeNextSteps !== false) {
    out.push("## Suggested fixes", "");
    out.push("| Fix | What it does | Files | Safe |", "| --- | ------------ | ----- | :--: |");
    for (const fix of result.fixes) {
      out.push(
        `| ${code(fix.id)} | ${escapeCell(fix.description)} | ${fix.files.map((file) => code(file)).join("<br>") || "—"} | ${
          fix.safe ? "✅" : "manual"
        } |`,
      );
    }
    out.push("");
    out.push("```bash");
    out.push("# preview every change without touching the disk");
    out.push("npx repo-doctor fix --dry-run");
    out.push("```", "");
  }

  if (result.warnings.length > 0) {
    out.push("## Scan notes", "");
    for (const warning of result.warnings) out.push(`- ${warning}`);
    out.push("");
  }

  out.push("---", "");
  out.push(
    `Generated by **${result.tool.name} v${result.tool.version}** on ${result.generatedAt} · schema ${result.schemaVersion} · 100% offline, nothing was uploaded.`,
  );
  out.push("");
  return out.join("\n");
}
