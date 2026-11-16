import assert from "node:assert/strict";
import test from "node:test";

import { categoryScore, computeScores, gradeOf, meetsFailThreshold, sortFindings } from "../src/core/score.js";
import { resolveConfig } from "../src/core/config.js";
import type { Category, Finding } from "../src/types.js";

function finding(severity: Finding["severity"], ruleId = "docs/readme-missing", category: Category = "documentation"): Finding {
  return {
    ruleId,
    category,
    severity,
    title: "t",
    message: "m",
    why: "w",
    suggestion: "s",
  };
}

test("score: a clean category scores 100", () => {
  assert.equal(categoryScore([]), 100);
});

test("score: severity weights are applied", () => {
  assert.equal(categoryScore([finding("critical")]), 60);
  assert.equal(categoryScore([finding("high")]), 85);
  assert.equal(categoryScore([finding("medium")]), 94);
  assert.equal(categoryScore([finding("low")]), 98);
  assert.equal(categoryScore([finding("info")]), 100);
});

test("score: repeated hits from one rule are capped at three", () => {
  const once = categoryScore([finding("medium")]);
  const many = categoryScore(Array.from({ length: 20 }, () => finding("medium")));
  const three = categoryScore(Array.from({ length: 3 }, () => finding("medium")));
  assert.equal(many, three);
  assert.ok(once > many);
});

test("score: never goes below zero", () => {
  const findings = ["a", "b", "c", "d"].map((id) => finding("critical", `security/${id}`, "security"));
  assert.equal(categoryScore(findings), 0);
});

test("score: grades map to familiar bands", () => {
  assert.equal(gradeOf(95), "A");
  assert.equal(gradeOf(90), "A");
  assert.equal(gradeOf(85), "B");
  assert.equal(gradeOf(72), "C");
  assert.equal(gradeOf(61), "D");
  assert.equal(gradeOf(20), "F");
});

test("score: overall score is a weighted mean of category scores", () => {
  const config = resolveConfig({ weights: { security: 1, documentation: 1 } });
  const rulesRunByCategory = Object.fromEntries(
    ["documentation", "security", "dependencies", "quality", "containers", "ci", "community"].map((category) => [category, 1]),
  ) as Record<Category, number>;

  const { summary, categories } = computeScores({
    findings: [finding("critical", "security/leak", "security")],
    rulesRunByCategory,
    config,
    durationMs: 5,
    filesScanned: 10,
  });

  assert.equal(categories.find((entry) => entry.category === "security")!.score, 60);
  assert.equal(categories.find((entry) => entry.category === "documentation")!.score, 100);
  assert.ok(summary.score < 100 && summary.score > 60);
  assert.equal(summary.counts.critical, 1);
});

test("score: fail thresholds respect severity ordering", () => {
  const findings = [finding("medium")];
  assert.equal(meetsFailThreshold(findings, "high"), false);
  assert.equal(meetsFailThreshold(findings, "medium"), true);
  assert.equal(meetsFailThreshold(findings, "low"), true);
  assert.equal(meetsFailThreshold(findings, "never"), false);
  assert.equal(meetsFailThreshold([finding("critical")], "critical"), true);
});

test("score: sorting is deterministic and severity-first", () => {
  const input = [finding("low"), finding("critical"), finding("medium"), finding("high")];
  const sorted = sortFindings(input);
  assert.deepEqual(sorted.map((entry) => entry.severity), ["critical", "high", "medium", "low"]);
  // Stable for equal severities, and the input array is untouched.
  assert.equal(input[0]!.severity, "low");
});
