# Architecture

Repo Doctor is a single-pass, read-only analyzer. This document explains the
module boundaries, the data flow, and where to extend it.

## Design constraints

| Constraint | Consequence |
| ---------- | ----------- |
| No network | Advisory data is bundled; no registry lookups; no auth |
| Zero runtime dependencies | Every utility (glob, semver, arg parsing, templating) is local |
| Read-only scanning | Rules receive a frozen snapshot, never a filesystem handle |
| Deterministic output | Findings are sorted; timestamps are injectable for tests |
| Fail-soft | A crashing rule becomes a warning, never a broken scan |

## Layers

```
┌─────────────────────────────────────────────────────────────┐
│ cli/          parse args → choose command → print/exit      │
├─────────────────────────────────────────────────────────────┤
│ core/         engine (orchestration) · context (snapshot)   │
│               config (resolution) · score (grading)         │
├─────────────────────────────────────────────────────────────┤
│ rules/        pure functions over RuleContext               │
├─────────────────────────────────────────────────────────────┤
│ report/       console · markdown · json · sarif renderers    │
├─────────────────────────────────────────────────────────────┤
│ fix/          recipes + planner + safe writer               │
│ init/         file templates                               │
├─────────────────────────────────────────────────────────────┤
│ util/         glob · semver · fs · git · text (+ data/)     │
└─────────────────────────────────────────────────────────────┘
```

Dependencies point **downwards only**. `rules/` never imports from `report/`
or `cli/`; renderers never import rules. The one shared vocabulary is
`src/types.ts`.

## Modules

### `src/types.ts` — the contract

Defines `Finding`, `Rule`, `RuleContext`, `ScanResult`, severity weights,
categories and `SCHEMA_VERSION`. Everything else speaks this language. A change
here is a breaking change.

### `src/core/context.ts` — the snapshot

Builds the single view every rule sees:

- `files` — relative POSIX paths from the walker (ignoring `node_modules`,
  `.git`, `dist`, `vendor`, virtualenvs, caches; capped by `maxFiles`)
- `fileIndex` — case-insensitive lookup for `exists()`
- `readFile()` / `lines()` — cached reads with a 512 KiB cap and binary
  detection; a 4 MB binary is never loaded
- `find(globs)` — glob filtering over the file list
- `pkg` — parsed `package.json` (or null)
- `git` — tracked files, untracked files, remote URL, branch, commit count

Cost: one directory walk plus the reads rules actually request. A rule that
reads nothing costs nothing.

### `src/core/engine.ts` — orchestration

```
runScan({root, config, rules})
  ├── buildContext()               → snapshot + warnings
  ├── for each enabled rule
  │     ├── skip if disabled in config
  │     ├── skip if requiresFile is absent
  │     ├── run in try/catch        → failures become warnings
  │     └── attach severity overrides
  ├── filter info (optional) + sort
  ├── computeScores()
  └── planFixes()
```

Rules may be `async` — the engine awaits them — but nothing in the current
catalogue needs I/O beyond the snapshot, so they all return synchronously.

### `src/core/config.ts` — configuration

Resolution order (later wins): defaults → `.repodoctorrc.json` (or
`package.json#repoDoctor`) → CLI flags. Invalid JSON is a warning, not a crash.
Rule settings accept `"off"`, a severity string, or an object with
`enabled`/`severity`/`options`.

### `src/core/score.ts` — grading

- `categoryScore = max(0, 100 − Σ weight(ruleSeverity) × min(occurrences, 3))`
- overall score = weighted mean over categories that ran (defaults: security 1.5,
  documentation 1.2, dependencies 1.2, everything else 1)
- grades: A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, F otherwise

The `min(occurrences, 3)` cap exists so one chatty rule cannot zero an area.

### `src/rules/*.ts` — the rules

Grouped by domain, each exporting an array of `Rule` objects:

| File | Category | Rules |
| ---- | -------- | ----: |
| `docs.ts` | documentation | 11 |
| `secrets.ts` | security | 7 |
| `deps.ts` + `deps/parse.ts` | dependencies | 10 |
| `quality.ts` | quality | 10 |
| `containers.ts` | containers | 8 |
| `github.ts` | ci | 7 |
| `community.ts` | community | 5 |

`helpers.ts` provides `createFinder(rule)` — a factory that stamps every finding
with the rule's id, category, default severity and docs link, so rules stay
short and consistent.

### `src/fix/` — remediation

`recipes.ts` maps a fix id to generated file content. `planner.ts` deduplicates
findings into plans, marks collisions with existing files, and writes them.
The writer refuses to overwrite without `--force`, which the CLI never passes.

Why recipes live outside rules: a rule describes *what is wrong*; a recipe
knows *how to fix it*. Keeping content out of rules means a rule can ship
without a fix, and a fix can be improved without touching detection.

### `src/report/` — renderers

All four take the same `ScanResult` and are pure functions of it. Adding a
format means adding one file and one switch case; no scan logic changes.

### `src/data/` — bundled knowledge

- `advisories.json` — 23 curated advisories (id, CVE, range, fixed version, URL)
- `known-versions.json` — latest known release per popular package, for
  "several majors behind" detection

Both are versioned snapshots with a `meta` block. They are data, not policy:
`scripts/update-data.mjs` regenerates them (maintainers only, requires network).

## Data flow

```
argv ──▶ cli/args ──▶ cli/commands/*.ts
                          │
                          ├─ loadConfig() ──▶ ResolvedConfig
                          ├─ runScan() ─────▶ { result, ctx }
                          │        │
                          │        └──▶ report/*.ts ──▶ stdout | file
                          └─ fix: executableFixes(plans, ctx) ──▶ planner.applyFixes()
```

## Extension points

### Add a rule

1. Write the `Rule` in an existing group file (or a new one).
2. Append it to that file's exported array.
3. Document it in `docs/rules.md` (a test enforces this).
4. Add a fixture-based test in `tests/`.

### Add an ecosystem

1. Implement the parser in `src/rules/deps/parse.ts` and register the filename.
2. Add its lockfiles to `LOCKFILES` and its manifest name to `ecosystemManifestName`.
3. Add `Ecosystem` to `src/data/index.ts` and entries to the advisory snapshot.

### Add a fix recipe

1. Add the template in `src/init/templates.ts`.
2. Add a recipe in `src/fix/recipes.ts` with the rule id it belongs to.
3. Reference the fix id from the finding in the rule.

## Testing strategy

78 tests, all on `node:test` — no test framework dependency.

| Suite | Focus |
| ----- | ----- |
| `glob`, `semver` | Pure utility correctness, including edge cases |
| `secrets` | Detection, placeholder filtering, and the guarantee that raw values never serialize |
| `docs`, `deps`, `containers`, `github` | Rule behaviour on fixtures, both positive and negative |
| `score` | Formula, caps, grading, sorting |
| `engine` | Result shape, determinism, rule isolation, config overrides |
| `cli` | Exit codes, JSON validity, dry-run vs apply, `init` non-destructiveness |
| `privacy` | Source-level guarantees: no network imports, no `fetch`, zero deps |
| `registry` | Id uniqueness, docs coverage, recipe integrity |

The `privacy` suite is the most important one: it turns the product promise
into a failing build if anyone adds a HTTP client.
