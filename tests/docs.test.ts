import assert from "node:assert/strict";
import test from "node:test";

import { detectLicenseId } from "../src/rules/docs.js";
import { HEALTHY_DOCS, makeFixture, scanFixture } from "./helpers.js";

test("docs: a missing README is a high-severity finding with a fix", async () => {
  const fixture = makeFixture({ "src/index.ts": "export const x = 1;\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "docs/readme-missing");
    assert.ok(finding);
    assert.equal(finding!.severity, "high");
    assert.equal(finding!.fix?.id, "add-readme");
    assert.ok(result.fixes.some((fix) => fix.id === "add-readme"));
  } finally {
    fixture.cleanup();
  }
});

test("docs: a thin README is flagged for missing sections", async () => {
  const fixture = makeFixture({ "README.md": "# project\n\nNothing here yet.\n" });
  try {
    const { result } = await scanFixture(fixture.root);
    const findings = result.findings.filter((candidate) => candidate.ruleId === "docs/readme-thin");
    assert.ok(findings.length >= 1);
    const sectionFinding = findings.find((candidate) => candidate.meta?.["missingSections"]);
    assert.ok(sectionFinding, "reports which sections are missing");
    const missing = sectionFinding!.meta!["missingSections"] as string[];
    assert.ok(missing.includes("install"));
    assert.ok(missing.includes("usage"));
  } finally {
    fixture.cleanup();
  }
});

test("docs: a complete README passes", async () => {
  const fixture = makeFixture(HEALTHY_DOCS);
  try {
    const { result } = await scanFixture(fixture.root);
    const docsFindings = result.findings.filter((candidate) => candidate.category === "documentation");
    assert.deepEqual(
      docsFindings.map((finding) => finding.ruleId),
      [],
      `unexpected docs findings: ${docsFindings.map((finding) => finding.ruleId).join(", ")}`,
    );
  } finally {
    fixture.cleanup();
  }
});

test("docs: license detection recognizes common licenses", () => {
  assert.equal(detectLicenseId("Permission is hereby granted, free of charge, to any person"), "MIT");
  assert.equal(detectLicenseId("Apache License\nVersion 2.0, January 2004"), "Apache-2.0");
  assert.equal(detectLicenseId("GNU AFFERO GENERAL PUBLIC LICENSE"), "AGPL-3.0");
  assert.equal(detectLicenseId("This is my own custom license text"), undefined);
});

test("docs: a custom license file is reported as unrecognized", async () => {
  const fixture = makeFixture({ "LICENSE": "You may use this software if you ask me nicely and send me a postcard from your city." });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "docs/license-unrecognized");
    assert.ok(finding);
  } finally {
    fixture.cleanup();
  }
});

test("docs: package.json license mismatch with the LICENSE file is reported", async () => {
  const fixture = makeFixture({
    "package.json": JSON.stringify({ name: "x", version: "1.0.0", license: "Apache-2.0" }),
    LICENSE: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find(
      (candidate) => candidate.ruleId === "docs/license-metadata-missing" && /Apache-2.0/.test(candidate.message),
    );
    assert.ok(finding, "mismatch reported");
  } finally {
    fixture.cleanup();
  }
});
