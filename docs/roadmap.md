# Roadmap

The MVP is deliberately narrow: **read local files, say what is wrong, offer
safe fixes, never touch the network.** Everything below builds on that
foundation without weakening it.

## Principles

1. Every release must be usable offline, with zero runtime dependencies.
2. New checks ship with a fixture test and a `docs/rules.md` entry.
3. Nothing is auto-fixed unless it can be done without reading or rewriting
   existing user content.
4. Network features are opt-in, loudly announced, and off by default.

## v0.1 — MVP (current)

**Goal:** a maintainer runs one command and knows what to fix first.

- [x] 58 rules across documentation, security, dependencies, quality,
      containers, CI and community
- [x] Explainable scoring (0–100, A–F) per area and overall
- [x] Four report formats: console, Markdown, JSON, SARIF 2.1.0
- [x] `scan`, `fix`, `report`, `init`, `rules` commands
- [x] 18 safe fixes plus a repository bootstrap that scores 97/100 from empty
- [x] Secret detection with masked evidence and fingerprints
- [x] Offline advisory snapshot for npm, PyPI, crates.io and Go
- [x] 78 tests, including a source-level privacy test
- [x] GitHub Actions CI, CodeQL, Dependabot, self-scan

**Exit criteria:** published to npm with provenance; self-scan clean; a real
repository's PR gets inline SARIF findings.

## v0.2 — Precision and workflow

**Goal:** stop the tool from being noisy, and fit it into a review flow.

| Feature | Why | Notes |
| ------- | --- | ----- |
| `--baseline <file>` | Only report findings a PR introduced | Uses SARIF `partialFingerprints`; no new state files |
| `--changed` | Scan only files touched in the PR | `git diff --name-only origin/main...`; requires git |
| HTML report | Share with people who do not run CLIs | Single file, no CDN, no JS |
| Monorepo awareness | One report per workspace | Detect `workspaces`, `pnpm-workspace.yaml`, `go.work`, `Cargo.toml` members |
| Rule `options` | Let teams tune thresholds | e.g. `deps/outdated-major: { options: { maxBehind: 2 } }` |
| Calibration benchmark | Reduce false positives to < 5% | Run against 50 well-known OSS repos; publish the table |

## v0.3 — Ecosystem depth

| Feature | Notes |
| ------- | ----- |
| More ecosystems | `.NET` (NuGet), Java (Maven/Gradle), Swift (SPM), Elixir (mix), Dart |
| SBOM export | CycloneDX from parsed manifests |
| Contract and API docs checks | OpenAPI/JSON Schema presence and validity |
| Accessibility and i18n checks | For projects with UI assets |
| `--online` (opt-in) | Fetch fresh advisories from OSV; prints exactly what will be sent first |

## v0.4 — Automation

| Feature | Notes |
| ------- | ----- |
| Custom rules | `rulesDir` in config, loaded from local files only |
| GitHub App / PR bot | Posts a sticky comment with the diff of findings |
| `repo-doctor fix --interactive` | Pick fixes one by one; still create-only |
| Pre-commit hook recipe | Optional, through `.pre-commit-config.yaml` |

## v1.0 — Stability

- Frozen `schemaVersion: 1.x` with a documented deprecation policy
- Plugin API (sandboxed: no network helpers, no filesystem beyond the snapshot)
- Translations of the README and rule catalogue
- Reproducible benchmark published with the score

## Non-goals

| Not doing | Why |
| --------- | --- |
| Live CVE database | Wrong shape of tool; delegate to Dependabot / OSV / `npm audit` |
| Running the project's code or tests | Unacceptable risk for a scanner of untrusted repos |
| GitHub API / private repositories | Requires tokens and network; breaks the privacy promise |
| AI-generated code changes in the scan path | Non-determinism; an assistant mode may exist separately, offline or opt-in |
| Comparing scores between projects | Metric becomes a target, not a signal |
| Blocking merges on style opinions | Severity defaults are advisory; teams set `--fail-on` |

## Success metrics (six months)

| Metric | Target |
| ------ | ------ |
| Runtime on a 1000-file repo | < 1 second |
| False-positive rate on the benchmark | < 5% |
| Repositories scoring ≥ 90 after `init` | > 80% |
| Rules shipped | 58 → 90 |
| Supported ecosystems | 6 → 10 |
| CI matrix (Node 18/20/22 × linux/macos/windows) | green |

## How priorities are chosen

1. **False positives first.** A noisy rule is worse than a missing one.
2. **Contributor friction second.** Checks that block a first PR matter most.
3. **Security third**, but always: a critical credential finding outranks
   everything in the report and in `topPriorities`.
4. **New shiny checks last** — they are the easiest to add and the least urgent.
