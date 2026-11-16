import fs from "node:fs";
import path from "node:path";

import type { Finding, Rule, RuleContext } from "../types.js";
import { createFinder } from "./helpers.js";

const TEST_GLOBS = [
  "**/*.test.*",
  "**/*.spec.*",
  "**/__tests__/**",
  "test/**",
  "tests/**",
  "spec/**",
  "**/test_*.py",
  "**/*_test.go",
  "**/*_test.rs",
  "**/tests/*.rs",
  "**/*Test.java",
  "**/*Tests.cs",
  "phpunit.xml",
  "phpunit.xml.dist",
];

const LINT_CONFIG_GLOBS = [
  ".eslintrc",
  ".eslintrc.*",
  "eslint.config.*",
  ".eslintignore",
  "ruff.toml",
  ".ruff.toml",
  ".flake8",
  "setup.cfg",
  "tox.ini",
  ".pylintrc",
  "pylintrc",
  ".golangci.yml",
  ".golangci.yaml",
  ".rubocop.yml",
  "phpcs.xml",
  "phpcs.xml.dist",
  ".stylelintrc*",
  ".markdownlint.*",
  "clippy.toml",
  ".checkstyle.xml",
  ".swiftlint.yml",
];

const FORMATTER_CONFIG_GLOBS = [
  ".prettierrc",
  ".prettierrc.*",
  "prettier.config.*",
  ".prettierignore",
  ".editorconfig",
  ".rustfmt.toml",
  "rustfmt.toml",
  ".clang-format",
  ".gofmt",
  "biome.json",
  "biome.jsonc",
  ".swift-format",
];

function hasScript(ctx: RuleContext, names: string[]): string | undefined {
  const scripts = ctx.pkg?.scripts ?? {};
  return names.find((name) => typeof scripts[name] === "string" && scripts[name]!.trim().length > 0);
}

function scriptValue(ctx: RuleContext, name: string): string {
  return ctx.pkg?.scripts?.[name] ?? "";
}

const testsMissing: Rule = {
  id: "quality/tests-missing",
  title: "No automated tests",
  category: "quality",
  severity: "high",
  description: "Automated tests are the safety net that makes contribution and refactoring possible.",
  tags: ["quality", "testing"],
  run(ctx) {
    const create = createFinder(testsMissing);
    const testFiles = ctx.find(TEST_GLOBS).filter((file) => !file.startsWith("docs/"));
    const testScript = hasScript(ctx, ["test", "tests", "test:unit"]);
    if (testFiles.length > 0 || testScript) return [];
    if (ctx.files.length < 3) return [];
    return [
      create({
        message: "No test files and no test script were found.",
        why: "Without tests, every pull request is reviewed on trust alone, regressions reach users, and newcomers have no way to verify their change.",
        suggestion: "Add a test framework (node:test / vitest / pytest / go test), a `npm test` style entry point, and run it in CI.",
        fix: {
          id: "add-test-scaffold",
          kind: "create-file",
          path: "tests/smoke.test.js",
          description: "Add a minimal smoke test file and a test script so CI has something to run.",
          safe: true,
        },
      }),
    ];
  },
};

const testScriptMissing: Rule = {
  id: "quality/test-script-missing",
  title: "package.json has no usable test script",
  category: "quality",
  severity: "medium",
  description: "A `test` script is how contributors and CI discover how to run the suite.",
  requiresFile: ["package.json"],
  tags: ["quality", "testing"],
  run(ctx) {
    const create = createFinder(testScriptMissing);
    const testFiles = ctx.find(TEST_GLOBS);
    if (testFiles.length === 0) return [];
    const value = scriptValue(ctx, "test").trim();
    if (value.length > 0 && !/no test specified/i.test(value)) return [];
    return [
      create({
        file: "package.json",
        message: value.length === 0 ? "package.json defines no `test` script although test files exist." : "The `test` script is still the npm placeholder.",
        evidence: value.length > 0 ? `"test": "${value}"` : undefined,
        why: "CI and contributors both call `npm test` by convention; without it the suite is effectively undiscoverable.",
        suggestion: "Point `test` at your runner (e.g. `node --test`, `vitest run`, `jest`) and add `test:watch` for local use.",
      }),
    ];
  },
};

const lintMissing: Rule = {
  id: "quality/lint-missing",
  title: "No linter configured",
  category: "quality",
  severity: "medium",
  description: "A linter catches unused variables, error-prone patterns and inconsistent APIs before review.",
  tags: ["quality", "consistency"],
  run(ctx) {
    const create = createFinder(lintMissing);
    const config = ctx.find(LINT_CONFIG_GLOBS);
    const lintScript = hasScript(ctx, ["lint", "lint:check", "eslint", "ruff"]);
    if (config.length > 0 || lintScript) return [];
    if (!ctx.pkg && ctx.find(["**/*.py", "**/*.go", "**/*.rs"]).length === 0) return [];
    return [
      create({
        message: "No linter configuration or lint script was found.",
        why: "Style and error-prone-pattern debates then land in code review, and whole classes of bugs (unused imports, shadowed variables, missing await) are missed.",
        suggestion: "Add a linter appropriate to your stack (ESLint, Ruff, golangci-lint, Clippy) plus a `lint` script, and run it in CI.",
      }),
    ];
  },
};

