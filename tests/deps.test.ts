import assert from "node:assert/strict";
import test from "node:test";

import { buildContext } from "../src/core/context.js";
import { resolveConfig } from "../src/core/config.js";
import { collectDependencies } from "../src/rules/deps/parse.js";
import { normaliseRange } from "../src/rules/deps.js";
import { makeFixture, scanFixture } from "./helpers.js";

test("deps: npm manifests are parsed into declarations", () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({
      name: "x",
      dependencies: { lodash: "^4.17.20", express: "4.18.0" },
      devDependencies: { jest: "^29.0.0" },
      peerDependencies: { react: ">=18" },
    }),
  });
  try {
    const { ctx } = buildContext(fixture.root, resolveConfig({}));
    const deps = collectDependencies(ctx);
    const names = deps.map((dep) => dep.name).sort();
    assert.deepEqual(names, ["express", "jest", "lodash", "react"]);
    assert.equal(deps.find((dep) => dep.name === "jest")?.dev, true);
    assert.equal(deps.find((dep) => dep.name === "lodash")?.range, "^4.17.20");
  } finally {
    fixture.cleanup();
  }
});

test("deps: requirements.txt, pyproject and go.mod are parsed", () => {
  const fixture = makeFixture({
    "requirements.txt": [
      "# a comment",
      "requests==2.31.0",
      "urllib3>=1.26,<2",
      "pyyaml",
      "-r other.txt",
      'click==8.0.0; python_version < "3.9"',
    ].join("\n"),
    "pyproject.toml": [
      "[project]",
      'name = "x"',
      "dependencies = [",
      '  "fastapi>=0.100",',
      '  "pydantic==2.0.0",',
      "]",
      "",
      "[tool.poetry.dependencies]",
      'httpx = "^0.25"',
      'python = "^3.11"',
    ].join("\n"),
    "go.mod": ["module example.com/x", "", "require (", "\tgithub.com/gin-gonic/gin v1.8.0", "\tgolang.org/x/net v0.10.0", ")"].join("\n"),
  });
  try {
    const { ctx } = buildContext(fixture.root, resolveConfig({}));
    const deps = collectDependencies(ctx);
    const byName = new Map(deps.map((dep) => [dep.name, dep]));
    assert.equal(byName.get("requests")?.range, "==2.31.0");
    assert.equal(byName.get("pyyaml")?.range, "*");
    assert.equal(byName.get("fastapi")?.range, ">=0.100");
    assert.equal(byName.get("httpx")?.range, "^0.25");
    assert.equal(byName.has("python"), false);
    assert.equal(byName.get("golang.org/x/net")?.range, "v0.10.0");
    assert.equal(byName.get("golang.org/x/net")?.ecosystem, "go");
  } finally {
    fixture.cleanup();
  }
});

test("deps: operator normalisation per ecosystem", () => {
  assert.equal(normaliseRange("==2.31.0", "pypi"), "=2.31.0");
  assert.equal(normaliseRange("~=1.4", "pypi"), "~1.4");
  assert.equal(normaliseRange("v1.2.3", "go"), "1.2.3");
  assert.equal(normaliseRange("latest", "npm"), "*");
});

test("deps: known-vulnerable ranges produce findings with advisory metadata", async () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({ name: "x", dependencies: { lodash: "^4.17.0", pyyaml: "5.1" } }),
    "requirements.txt": "pyyaml==5.1\n",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const lodash = result.findings.find(
      (candidate) => candidate.ruleId === "deps/vulnerable-dependency" && candidate.meta?.["package"] === "lodash",
    );
    assert.ok(lodash);
    assert.equal(lodash!.severity, "high");
    assert.equal(lodash!.meta!["fixedVersion"], "4.17.21");
    assert.match(lodash!.docsUrl ?? "", /github\.com\/advisories/);

    const pyyaml = result.findings.find(
      (candidate) => candidate.ruleId === "deps/vulnerable-dependency" && candidate.meta?.["package"] === "pyyaml",
    );
    assert.ok(pyyaml, "python advisory matched");
    assert.equal(pyyaml!.severity, "critical");
  } finally {
    fixture.cleanup();
  }
});

test("deps: safe versions produce no advisory findings", async () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({ name: "x", dependencies: { lodash: "^4.17.21" } }),
    "package-lock.json": JSON.stringify({ lockfileVersion: 3 }),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const vulnerable = result.findings.filter((candidate) => candidate.ruleId === "deps/vulnerable-dependency");
    assert.deepEqual(vulnerable, []);
  } finally {
    fixture.cleanup();
  }
});

test("deps: missing lockfile, wildcard versions and deprecated packages are reported", async () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({
      name: "x",
      version: "1.0.0",
      dependencies: { request: "^2.88.0", something: "latest" },
    }),
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const ids = new Set(result.findings.map((finding) => finding.ruleId));
    assert.ok(ids.has("deps/lockfile-missing"));
    assert.ok(ids.has("deps/wildcard-version"));
    assert.ok(ids.has("deps/deprecated-dependency"));
  } finally {
    fixture.cleanup();
  }
});

test("deps: multiple lockfiles for one ecosystem are flagged", async () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({ name: "x", dependencies: { a: "1.0.0" } }),
    "package-lock.json": "{}",
    "yarn.lock": "# yarn lockfile v1\n",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    assert.ok(result.findings.some((finding) => finding.ruleId === "deps/multiple-lockfiles"));
  } finally {
    fixture.cleanup();
  }
});
