import type { Category, Rule } from "../types.js";
import { CATEGORIES } from "../types.js";
import { communityRules } from "./community.js";
import { containerRules } from "./containers.js";
import { dependencyRules } from "./deps.js";
import { docsRules } from "./docs.js";
import { githubRules } from "./github.js";
import { qualityRules } from "./quality.js";
import { secretRules } from "./secrets.js";

/**
 * The rule catalogue. Ordering only affects report order; severity sorting
 * happens later. New rules must be added here and to docs/rules.md.
 */
export const ALL_RULES: Rule[] = [
  ...docsRules,
  ...secretRules,
  ...dependencyRules,
  ...qualityRules,
  ...containerRules,
  ...githubRules,
  ...communityRules,
];

export const RULES_BY_ID: Map<string, Rule> = new Map(ALL_RULES.map((rule) => [rule.id, rule]));

export function getRule(id: string): Rule | undefined {
  return RULES_BY_ID.get(id);
}

export function rulesByCategory(category: Category): Rule[] {
  return ALL_RULES.filter((rule) => rule.category === category);
}

/** Rules that are enabled by default (all of them; config can disable). */
export function defaultRules(): Rule[] {
  return ALL_RULES;
}

export interface RegistryProblem {
  kind: "duplicate-id" | "unknown-category" | "empty-title";
  detail: string;
}

/** Self-check used by tests and by `repo-doctor rules --validate`. */
export function validateRegistry(rules: Rule[] = ALL_RULES): RegistryProblem[] {
  const problems: RegistryProblem[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) problems.push({ kind: "duplicate-id", detail: rule.id });
    seen.add(rule.id);
    if (!(CATEGORIES as readonly string[]).includes(rule.category)) {
      problems.push({ kind: "unknown-category", detail: `${rule.id}: ${rule.category}` });
    }
    if (!rule.title || rule.title.trim().length === 0) {
      problems.push({ kind: "empty-title", detail: rule.id });
    }
    if (!rule.id.includes("/")) {
      problems.push({ kind: "unknown-category", detail: `${rule.id}: rule ids must be "<category>/<name>"` });
    }
  }
  return problems;
}
