import type { Ecosystem } from "../../data/index.js";
import type { RuleContext } from "../../types.js";

export interface DeclaredDependency {
  name: string;
  /** Version constraint exactly as written in the manifest. */
  range: string;
  ecosystem: Ecosystem;
  /** Manifest that declared it. */
  file: string;
  /** Line number inside the manifest, when cheaply available. */
  line?: number;
  /** True for dev-only dependencies. */
  dev: boolean;
}

const REQUIREMENTS_GLOBS = ["requirements*.txt", "**/requirements*.txt"];
const PYPROJECT_GLOBS = ["pyproject.toml", "**/pyproject.toml"];
const CARGO_GLOBS = ["Cargo.toml", "**/Cargo.toml"];
const GO_MOD_GLOBS = ["go.mod", "**/go.mod"];
const GEMFILE_GLOBS = ["Gemfile", "**/Gemfile"];
const COMPOSER_GLOBS = ["composer.json", "**/composer.json"];
const PIPFILE_GLOBS = ["Pipfile"];

/** Skip vendored / fixture manifests that would produce noise. */
function isNoisePath(file: string): boolean {
  return /(^|\/)(node_modules|vendor|fixtures?|__fixtures__|testdata|examples?|samples?)\//.test(file);
}

export function manifestFiles(ctx: RuleContext): string[] {
  const patterns = [...REQUIREMENTS_GLOBS, ...PYPROJECT_GLOBS, ...CARGO_GLOBS, ...GO_MOD_GLOBS, ...GEMFILE_GLOBS, ...COMPOSER_GLOBS, ...PIPFILE_GLOBS, "package.json"];
  return ctx.find(patterns).filter((file) => !isNoisePath(file));
}

function stripRequirementMarkers(spec: string): { name: string; range: string } | null {
  let value = spec.trim();
  if (value.length === 0 || value.startsWith("#") || value.startsWith("-")) return null;
  // Drop environment markers and inline comments.
  value = value.split(";")[0]!.split("#")[0]!.trim();
  if (value.length === 0) return null;
  // PEP 508 direct references: name @ https://...
  const directRef = /^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*@\s*(\S+)$/.exec(value);
  if (directRef) return { name: directRef[1]!, range: directRef[2]! };
  const match = /^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?\s*(===|==|>=|<=|~=|!=|>|<)?\s*(.*)$/.exec(value);
  if (!match) return null;
  const name = match[1]!;
  const operator = match[2] ?? "";
  const version = (match[3] ?? "").trim();
  if (!operator || version.length === 0) return { name, range: "*" };
  return { name, range: `${operator}${version}` };
}

function parseRequirementsTxt(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    // Handle line continuations minimally: only single-line requirements.
    const parsed = stripRequirementMarkers(line);
    if (!parsed) return;
    deps.push({ name: parsed.name, range: parsed.range, ecosystem: "pypi", file, line: index + 1, dev: /dev|test/i.test(file) });
  });
  return deps;
}

function parsePyproject(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  const lines = content.split("\n");
  let section = "";
  let collectingArray = false;

  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    const sectionMatch = /^\s*\[([^\]]+)\]/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim().toLowerCase();
      collectingArray = false;
      return;
    }
    if (/^\s*dependencies\s*=\s*\[/.test(line)) {
      collectingArray = true;
      // Inline single-line array: dependencies = ["requests>=2"]
      const inline = /\[(.*)\]/.exec(line)?.[1] ?? "";
      for (const match of inline.matchAll(/["']([^"']+)["']/g)) {
        const parsed = stripRequirementMarkers(match[1]!);
        if (parsed) deps.push({ name: parsed.name, range: parsed.range, ecosystem: "pypi", file, line: index + 1, dev: section.includes("dev") || section.includes("test") });
      }
      if (/\]/.test(line)) collectingArray = false;
      return;
    }
    if (collectingArray) {
      if (/^\s*\]/.test(line)) {
        collectingArray = false;
        return;
      }
      for (const match of line.matchAll(/["']([^"']+)["']/g)) {
        const parsed = stripRequirementMarkers(match[1]!);
        if (parsed) deps.push({ name: parsed.name, range: parsed.range, ecosystem: "pypi", file, line: index + 1, dev: section.includes("dev") || section.includes("test") });
      }
      return;
    }
    // Poetry / PDM table style: requests = "^2.31"
    if (section.includes("poetry") && section.includes("dependencies")) {
      const poetry = /^\s*([A-Za-z0-9._-]+)\s*=\s*["']([^"']+)["']/.exec(line);
      if (poetry && poetry[1]!.toLowerCase() !== "python") {
        deps.push({ name: poetry[1]!, range: poetry[2]!, ecosystem: "pypi", file, line: index + 1, dev: false });
      }
      const poetryTable = /^\s*([A-Za-z0-9._-]+)\s*=\s*\{[^}]*version\s*=\s*["']([^"']+)["']/.exec(line);
      if (poetryTable && poetryTable[1]!.toLowerCase() !== "python") {
        deps.push({ name: poetryTable[1]!, range: poetryTable[2]!, ecosystem: "pypi", file, line: index + 1, dev: false });
      }
    }
  });
  return deps;
}