const formatterMissing: Rule = {
  id: "quality/formatter-missing",
  title: "No formatter configuration",
  category: "quality",
  severity: "low",
  description: "An enforced formatter keeps diffs small and review comments about code, not whitespace.",
  tags: ["quality", "consistency"],
  run(ctx) {
    const create = createFinder(formatterMissing);
    const config = ctx.find(FORMATTER_CONFIG_GLOBS);
    const formatScript = hasScript(ctx, ["format", "fmt", "prettier"]);
    if (config.length > 0 || formatScript) return [];
    if (!ctx.pkg && ctx.find(["**/*.py"]).length === 0) return [];
    return [
      create({
        message: "No formatter configuration or format script was found.",
        why: "Unformatted contributions create noisy diffs, merge conflicts and review comments that have nothing to do with logic.",
        suggestion: "Add Prettier (with .prettierrc), Ruff format / Black, or `cargo fmt`, plus a `format` script and a CI check.",
      }),
    ];
  },
};

const typecheckMissing: Rule = {
  id: "quality/typescript-not-strict",
  title: "TypeScript is configured without strict mode",
  category: "quality",
  severity: "low",
  description: "`strict: true` (or at least strictNullChecks) removes a large class of runtime errors.",
  requiresFile: ["tsconfig.json"],
  tags: ["quality", "type-safety"],
  run(ctx) {
    const create = createFinder(typecheckMissing);
    const content = ctx.readFile("tsconfig.json") ?? "";
    const loose = /"strict"\s*:\s*false/.test(content);
    const missingStrict = !/"strict"\s*:\s*true/.test(content);
    const extendsStrict = /"extends"\s*:\s*"[^"]*strict/.test(content);
    if (!loose && !missingStrict) return [];
    if (extendsStrict) return [];
    return [
      create({
        file: "tsconfig.json",
        message: loose ? 'tsconfig.json sets "strict": false.' : 'tsconfig.json does not enable "strict".',
        why: "Non-strict TypeScript silently allows null access, implicit any and unsafe function variance — the errors it misses are the ones that reach production.",
        suggestion: 'Enable "strict": true and fix the fallout incrementally (strictNullChecks first if the list is long), and add a `typecheck` script.',
      }),
    ];
  },
};

const typecheckScriptMissing: Rule = {
  id: "quality/typecheck-missing",
  title: "No typecheck step in scripts or CI",
  category: "quality",
  severity: "info",
  description: "Compiled or typed languages should have an explicit typecheck step that CI runs.",
  requiresFile: ["tsconfig.json", "tsconfig.*.json"],
  tags: ["quality", "type-safety"],
  run(ctx) {
    const create = createFinder(typecheckScriptMissing);
    if (hasScript(ctx, ["typecheck", "type-check", "tsc", "check-types"])) return [];
    return [
      create({
        file: "package.json",
        message: "TypeScript project without a `typecheck` script.",
        why: "If the build transpiles without checking types (ts-node, swc, esbuild, bundlers), type errors reach production unnoticed.",
        suggestion: 'Add `"typecheck": "tsc --noEmit"` and run it in CI.',
      }),
    ];
  },
};

const editorconfigMissing: Rule = {
  id: "quality/editorconfig-missing",
  title: "No .editorconfig",
  category: "quality",
  severity: "low",
  description: ".editorconfig keeps indentation and line endings consistent across editors, which prevents whitespace-only diffs.",
  tags: ["quality", "consistency"],
  run(ctx) {
    const create = createFinder(editorconfigMissing);
    if (ctx.exists(".editorconfig")) return [];
    if (ctx.files.length < 3) return [];
    return [
      create({
        message: "No .editorconfig file was found.",
        why: "Editor defaults differ wildly (tabs vs spaces, CRLF vs LF), and every mismatch shows up as a spurious diff in review.",
        suggestion: "Add .editorconfig with indent_style, indent_size, end_of_line, insert_final_newline and trim_trailing_whitespace.",
        fix: {
          id: "add-editorconfig",
          kind: "create-file",
          path: ".editorconfig",
          description: "Add a .editorconfig with sane defaults for the detected languages.",
          safe: true,
        },
      }),
    ];
  },
};

