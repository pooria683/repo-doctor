import assert from "node:assert/strict";
import test from "node:test";

import { compare, isExactVersion, isWildcardRange, parseVersion, rangeIntersectsVulnerable, satisfies } from "../src/util/semver.js";

test("semver: parsing and comparison", () => {
  assert.equal(parseVersion("1.2.3")?.major, 1);
  assert.equal(parseVersion("v2.0.0")?.minor, 0);
  assert.equal(parseVersion("not-a-version"), null);
  assert.ok(compare("1.2.3", "1.2.4") < 0);
  assert.ok(compare("2.0.0", "1.99.99") > 0);
  assert.equal(compare("1.0.0", "1.0.0"), 0);
});

test("semver: caret and tilde ranges", () => {
  assert.equal(satisfies("1.5.0", "^1.2.0"), true);
  assert.equal(satisfies("2.0.0", "^1.2.0"), false);
  assert.equal(satisfies("0.2.5", "^0.2.3"), true);
  assert.equal(satisfies("0.3.0", "^0.2.3"), false);
  assert.equal(satisfies("1.2.9", "~1.2.3"), true);
  assert.equal(satisfies("1.3.0", "~1.2.3"), false);
});

test("semver: operators, wildcards and exact pins", () => {
  assert.equal(satisfies("2.5.0", ">=2.0.0"), true);
  assert.equal(satisfies("1.9.0", ">=2.0.0"), false);
  assert.equal(satisfies("1.0.0", "*"), true);
  assert.equal(satisfies("4.17.20", "<4.17.21"), true);
  assert.equal(satisfies("4.17.21", "<4.17.21"), false);
  assert.equal(satisfies("1.2.3", "=1.2.3"), true);
  assert.equal(satisfies("1.2.3", "1.2.3"), true);
  assert.equal(isWildcardRange("*"), true);
  assert.equal(isWildcardRange("latest"), true);
  assert.equal(isWildcardRange("^1.0.0"), false);
  assert.equal(isExactVersion("1.2.3"), true);
  assert.equal(isExactVersion("^1.2.3"), false);
});

test("semver: range intersection with vulnerabilities", () => {
  // Pinned below the fix.
  assert.equal(rangeIntersectsVulnerable("=4.17.0", "<4.17.21").result, "yes");
  // Range spans the vulnerable window.
  assert.equal(rangeIntersectsVulnerable("^4.17.0", "<4.17.21").result, "yes");
  assert.equal(rangeIntersectsVulnerable("^5.0.0", "<4.17.21").result, "no");
  assert.equal(rangeIntersectsVulnerable(">=4.17.21", "<4.17.21").result, "no");
  // Exact version at the fixed release is safe.
  assert.equal(rangeIntersectsVulnerable("=4.17.21", "<4.17.21").result, "no");
  // A pinned version inside the range.
  assert.equal(rangeIntersectsVulnerable("=1.26.0", "<2.0.7").result, "yes");
  // An open-ended range that includes vulnerable versions.
  const open = rangeIntersectsVulnerable(">1.0.0", "<2.0.7");
  assert.ok(open.result === "maybe" || open.result === "yes");
});

test("semver: pyproject/requirements operator spellings are normalised upstream", () => {
  assert.equal(satisfies("2.0.0", "~2.0"), true);
  assert.equal(satisfies("3.0.0", "~2.0"), false);
});
