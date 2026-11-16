import type { Finding, Rule, Severity } from "../types.js";

export const DOCS_BASE = "https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md";

/** Anchor used in docs/rules.md for a rule id. */
export function ruleAnchor(ruleId: string): string {
  return ruleId.replace(/[/.]/g, "").toLowerCase();
}

export function docsLink(ruleId: string): string {
  return `${DOCS_BASE}#${ruleAnchor(ruleId)}`;
}

export type FindingDraft = Omit<Finding, "ruleId" | "category" | "severity" | "title" | "why" | "docsUrl"> &
  Partial<Pick<Finding, "severity" | "title" | "why" | "docsUrl">>;

/**
 * Build a finding factory bound to a rule, so every finding inherits the
 * rule's id, category, default severity and documentation link.
 */
export function createFinder(rule: Rule): (draft: FindingDraft) => Finding {
  return (draft) => ({
    ruleId: rule.id,
    category: rule.category,
    severity: draft.severity ?? rule.severity,
    title: draft.title ?? rule.title,
    message: draft.message,
    why: draft.why ?? rule.description,
    suggestion: draft.suggestion,
    docsUrl: draft.docsUrl ?? docsLink(rule.id),
    ...(draft.file !== undefined ? { file: draft.file } : {}),
    ...(draft.line !== undefined ? { line: draft.line } : {}),
    ...(draft.evidence !== undefined ? { evidence: draft.evidence } : {}),
    ...(draft.fix !== undefined ? { fix: draft.fix } : {}),
    ...(draft.meta !== undefined ? { meta: draft.meta } : {}),
  });
}

/** True when text looks like a placeholder rather than a real value. */
export function looksLikePlaceholder(value: string): boolean {
  const normalised = value.toLowerCase();
  const placeholders = [
    "example",
    "sample",
    "placeholder",
    "your_",
    "your-",
    "yourkey",
    "xxx",
    "changeme",
    "change_me",
    "change-me",
    "dummy",
    "fake",
    "test_",
    "test-",
    "redacted",
    "todo",
    "fixme",
    "lorem",
    "1234",
    "abcd",
    "secret_here",
    "***",
    "${",
    "${{",
    "%s",
    "<",
    "process.env",
    "os.environ",
    "getenv",
    "env(",
    "settings.",
    "config.",
    "import.meta",
  ];
  if (placeholders.some((placeholder) => normalised.includes(placeholder))) return true;
  // A value with only one distinct character (e.g. "aaaaaaaaaaaa") is not a secret.
  if (new Set(value).size <= 2) return true;
  return false;
}

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];
