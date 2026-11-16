import { ALL_RULES } from "../rules/index.js";
import type { ScanResult, Severity } from "../types.js";

/**
 * SARIF 2.1.0 output so results show up in GitHub code scanning,
 * VS Code and any other SARIF consumer.
 */
export interface SarifLog {
  $schema: string;
  version: "2.1.0";
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          fullDescription: { text: string };
          helpUri?: string;
          defaultConfiguration: { level: string };
          properties: { category: string; tags: string[] };
        }>;
      };
    };
    results: Array<{
      ruleId: string;
      ruleIndex: number;
      level: string;
      message: { text: string };
      locations?: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region?: { startLine: number };
        };
      }>;
      partialFingerprints: { "repoDoctorFindingHash/v1": string };
      properties: Record<string, unknown>;
    }>;
    invocations: Array<{ executionSuccessful: boolean; endTimeUtc: string }>;
    properties: { score: number; grade: string };
  }>;
}

function sarifLevel(severity: Severity): "error" | "warning" | "note" {
  if (severity === "critical" || severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "note";
}

function hash(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i++) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function renderSarif(result: ScanResult): string {
  const usedRuleIds = [...new Set(result.findings.map((finding) => finding.ruleId))];
  const ruleIndex = new Map(usedRuleIds.map((id, index) => [id, index]));

  const rules = usedRuleIds.map((id) => {
    const rule = ALL_RULES.find((candidate) => candidate.id === id);
    const finding = result.findings.find((candidate) => candidate.ruleId === id)!;
    return {
      id,
      name: id.replace(/[/.]/g, "-"),
      shortDescription: { text: rule?.title ?? finding.title },
      fullDescription: { text: rule?.description ?? finding.why },
      ...(finding.docsUrl ? { helpUri: finding.docsUrl } : {}),
      defaultConfiguration: { level: sarifLevel(finding.severity) },
      properties: { category: finding.category, tags: rule?.tags ?? [finding.category] },
    };
  });

  const sarif: SarifLog = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: result.tool.name,
            version: result.tool.version,
            informationUri: "https://github.com/pooria683/repo-doctor",
            rules,
          },
        },
        results: result.findings.map((finding) => ({
          ruleId: finding.ruleId,
          ruleIndex: ruleIndex.get(finding.ruleId) ?? 0,
          level: sarifLevel(finding.severity),
          message: { text: `${finding.message} ${finding.suggestion}` },
          ...(finding.file
            ? {
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: finding.file },
                      ...(finding.line ? { region: { startLine: finding.line } } : {}),
                    },
                  },
                ],
              }
            : {}),
          partialFingerprints: {
            "repoDoctorFindingHash/v1": hash(`${finding.ruleId}:${finding.file ?? ""}:${finding.title}`),
          },
          properties: {
            severity: finding.severity,
            category: finding.category,
            ...(finding.meta ?? {}),
          },
        })),
        invocations: [{ executionSuccessful: true, endTimeUtc: result.generatedAt }],
        properties: { score: result.summary.score, grade: result.summary.grade },
      },
    ],
  };

  return JSON.stringify(sarif, null, 2) + "\n";
}
