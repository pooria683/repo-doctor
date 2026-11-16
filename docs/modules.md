# Module contract

Every module below lists what it **is responsible for**, what it **takes**,
what it **produces**, and what it **may depend on**. The dependency column is
the important one: it is enforced by convention and reviewed in PRs, because
cyclic dependencies between scanner and renderer are how analysers rot.

## `src/types.ts`

| | |
| --- | --- |
| **Responsibility** | The shared vocabulary: `Finding`, `Rule`, `RuleContext`, `ScanResult`, severities, categories, schema version. |
| **Input** | — |
| **Output** | TypeScript types + constants (`SEVERITY_WEIGHT`, `CATEGORY_LABELS`, `SCHEMA_VERSION`). |
| **Depends on** | nothing |
| **Used by** | everything |

## `src/util/`

| Module | Responsibility | Input | Output | Depends on |
| ------ | -------------- | ----- | ------ | ---------- |
| `glob.ts` | Glob matching (`*`, `**`, `?`, `[]`, `{}`) with a compiled-pattern cache | pattern, path | boolean | — |
| `fs.ts` | Safe filesystem access: walk with ignore rules, size/binary caps, JSON read, guarded writes | root path, limits | file list, file contents or `null` | `glob` |
| `git.ts` | Read-only git facts via `execFileSync`; link-free slug parsing | repo root | `GitInfo` | `types` |
| `semver.ts` | Version parsing, ranges, intersection with a vulnerable range | version/range strings | boolean, interval, confidence | — |
| `text.ts` | Line splitting, truncation, entropy, secret masking/fingerprinting, Levenshtein | strings | strings/numbers | `node:crypto` |

Why these are local instead of dependencies: a tool that audits supply chains
should not add to them. Each module is small enough to test exhaustively
(`tests/glob.test.ts`, `tests/semver.test.ts`, `tests/secrets.test.ts`).

## `src/core/context.ts`

| | |
| --- | --- |
| **Responsibility** | Build the immutable snapshot rules operate on, with caching. |
| **Input** | `root`, `ResolvedConfig`, optional pre-computed file list |
| **Output** | `{ ctx: RuleContext, warnings: string[] }` |
| **Depends on** | `util/fs`, `util/git`, `util/glob`, `util/text` |
| **Guarantees** | No writes; bounded reads; symlinks not followed; binary/oversized files return `null` |

## `src/core/config.ts`

| | |
| --- | --- |
| **Responsibility** | Discover, validate and merge configuration; apply defaults. |
| **Input** | repo root, CLI overrides |
| **Output** | `ResolvedConfig` + warnings; `writeConfigFile()` for `init` |
| **Depends on** | `util/fs`, `types` |
| **Merging** | defaults → `.repodoctorrc.json` / `package.json#repoDoctor` → CLI flags |
| **Failure mode** | Invalid JSON → warning and defaults, never a crash |

## `src/core/engine.ts`

| | |
| --- | --- |
| **Responsibility** | Orchestrate a scan: filter rules, isolate failures, score, plan fixes, assemble `ScanResult`. |
| **Input** | `root`, `ResolvedConfig`, optional rule subset / file list / clock / display path |
| **Output** | `{ result: ScanResult, ctx: RuleContext }` |
| **Depends on** | `context`, `score`, `fix/planner`, `rules/index`, `types` |
| **Contract** | One failing rule → one warning, never a failed scan |

## `src/core/score.ts`

| | |
| --- | --- |
| **Responsibility** | Turn findings into per-area and overall scores, counts, grades and ordering. |
| **Input** | findings, rules run per category, config weights, file/duration counts |
| **Output** | `ScanSummary` + `CategoryScore[]`; helpers `sortFindings`, `meetsFailThreshold` |
| **Depends on** | `types` |
| **Formula** | `100 − Σ weight × min(count, 3)` per area, weighted mean overall |

## `src/core/project.ts`

| | |
| --- | --- |
| **Responsibility** | Describe the project for templates: name, description, owner, repo URL, languages, indentation, license, default branch. |
| **Input** | `RuleContext` |
| **Output** | `ProjectInfo` |
| **Depends on** | `types`, `util/fs` |
| **Used by** | `fix/recipes`, `cli/commands/init` |

## `src/rules/*.ts`

| | |
| --- | --- |
| **Responsibility** | Detection only: read the snapshot, emit findings. |
| **Input** | `RuleContext` |
| **Output** | `Finding[]` (via `createFinder(rule)` which stamps id/category/severity/docs) |
| **Depends on** | `types`, one's own group helpers, `util/*`, `data/*` |
| **Must not** | Write files, spawn processes, import `report/` or `cli/` |

