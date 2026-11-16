import assert from "node:assert/strict";
import test from "node:test";

import { runScan } from "../src/core/engine.js";
import { resolveConfig } from "../src/core/config.js";
import { parseReport } from "../src/report/json.js";
import { renderMarkdown } from "../src/report/markdown.js";
import { renderSarif } from "../src/report/sarif.js";
import { renderJson } from "../src/report/json.js";
import { ALL_RULES } from "../src/rules/index.js";
import { HEALTHY_DOCS, makeFixture, scanFixture } from "./helpers.js";

test("engine: result has a stable, complete shape", async () => {
  const fixture = makeFixture({ ...HEALTHY_DOCS, "src/a.js": "export const a = 1;\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    assert.equal(result.schemaVersion, "1.0.0");
    assert.equal(result.tool.name, "repo-doctor");
    assert.equal(result.generatedAt, "2025-01-01T00:00:00.000Z");
    assert.ok(result.categories.length === 7);
    assert.equal(typeof result.summary.score, "number");
    assert.ok(["A", "B", "C", "D", "F"].includes(result.summary.grade));
    assert.equal(Array.isArray(result.findings), true);
    assert.equal(Array.isArray(result.fixes), true);
    // Round-trips through JSON without losing anything.
    const reparsed = parseReport(renderJson(result));
    assert.equal(reparsed.summary.score, result.summary.score);
  } finally {
    fixture.cleanup();
  }
});

test("engine: findings are sorted by severity and carry required fields", async () => {
  const fixture = makeFixture({
    "src/a.js": 'const key = "AKIAIOSFODNN7EXAMPLE";\n',
    "README.md": "# x\n",
    "Dockerfile": "FROM node:latest\n",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const order = ["critical", "high", "medium", "low", "info"];
    const ranks = result.findings.map((finding) => order.indexOf(finding.severity));
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
    for (const finding of result.findings) {
      assert.ok(finding.ruleId.includes("/"), "rule id is namespaced");
      assert.ok(finding.message.length > 0);
      assert.ok(finding.why.length > 0);
      assert.ok(finding.suggestion.length > 0);
      assert.ok(finding.docsUrl?.startsWith("https://"));
    }
  } finally {
    fixture.cleanup();
  }
});

test("engine: a single failing rule is contained and reported as a warning", async () => {
  const fixture = makeFixture({ "README.md": "# ok\n" });
  const exploding = {
    id: "docs/explodes",
    title: "Exploding rule",
    category: "documentation" as const,
    severity: "high" as const,
    description: "test rule",
    run() {
      throw new Error("boom");
    },
  };
  try {
    const { result } = await scanFixture(fixture.root, { rules: [exploding] });
    assert.equal(result.findings.length, 0);
    assert.ok(result.warnings.some((warning) => warning.includes("docs/explodes") && warning.includes("boom")));
  } finally {
    fixture.cleanup();
  }
});

test("engine: rules can be disabled and severities overridden via config", async () => {
  const fixture = makeFixture({ "src/a.js": "let x = 1;\n" });
  try {
    const { result } = await scanFixture(fixture.root, {
      config: {
        rules: {
          "docs/readme-missing": "off",
          "docs/license-missing": { severity: "info" },
        },
      },
    });
    assert.equal(result.findings.some((finding) => finding.ruleId === "docs/readme-missing"), false);
    const license = result.findings.find((finding) => finding.ruleId === "docs/license-missing");
    assert.equal(license?.severity, "info");
    assert.ok(result.config.disabledRules.includes("docs/readme-missing"));
  } finally {
    fixture.cleanup();
  }
});

test("engine: ignore globs and info filtering work", async () => {
  const fixture = makeFixture({
    "vendor/lodash/package.json": JSON.stringify({ name: "lodash", dependencies: { minimist: "1.0.0" } }),
    "src/a.js": "export const a = 1;\n",
  });
  try {
    const ignored = await scanFixture(fixture.root, { config: { ignore: ["vendor/**"] } });
    assert.equal(ignored.result.target.filesScanned, 1);

    const noInfo = await scanFixture(fixture.root, { config: { includeInfo: false } });
    assert.equal(noInfo.result.findings.some((finding) => finding.severity === "info"), false);
  } finally {
    fixture.cleanup();
  }
});

test("engine: scanning the same repository twice produces identical findings", async () => {
  const fixture = makeFixture({ "src/a.js": 'const key = "AKIAIOSFODNN7EXAMPLE";\n', Dockerfile: "FROM node:latest\n" });
  try {
    const first = await scanFixture(fixture.root);
    const second = await scanFixture(fixture.root);
    assert.deepEqual(
      first.result.findings.map((finding) => `${finding.ruleId}:${finding.file}:${finding.line}`),
      second.result.findings.map((finding) => `${finding.ruleId}:${finding.file}:${finding.line}`),
    );
  } finally {
    fixture.cleanup();
  }
});

test("engine: a healthy repository scores well and has no high findings", async () => {
  const fixture = makeFixture({
    ...HEALTHY_DOCS,
    "package.json": JSON.stringify({
      name: "healthy",
      version: "1.0.0",
      description: "A healthy repository",
      repository: { type: "git", url: "https://github.com/example/healthy" },
      license: "MIT",
      keywords: ["test"],
      engines: { node: ">=20" },
      scripts: { test: "node --test", lint: "eslint .", format: "prettier --write .", typecheck: "tsc --noEmit" },
      dependencies: { lodash: "^4.17.21" },
    }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
    ".gitignore": ".env\nnode_modules/\n*.log\n.DS_Store\n*.pem\n.idea/\n",
    ".editorconfig": "root = true\n",
    ".prettierrc": "{\"tabWidth\": 2}\n",
    ".eslintrc": "{\"rules\": {}}\n",
    ".github/workflows/ci.yml": [
      "on: [push, pull_request]",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
      "      - run: npm test",
    ].join("\n"),
    ".github/dependabot.yml": "version: 2\n",
    ".github/CODEOWNERS": "* @example\n",
    ".github/ISSUE_TEMPLATE/bug_report.yml": "name: Bug\n",
    ".github/PULL_REQUEST_TEMPLATE.md": "## Checklist\n",
    "CHANGELOG.md": "# Changelog\n",
    "tests/a.test.js": "test('a', () => {});\n",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const bad = result.findings.filter((finding) => finding.severity === "critical" || finding.severity === "high");
    assert.deepEqual(bad.map((finding) => `${finding.ruleId}: ${finding.message}`), []);
    assert.ok(result.summary.score >= 90, `expected score >= 90, got ${result.summary.score}`);
  } finally {
    fixture.cleanup();
  }
});

test("report: markdown and sarif render without crashing and contain the score", async () => {
  const fixture = makeFixture({ "src/a.js": 'const key = "AKIAIOSFODNN7EXAMPLE";\n', "README.md": "# x\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    const markdown = renderMarkdown(result);
    assert.match(markdown, /Repo Doctor Report/);
    assert.match(markdown, new RegExp(`${result.summary.score}/100`));
    assert.match(markdown, /## Suggested fixes|## 🔴 Critical/);

    const sarif = JSON.parse(renderSarif(result)) as {
      version: string;
      runs: Array<{ tool: { driver: { rules: unknown[] } }; results: Array<{ ruleId: string; level: string }> }>;
    };
    assert.equal(sarif.version, "2.1.0");
    assert.equal(sarif.runs[0]!.results.length, result.findings.length);
    assert.ok(sarif.runs[0]!.tool.driver.rules.length > 0);
    assert.ok(sarif.runs[0]!.results.every((entry) => ["error", "warning", "note"].includes(entry.level)));
    // Secrets are masked in every format.
    assert.equal(markdown.includes("AKIAIOSFODNN7EXAMPLE"), false);
    assert.equal(JSON.stringify(sarif).includes("AKIAIOSFODNN7EXAMPLE"), false);
  } finally {
    fixture.cleanup();
  }
});

test("engine: every rule can run against an empty repository without throwing", async () => {
  const fixture = makeFixture({});
  try {
    const { result } = await runScan({ root: fixture.root, config: resolveConfig({}), rules: ALL_RULES });
    assert.deepEqual(result.warnings.filter((warning) => warning.includes("failed")), []);
  } finally {
    fixture.cleanup();
  }
});
