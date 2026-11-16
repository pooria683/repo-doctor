# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- `--baseline` to report only findings introduced by a pull request
- HTML report renderer
- Monorepo workspace awareness

## [0.1.0] - 2025-01-05

The first usable release: offline scanning, explainable scoring, safe fixes.

### Added

- `repo-doctor scan` with console, Markdown, JSON and SARIF 2.1.0 output.
- 58 rules across documentation (11), security (7), dependencies (10),
  quality (10), containers (8), CI (7) and community (5).
- Explainable scoring: per-area 0–100 with A–F grades, weighted overall score.
- `repo-doctor fix` with 18 safe, create-only fixes and a dry-run default.
- `repo-doctor init` that scaffolds docs, community files, CI, Dependabot and
  configuration — a fresh directory scores 97/100.
- `repo-doctor report` to re-render saved results without scanning.
- `repo-doctor rules` to list and validate the rule catalogue.
- Secret detection for 20+ patterns with masked evidence and SHA-256
  fingerprints; raw values never leave the process.
- Offline advisory snapshot (23 curated entries) for npm, PyPI, crates.io and Go,
  with explicit `confidence: yes | maybe`.
- `.repodoctorrc.json` configuration: rule severity overrides, disabling,
  ignore globs, category weights, fail threshold.
- Programmatic API: `scan()`, `renderMarkdown()`, `renderJson()`, `renderSarif()`.
- 78 tests, including a source-level privacy test that fails the build if any
  network client is imported.

### Security

- Zero runtime dependencies.
- No network access of any kind.
- Read-only scanning; `fix` never overwrites existing files.