| Group file | Rules | Notes |
| ---------- | ----: | ----- |
| `docs.ts` | 11 | README/LICENSE/community docs; exports `detectLicenseId` |
| `secrets.ts` | 7 | Pattern table + `scanForSecrets()`; masking is mandatory |
| `deps.ts` | 10 | Uses `deps/parse.ts` and `data/` snapshots |
| `quality.ts` | 10 | Tests, lint, formatting, metadata, large files |
| `containers.ts` | 8 | Dockerfile + Compose analysis |
| `github.ts` | 7 | Actions workflow security and CI presence |
| `community.ts` | 5 | Onboarding, ownership, funding, governance |

## `src/rules/deps/parse.ts`

| | |
| --- | --- |
| **Responsibility** | Parse dependency declarations from six ecosystems without executing anything. |
| **Input** | `RuleContext` |
| **Output** | `DeclaredDependency[]` (`name`, `range`, `ecosystem`, `file`, `line`, `dev`) + `LOCKFILES` map |
| **Depends on** | `types`, `data/index` (ecosystem enum), `util/glob` |
| **Limits** | Line-based parsing, not a TOML/YAML engine; documented grammar per ecosystem |

## `src/fix/recipes.ts` + `src/fix/planner.ts`

| | |
| --- | --- |
| **Responsibility** | Turn findings into file plans and write them safely. |
| **Input** | findings, `RuleContext` |
| **Output** | `FixPlan[]`, `ExecutableFix[]`, `ApplyResult` |
| **Depends on** | `core/project`, `init/templates`, `types`, `node:fs` |
| **Guarantees** | Only creates missing files; existing paths are skipped and reported; dry-run writes nothing |

## `src/init/templates.ts`

| | |
| --- | --- |
| **Responsibility** | Deterministic content for every generated file. |
| **Input** | `ProjectInfo` |
| **Output** | strings (README, LICENSE, CONTRIBUTING, CoC, SECURITY, CHANGELOG, `.gitignore`, `.dockerignore`, `.editorconfig`, issue/PR templates, CODEOWNERS, FUNDING, MAINTAINERS, CI, Dependabot) |
| **Depends on** | `core/project` types only |
| **Note** | Unsupported licenses return `null` rather than generating legally wrong text |

## `src/report/*.ts`

| | |
| --- | --- |
| **Responsibility** | Render a `ScanResult`. Pure functions, no I/O. |
| **Input** | `ScanResult` (+ display options) |
| **Output** | `string` |
| **Depends on** | `types`, `rules/index` (SARIF rule metadata only) |

| Renderer | Target | Formats |
| -------- | ------ | ------- |
| `console.ts` | terminal | ANSI, NO_COLOR aware |
| `markdown.ts` | PR comments, issues | GitHub-flavoured Markdown |
| `json.ts` | agents, CI | JSON + `parseReport()` guard |
| `sarif.ts` | code scanning, editors | SARIF 2.1.0 |

## `src/cli/`

| Module | Responsibility | Input | Output |
| ------ | -------------- | ----- | ------ |
| `args.ts` | Strict flag parsing (unknown flags are errors) | `string[]` | `{ command, positionals, flags, errors }` |
| `shared.ts` | Target resolution, config building, format selection, exit codes | positionals, flags, cwd | `ScanSetup` or an error message |
| `output.ts` | Colour support, printing, file output | strings | stdout/stderr/files |
| `commands/scan.ts` | Run the scan, render, save, decide the exit code | flags | exit code |
| `commands/fix.ts` | Plan, diff, apply | flags | exit code |
| `commands/report.ts` | Re-render a saved report | flags | exit code |
| `commands/init.ts` | Scaffold a repository | flags | exit code |
| `commands/rules.ts` | List/validate the registry | flags | exit code |
| `index.ts` | Dispatch, EPIPE guard, error boundary | argv | exit code |

## `src/data/`

| | |
| --- | --- |
| **Responsibility** | Ship versioned knowledge that cannot be fetched at runtime. |
| **Files** | `advisories.json` (23 curated advisories), `known-versions.json` (latest known majors), `index.ts` (loader with path fallbacks) |
| **Depends on** | `node:fs` (read-only) |
| **Refresh** | `scripts/update-data.mjs` (maintainers, requires network, output is reviewed as a diff) |

## `src/core/index.ts`

| | |
| --- | --- |
| **Responsibility** | Public programmatic API for Node consumers. |
| **Input** | `ScanApiOptions` (path + config overrides) |
| **Output** | `{ result, failed }` plus renderers and the rule registry |
| **Depends on** | `engine`, `config`, `report/*`, `rules/index` |
