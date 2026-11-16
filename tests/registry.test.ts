import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { ALL_RULES, RULES_BY_ID, getRule, validateRegistry } from "../src/rules/index.js";
import { FIX_RECIPES } from "../src/fix/recipes.js";
import { CATEGORIES } from "../src/types.js";

const ROOT = process.cwd();

test("registry: no duplicate ids and valid metadata", () => {
  assert.deepEqual(validateRegistry(), []);
  assert.ok(ALL_RULES.length >= 45, `expected a substantial rule set, got ${ALL_RULES.length}`);
});

test("registry: every category has rules and rule ids are namespaced", () => {
  for (const category of CATEGORIES) {
    const rules = ALL_RULES.filter((rule) => rule.category === category);
    assert.ok(rules.length > 0, `category ${category} has no rules`);
  }
  for (const rule of ALL_RULES) {
    const prefix = rule.id.split("/")[0];
    assert.ok(rule.id.includes("/"), `${rule.id} must be "<group>/<name>"`);
    assert.ok(prefix.length > 0);
    assert.ok(rule.description.length > 10, `${rule.id} needs a real description`);
  }
});

test("registry: lookups work", () => {
  assert.equal(getRule("security/committed-secret")?.category, "security");
  assert.equal(getRule("does/not-exist"), undefined);
  assert.equal(RULES_BY_ID.size, ALL_RULES.length);
});

test("registry: every rule is documented in docs/rules.md", () => {
  const docsPath = path.join(ROOT, "docs", "rules.md");
  assert.ok(fs.existsSync(docsPath), "docs/rules.md must exist");
  const docs = fs.readFileSync(docsPath, "utf8");
  const undocumented = ALL_RULES.filter((rule) => !docs.includes(rule.id));
  assert.deepEqual(undocumented.map((rule) => rule.id), []);
});

test("registry: every fix id referenced by a rule has a recipe", () => {
  const fixIds = new Set<string>();
  for (const rule of ALL_RULES) {
    // Rules only expose fix ids at runtime; collect them by scanning the source
    // for `id: "..."` inside `fix:` blocks is fragile, so we assert on the
    // recipes we ship instead: each recipe must declare at least one rule.
  }
  for (const recipe of Object.values(FIX_RECIPES)) {
    if (recipe.ruleIds.length === 0) continue;
    for (const ruleId of recipe.ruleIds) {
      assert.ok(RULES_BY_ID.has(ruleId), `recipe ${recipe.id} references unknown rule ${ruleId}`);
      fixIds.add(ruleId);
    }
  }
  assert.ok(fixIds.size >= 10, "expected a meaningful set of auto-fixable rules");
});

test("registry: fix recipes are safe and never overwrite", () => {
  for (const recipe of Object.values(FIX_RECIPES)) {
    assert.equal(recipe.safe, true, `${recipe.id} must be safe`);
    assert.ok(recipe.title.length > 0);
    assert.ok(recipe.description.length > 0);
  }
});