function parseCargo(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  let section = "";
  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    const sectionMatch = /^\s*\[([^\]]+)\]/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.trim().toLowerCase();
      return;
    }
    const isDepSection =
      section === "dependencies" || section === "dev-dependencies" || section === "build-dependencies" || section === "workspace.dependencies";
    if (!isDepSection) return;
    const table = /^\s*([A-Za-z0-9._-]+)\s*=\s*\{([^}]*)\}/.exec(line);
    if (table) {
      const version = /version\s*=\s*["']([^"']+)["']/.exec(table[2]!)?.[1];
      const git = /git\s*=/.test(table[2]!) || /path\s*=/.test(table[2]!);
      deps.push({ name: table[1]!, range: version ?? (git ? "*" : "*"), ecosystem: "cargo", file, line: index + 1, dev: section.includes("dev") });
      return;
    }
    const simple = /^\s*([A-Za-z0-9._-]+)\s*=\s*["']([^"']+)["']/.exec(line);
    if (simple) {
      deps.push({ name: simple[1]!, range: simple[2]!, ecosystem: "cargo", file, line: index + 1, dev: section.includes("dev") });
    }
  });
  return deps;
}

function parseGoMod(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  const lines = content.split("\n");
  let inRequire = false;
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    if (/^\s*require\s*\(/.test(line)) {
      inRequire = true;
      return;
    }
    if (inRequire && /^\s*\)/.test(line)) {
      inRequire = false;
      return;
    }
    const single = /^\s*require\s+(\S+)\s+(v\S+)/.exec(line);
    const blockLine = inRequire ? /^\s*(\S+)\s+(v\S+)/.exec(line) : null;
    const match = single ?? blockLine;
    if (!match) return;
    deps.push({ name: match[1]!, range: match[2]!, ecosystem: "go", file, line: index + 1, dev: false });
  });
  return deps;
}

function parseGemfile(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    if (/^\s*#/.test(line)) return;
    const match = /^\s*gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/.exec(line);
    if (!match) return;
    deps.push({ name: match[1]!, range: match[2] ?? "*", ecosystem: "rubygems", file, line: index + 1, dev: /group\s*:\s*(development|test)/.test(line) });
  });
  return deps;
}

function parseComposer(content: string, file: string): DeclaredDependency[] {
  let parsed: { require?: Record<string, string>; "require-dev"?: Record<string, string> };
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return [];
  }
  const deps: DeclaredDependency[] = [];
  for (const [name, range] of Object.entries(parsed.require ?? {})) {
    if (name === "php" || name.startsWith("ext-")) continue;
    deps.push({ name, range, ecosystem: "composer", file, dev: false });
  }
  for (const [name, range] of Object.entries(parsed["require-dev"] ?? {})) {
    deps.push({ name, range, ecosystem: "composer", file, dev: true });
  }
  return deps;
}

function parsePipfile(content: string, file: string): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  let section = "";
  content.split("\n").forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, "");
    const sectionMatch = /^\s*\[([^\]]+)\]/.exec(line);
    if (sectionMatch) {
      section = sectionMatch[1]!.toLowerCase();
      return;
    }
    if (section !== "packages" && section !== "dev-packages") return;
    const match = /^\s*([A-Za-z0-9._-]+)\s*=\s*["']([^"']*)["']/.exec(line);
    if (!match) return;
    deps.push({ name: match[1]!, range: match[2] || "*", ecosystem: "pypi", file, line: index + 1, dev: section === "dev-packages" });
  });
  return deps;
}

function parsePackageJson(ctx: RuleContext, file: string): DeclaredDependency[] {
  const content = ctx.readFile(file, 512 * 1024);
  if (!content) return [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }
  const deps: DeclaredDependency[] = [];
  const sections: Array<[string, boolean]> = [
    ["dependencies", false],
    ["devDependencies", true],
    ["peerDependencies", false],
    ["optionalDependencies", false],
  ];
  for (const [section, dev] of sections) {
    const value = pkg[section];
    if (!value || typeof value !== "object") continue;
    for (const [name, range] of Object.entries(value as Record<string, string>)) {
      if (/^(file|link|workspace):/.test(range) || range.startsWith("npm:")) continue;
      deps.push({ name, range, ecosystem: "npm", file, dev });
    }
  }
  return deps;
}

/** Parse every dependency declaration we understand in the repository. */
export function collectDependencies(ctx: RuleContext): DeclaredDependency[] {
  const deps: DeclaredDependency[] = [];
  for (const file of manifestFiles(ctx)) {
    const base = file.slice(file.lastIndexOf("/") + 1);
    const content = ctx.readFile(file, 1024 * 1024);
    if (content === null) continue;
    switch (base) {
      case "package.json":
        deps.push(...parsePackageJson(ctx, file));
        break;
      case "pyproject.toml":
        deps.push(...parsePyproject(content, file));
        break;
      case "Cargo.toml":
        deps.push(...parseCargo(content, file));
        break;
      case "go.mod":
        deps.push(...parseGoMod(content, file));
        break;
      case "Gemfile":
        deps.push(...parseGemfile(content, file));
        break;
      case "composer.json":
        deps.push(...parseComposer(content, file));
        break;
      case "Pipfile":
        deps.push(...parsePipfile(content, file));
        break;
      default:
        if (/^requirements.*\.txt$/.test(base)) deps.push(...parseRequirementsTxt(content, file));
    }
  }
  return deps;
}

export const LOCKFILES: Partial<Record<Ecosystem, string[]>> = {
  npm: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "npm-shrinkwrap.json"],
  pypi: ["poetry.lock", "Pipfile.lock", "uv.lock", "pdm.lock", "requirements.lock"],
  cargo: ["Cargo.lock"],
  go: ["go.sum"],
  rubygems: ["Gemfile.lock"],
  composer: ["composer.lock"],
};

export function ecosystemManifestName(ecosystem: Ecosystem): string {
  switch (ecosystem) {
    case "npm":
      return "package.json";
    case "pypi":
      return "requirements.txt / pyproject.toml";
    case "cargo":
      return "Cargo.toml";
    case "go":
      return "go.mod";
    case "rubygems":
      return "Gemfile";
    case "composer":
      return "composer.json";
  }
}
