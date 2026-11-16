import type { ScanResult } from "../types.js";

/** Serialize a scan result. Stable key order, two-space indent. */
export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2) + "\n";
}

/** Compact single-line output for pipelines that just want a status code. */
export function renderJsonCompact(result: ScanResult): string {
  return JSON.stringify({
    schemaVersion: result.schemaVersion,
    score: result.summary.score,
    grade: result.summary.grade,
    counts: result.summary.counts,
    totalFindings: result.summary.totalFindings,
  });
}

/** Parse a previously written report, rejecting anything that is not ours. */
export function parseReport(text: string): ScanResult {
  const parsed = JSON.parse(text) as Partial<ScanResult>;
  if (!parsed.schemaVersion || !parsed.summary || !Array.isArray(parsed.findings)) {
    throw new Error("Not a repo-doctor report: missing schemaVersion, summary or findings.");
  }
  return parsed as ScanResult;
}
