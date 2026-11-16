import assert from "node:assert/strict";
import test from "node:test";

import { runScan } from "../src/core/engine.js";
import { resolveConfig } from "../src/core/config.js";
import { SECRET_PATTERNS, scanForSecrets } from "../src/rules/secrets.js";
import { buildContext } from "../src/core/context.js";
import { maskSecret, shannonEntropy } from "../src/util/text.js";
import { makeFixture, scanFixture } from "./helpers.js";

// Realistic-looking but fake credentials used only in tests.
const AWS_KEY = "AKIAIOSFODNN7EXAMPLE";
const GITHUB_TOKEN = "ghp_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const STRIPE_KEY = "sk_live_" + "4eC39HqLyjWDarjtT1zdp7dc";
const PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----";

test("secrets: detects cloud, VCS and payment credentials", () => {
  const fixture = makeFixture({
    "src/config.js": `const a = "${AWS_KEY}";\nconst b = "${GITHUB_TOKEN}";\nconst c = "${STRIPE_KEY}";\n`,
    "deploy/keys.env": PRIVATE_KEY,
  });
  try {
    const { ctx } = buildContext(fixture.root, resolveConfig({}));
    const hits = scanForSecrets(ctx, ctx.files);
    const ids = new Set(hits.map((hit) => hit.pattern.id));
    assert.ok(ids.has("aws-access-key"), "aws key detected");
    assert.ok(ids.has("github-token"), "github token detected");
    assert.ok(ids.has("stripe-key"), "stripe key detected");
    assert.ok(ids.has("private-key"), "private key detected");
  } finally {
    fixture.cleanup();
  }
});

test("secrets: placeholders and references are not reported", () => {
  const fixture = makeFixture({
    "src/example.js": [
      'const apiKey = "your_api_key_here";',
      'const token = process.env.API_TOKEN;',
      'const password = "changeme";',
      'const secret = "aaaaaaaaaaaaaaaaaaaa";',
      'const apiKey2 = "${API_KEY}";',
      'password: os.environ["DB_PASSWORD"],',
    ].join("\n"),
  });
  try {
    const { ctx } = buildContext(fixture.root, resolveConfig({}));
    const hits = scanForSecrets(ctx, ctx.files);
    assert.equal(hits.length, 0, `expected no hits, got: ${hits.map((hit) => hit.pattern.id).join(",")}`);
  } finally {
    fixture.cleanup();
  }
});

test("secrets: the raw value never appears in findings", async () => {
  const fixture = makeFixture({
    "src/app.js": `export const key = "${AWS_KEY}";\n`,
  });
  try {
    const { result } = await runScan({ root: fixture.root, config: resolveConfig({}) });
    const serialized = JSON.stringify(result);
    assert.ok(result.findings.length > 0, "a finding was produced");
    assert.equal(serialized.includes(AWS_KEY), false, "raw secret must not be serialized");
    const finding = result.findings.find((candidate) => candidate.ruleId === "security/committed-secret");
    assert.ok(finding);
    assert.match(finding!.evidence ?? "", /sha256:[0-9a-f]{8}/);
    assert.match(finding!.evidence ?? "", /\*{3,}/);
  } finally {
    fixture.cleanup();
  }
});

test("secrets: maskSecret keeps a shape hint but hides the body", () => {
  const masked = maskSecret(AWS_KEY);
  assert.ok(masked.startsWith("AKIA"));
  assert.equal(masked.includes("IOSFODNN7EXAMPLE"), false);
  assert.match(masked, /\(\d+ chars, sha256:[0-9a-f]{8}\)/);
  // Deterministic: same secret, same fingerprint.
  assert.equal(maskSecret(AWS_KEY), maskSecret(AWS_KEY));
});

test("secrets: entropy helper rewards random strings", () => {
  assert.ok(shannonEntropy("a1B2c3D4e5F6g7H8") > shannonEntropy("aaaaaaaaaaaaaaaa"));
});

test("secrets: every pattern has an id, label and regex", () => {
  for (const pattern of SECRET_PATTERNS) {
    assert.ok(pattern.id.length > 0);
    assert.ok(pattern.label.length > 0);
    assert.ok(pattern.regex instanceof RegExp);
  }
});

test("secrets: test fixtures are downgraded, not hidden", async () => {
  const fixture = makeFixture({
    "tests/fixtures/config.js": `const key = "${AWS_KEY}";\n`,
    ".gitignore": "node_modules\n",
  });
  try {
    const { result } = await scanFixture(fixture.root);
    const finding = result.findings.find((candidate) => candidate.ruleId === "security/committed-secret");
    assert.ok(finding);
    assert.equal(finding!.severity, "low");
  } finally {
    fixture.cleanup();
  }
});
