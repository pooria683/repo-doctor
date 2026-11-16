import path from "node:path";

import type { RuleContext } from "../types.js";

export type Language = "node" | "python" | "go" | "rust" | "ruby" | "php" | "unknown";

export interface ProjectInfo {
  /** Best-effort project name (manifest name, else directory name). */
  name: string;
  description: string;
  /** GitHub `owner/repo` when derivable from the git remote. */
  owner?: string;
  slug?: string;
  repoUrl?: string;
  languages: Language[];
  license: string;
  copyrightHolder: string;
  /** Indentation used by the repository, inferred from existing files. */
  indent: "  " | "    " | "\t";
  defaultBranch: string;
}

function detectLanguages(ctx: RuleContext): Language[] {
  const found: Language[] = [];
  const has = (globs: string[]) => ctx.find(globs).length > 0;
  if (ctx.exists("package.json") || has(["**/*.js", "**/*.ts", "**/*.mjs", "**/*.jsx", "**/*.tsx"])) found.push("node");
  if (ctx.exists("pyproject.toml") || ctx.exists("requirements.txt") || has(["**/*.py"])) found.push("python");
  if (ctx.exists("go.mod") || has(["**/*.go"])) found.push("go");
  if (ctx.exists("Cargo.toml") || has(["**/*.rs"])) found.push("rust");
  if (ctx.exists("Gemfile") || has(["**/*.rb"])) found.push("ruby");
  if (ctx.exists("composer.json") || has(["**/*.php"])) found.push("php");
  return found.length > 0 ? found : ["unknown"];
}

function detectIndent(ctx: RuleContext): ProjectInfo["indent"] {
  const candidates = ctx.find(["*.json", "*.yml", "*.yaml"]).slice(0, 5);
  for (const file of candidates) {
    const content = ctx.readFile(file, 64 * 1024);
    if (!content) continue;
    for (const line of content.split("\n").slice(1, 40)) {
      if (!line.trim()) continue;
      if (line.startsWith("\t")) return "\t";
      const spaces = /^( +)/.exec(line)?.[1]?.length ?? 0;
      if (spaces >= 4) return "    ";
      if (spaces === 2) return "  ";
      break;
    }
  }
  return "  ";
}

export function describeProject(ctx: RuleContext): ProjectInfo {
  const fromPkg = ctx.pkg?.name;
  const repoField = ctx.pkg?.repository;
  const repoUrlFromPkg = typeof repoField === "string" ? repoField : repoField?.url;
  const name = fromPkg ?? path.basename(ctx.root) ?? "project";
  const slug = ctx.git.slug;
  const owner = slug?.split("/")[0];
  const repoUrl = slug ? `https://github.com/${slug}` : repoUrlFromPkg?.replace(/^git\+/, "").replace(/\.git$/, "");

  return {
    name,
    description: ctx.pkg?.description ?? "",
    owner,
    slug,
    repoUrl,
    languages: detectLanguages(ctx),
    license: ctx.config.license,
    copyrightHolder: ctx.config.copyrightHolder || owner || "The Authors",
    indent: detectIndent(ctx),
    defaultBranch: ctx.git.branch && ctx.git.branch !== "HEAD" ? ctx.git.branch : "main",
  };
}

/** Human label for the primary stack, used in generated docs. */
export function stackLabel(info: ProjectInfo): string {
  const labels: Record<Language, string> = {
    node: "Node.js / TypeScript",
    python: "Python",
    go: "Go",
    rust: "Rust",
    ruby: "Ruby",
    php: "PHP",
    unknown: "general",
  };
  return info.languages.map((language) => labels[language]).join(", ");
}