const packageMetadata: Rule = {
  id: "quality/package-metadata-missing",
  title: "package.json is missing discovery metadata",
  category: "quality",
  severity: "low",
  description: "A description, repository URL and keywords make the package findable and trustworthy on registries.",
  requiresFile: ["package.json"],
  tags: ["quality", "packaging"],
  run(ctx) {
    const create = createFinder(packageMetadata);
    if (!ctx.pkg) return [];
    if (ctx.pkg.private) return [];
    const missing: Finding[] = [];
    if (!ctx.pkg.description) {
      missing.push(
        create({
          file: "package.json",
          message: 'package.json has no "description".',
          why: "Registries and search results show the description; without it the package looks abandoned.",
          suggestion: "Add a one-sentence description of what the package does.",
        }),
      );
    }
    if (!ctx.pkg.repository) {
      missing.push(
        create({
          file: "package.json",
          message: 'package.json has no "repository" field.',
          why: "Users and tools (npm, Snyk, source maps) cannot link the published package back to its source, which breaks issue reporting.",
          suggestion: 'Add `"repository": { "type": "git", "url": "git+https://github.com/owner/repo.git" }`.',
        }),
      );
    }
    if (!ctx.pkg.keywords || ctx.pkg.keywords.length === 0) {
      missing.push(
        create({
          file: "package.json",
          message: 'package.json has no "keywords".',
          why: "Keywords are how people find a package in registry search.",
          suggestion: "Add 5–10 keywords describing the problem the package solves.",
        }),
      );
    }
    return missing;
  },
};

const largeFilesCommitted: Rule = {
  id: "quality/large-file-committed",
  title: "Large file committed to the repository",
  category: "quality",
  severity: "medium",
  description: "Large binaries and data files bloat clones and cannot be reviewed in a diff.",
  tags: ["quality", "repository-hygiene"],
  run(ctx) {
    const create = createFinder(largeFilesCommitted);
    const threshold = 1024 * 1024; // 1 MiB
    const findings: Finding[] = [];
    const candidates = ctx.git.isRepo ? ctx.git.trackedFiles : ctx.files;
    for (const file of candidates.slice(0, 4000)) {
      let size: number;
      try {
        size = fs.statSync(path.join(ctx.root, file)).size;
      } catch {
        continue;
      }
      if (size < threshold) continue;
      if (/\.(png|jpe?g|gif|webp|svg|ico|mp4|woff2?|ttf|eot|pdf)$/i.test(file) && size < 3 * threshold) continue;
      findings.push(
        create({
          file,
          message: `${file} is ${(size / (1024 * 1024)).toFixed(1)} MB.`,
          why: "Large files stay in git history forever: they slow every clone and CI checkout and cannot be meaningfully reviewed.",
          suggestion: "Remove it from history (git filter-repo), add the pattern to .gitignore, and use Git LFS or an external host for binaries.",
          meta: { bytes: size },
        }),
      );
      if (findings.length >= 8) break;
    }
    return findings;
  },
};

const formattingConfigConflict: Rule = {
  id: "quality/formatting-config-conflict",
  title: "Editor and formatter disagree on indentation",
  category: "quality",
  severity: "info",
  description: "Editors apply .editorconfig while Prettier applies its own config; conflicting values cause format churn.",
  tags: ["quality", "consistency"],
  run(ctx) {
    const create = createFinder(formattingConfigConflict);
    const prettierFile = ctx.firstExisting([".prettierrc", ".prettierrc.json", ".prettierrc.yml", ".prettierrc.yaml", ".prettierrc.js", "prettier.config.js"]);
    if (!prettierFile) return [];
    const editorconfig = ctx.readFile(".editorconfig") ?? "";
    const prettier = ctx.readFile(prettierFile) ?? "";
    const editorIndent = /indent_size\s*=\s*(\d+)/.exec(editorconfig)?.[1];
    const prettierIndent = /tabWidth\D{1,6}(\d+)/.exec(prettier)?.[1];
    if (!editorIndent || !prettierIndent || editorIndent === prettierIndent) return [];
    return [
      create({
        file: prettierFile,
        message: `.editorconfig sets indent_size=${editorIndent} but ${prettierFile} sets tabWidth=${prettierIndent}.`,
        why: "Files flip between two indentation widths depending on whether the editor or the formatter saved last, producing whitespace-only diffs.",
        suggestion: "Align `tabWidth` in the Prettier config with .editorconfig (or drop one of the two).",
        meta: { editorIndent, prettierIndent },
      }),
    ];
  },
};

export const qualityRules: Rule[] = [
  testsMissing,
  testScriptMissing,
  lintMissing,
  formatterMissing,
  typecheckMissing,
  typecheckScriptMissing,
  editorconfigMissing,
  packageMetadata,
  largeFilesCommitted,
  formattingConfigConflict,
];

/** Exposed for tests: number of test-like files found. */
export function countTestFiles(ctx: RuleContext): number {
  return ctx.find(TEST_GLOBS).length;
}
