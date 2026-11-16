import assert from "node:assert/strict";
import test from "node:test";

import { expandBraces, globToRegExp, matchGlob } from "../src/util/glob.js";

test("glob: wildcards do not cross directory boundaries", () => {
  assert.equal(matchGlob("*.md", "README.md"), true);
  assert.equal(matchGlob("*.md", "docs/README.md"), false);
  assert.equal(matchGlob("docs/*.md", "docs/guide.md"), true);
  assert.equal(matchGlob("docs/*.md", "docs/nested/guide.md"), false);
});

test("glob: ** matches across directories", () => {
  assert.equal(matchGlob("**/*.test.ts", "src/a/b.test.ts"), true);
  assert.equal(matchGlob("**/*.test.ts", "b.test.ts"), true);
  assert.equal(matchGlob(".github/workflows/*.yml", ".github/workflows/ci.yml"), true);
  assert.equal(matchGlob("**/Dockerfile", "docker/Dockerfile"), true);
});

test("glob: bare file names match at any depth", () => {
  assert.equal(matchGlob("Dockerfile", "Dockerfile"), true);
  assert.equal(matchGlob("Dockerfile", "services/api/Dockerfile"), true);
  assert.equal(matchGlob("Dockerfile.*", "Dockerfile.prod"), true);
});

test("glob: brace expansion", () => {
  assert.deepEqual(expandBraces("*.{yml,yaml}"), ["*.yml", "*.yaml"]);
  assert.equal(matchGlob("*.{yml,yaml}", "deploy.yaml"), true);
  assert.equal(matchGlob("*.{yml,yaml}", "deploy.json"), false);
});

test("glob: character classes and question marks", () => {
  assert.equal(matchGlob("file?.txt", "file1.txt"), true);
  assert.equal(matchGlob("file?.txt", "file12.txt"), false);
  assert.equal(matchGlob("[abc].md", "a.md"), true);
  assert.equal(matchGlob("[!abc].md", "d.md"), true);
  assert.equal(matchGlob("[!abc].md", "a.md"), false);
});

test("glob: regex special characters in literals are escaped", () => {
  assert.equal(globToRegExp("a.b").test("aXb"), false);
  assert.equal(matchGlob("Cargo.toml", "Cargo.toml"), true);
});
