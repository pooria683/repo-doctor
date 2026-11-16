import assert from "node:assert/strict";
import test from "node:test";

import { makeFixture, scanFixture } from "./helpers.js";

test("ci: workflow with pull_request_target, unpinned actions and injection is caught", async () => {
  const fixture = makeFixture({
    ".github/workflows/ci.yml": [
      "name: CI",
      "on: [pull_request_target]",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@main",
      "        with:",
      "          ref: ${{ github.event.pull_request.head.sha }}",
      "      - run: echo \"${{ github.event.pull_request.title }}\"",
    ].join("\n"),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const ids = result.findings.map((finding) => finding.ruleId);
    assert.ok(ids.includes("ci/pull-request-target-checkout"), "pr target checkout");
    assert.ok(ids.includes("ci/action-unpinned"), "unpinned action");
    assert.ok(ids.includes("ci/script-injection"), "script injection");
    assert.ok(ids.includes("ci/workflow-permissions-missing"), "missing permissions");
    assert.ok(!ids.includes("ci/workflow-missing"), "a workflow exists");
  } finally {
    fixture.cleanup();
  }
});

test("ci: pinned actions with permissions produce no CI security findings", async () => {
  const fixture = makeFixture({
    ".github/workflows/ci.yml": [
      "name: CI",
      "on:",
      "  push:",
      "    branches: [main]",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683",
      "      - run: npm test",
    ].join("\n"),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const ciFindings = result.findings.filter((finding) => finding.category === "ci");
    const securityIds = ciFindings
      .map((finding) => finding.ruleId)
      .filter((id) => ["ci/action-unpinned", "ci/script-injection", "ci/pull-request-target-checkout", "ci/workflow-permissions-missing"].includes(id));
    assert.deepEqual(securityIds, []);
  } finally {
    fixture.cleanup();
  }
});

test("ci: missing CI is reported once with a fix", async () => {
  const fixture = makeFixture({ "package.json": JSON.stringify({ name: "x", scripts: { test: "node --test" } }) });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "ci/workflow-missing");
    assert.ok(finding);
    assert.equal(finding!.severity, "high");
    assert.equal(finding!.fix?.id, "add-ci-workflow");
  } finally {
    fixture.cleanup();
  }
});

test("ci: write-all permissions outrank a missing block", async () => {
  const fixture = makeFixture({
    ".github/workflows/deploy.yml": ["on: push", "permissions: write-all", "jobs:", "  a:", "    runs-on: ubuntu-latest", "    steps:", "      - run: echo hi"].join("\n"),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "ci/workflow-permissions-missing");
    // `permissions:` exists at the top level, so the rule stays quiet, but the
    // token scope is still visible in the report through the meta of other rules.
    assert.equal(finding, undefined);
  } finally {
    fixture.cleanup();
  }
});
