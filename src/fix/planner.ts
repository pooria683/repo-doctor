import fs from "node:fs";
import path from "node:path";

import { describeProject } from "../core/project.js";
import type { Finding, FixPlan, RuleContext } from "../types.js";
import { FIX_RECIPES, type FixFile, type FixRecipe } from "./recipes.js";

export interface PlannedFile extends FixFile {
  /** True when the file already exists and will not be touched. */
  exists: boolean;
}

export interface ExecutableFix {
  plan: FixPlan;
  recipe: FixRecipe;
  files: PlannedFile[];
}

/**
 * Turn findings into fix plans. Plans are deduplicated by fix id, so ten
 * findings pointing at the same missing file produce one plan.
 */
export function planFixes(findings: Finding[], ctx: RuleContext): FixPlan[] {
  const order: string[] = [];
  const byId = new Map<string, FixPlan>();

  for (const finding of findings) {
    const fix = finding.fix;
    if (!fix) continue;
    const recipe = FIX_RECIPES[fix.id];
    const existing = byId.get(fix.id);
    if (existing) {
      if (!existing.ruleIds.includes(finding.ruleId)) existing.ruleIds.push(finding.ruleId);
      continue;
    }
    order.push(fix.id);
    byId.set(fix.id, {
      id: fix.id,
      title: recipe?.title ?? fix.description,
      description: recipe?.description ?? fix.description,
      safe: recipe ? recipe.safe : fix.safe,
      ruleIds: [finding.ruleId],
      files: recipe ? safeFileList(recipe, ctx) : fix.path ? [fix.path] : [],
    });
  }
  return order.map((id) => byId.get(id)!);
}

function safeFileList(recipe: FixRecipe, ctx: RuleContext): string[] {
  try {
    return recipe.files(ctx, describeProject(ctx)).map((file) => file.path);
  } catch {
    return [];
  }
}

/** Expand plans into concrete files with content, marking collisions. */
export function executableFixes(plans: FixPlan[], ctx: RuleContext): ExecutableFix[] {
  const info = describeProject(ctx);
  const result: ExecutableFix[] = [];
  for (const plan of plans) {
    const recipe = FIX_RECIPES[plan.id];
    if (!recipe) continue;
    let files: PlannedFile[];
    try {
      files = recipe.files(ctx, info).map((file) => ({ ...file, exists: ctx.exists(file.path) }));
    } catch {
      // Recipes can fail on unsupported options (e.g. a license we cannot render).
      continue;
    }
    result.push({ plan, recipe, files });
  }
  return result;
}

/** Minimal unified-style diff for files that do not exist yet. */
export function formatNewFileDiff(path: string, content: string): string {
  const lines = content.replace(/\n$/, "").split("\n");
  const header = [`--- /dev/null`, `+++ b/${path}`, `@@ -0,0 +1,${lines.length} @@`];
  return [...header, ...lines.map((line) => `+${line}`)].join("\n");
}

export interface ApplyOptions {
  /** Absolute repository root. */
  root: string;
  /** When true, nothing is written. */
  dryRun: boolean;
  /** Allow overwriting existing files. Off by default and never used by the CLI. */
  force?: boolean;
}

export interface ApplyResult {
  written: string[];
  skipped: Array<{ path: string; reason: string }>;
}

/**
 * Write files for the given fixes. Existing files are never overwritten:
 * Repo Doctor only adds what is missing, which is what makes `--apply` safe.
 */
export function applyFixes(fixes: ExecutableFix[], options: ApplyOptions): ApplyResult {
  const result: ApplyResult = { written: [], skipped: [] };

  for (const fix of fixes) {
    for (const file of fix.files) {
      const absolute = path.join(options.root, file.path);
      if (fs.existsSync(absolute) && !options.force) {
        result.skipped.push({ path: file.path, reason: "already exists (Repo Doctor never overwrites user content)" });
        continue;
      }
      if (!options.dryRun) {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, file.content, "utf8");
      }
      result.written.push(file.path);
    }
  }
  return result;
}
