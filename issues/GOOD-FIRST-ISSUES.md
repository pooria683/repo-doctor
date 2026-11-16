# Issue backlog — ready to open

26 issues covering the first three months of the project. Each one is scoped
small enough to be completed in a single sitting, and every "good first issue"
has a definition of done that a newcomer can verify without reading the whole
codebase.

Labels used: `good first issue`, `bug`, `enhancement`, `documentation`,
plus `help wanted`, `needs triage`, `rule: false positive`.

Create them all at once:

```bash
chmod +x scripts/create-issues.sh
./scripts/create-issues.sh          # dry run, prints what it would create
./scripts/create-issues.sh --apply  # actually create them with gh
```

## Summary

| # | Title | Labels | Area | Effort |
| - | ----- | ------ | ---- | ------ |
| 1 | Add `quality/no-debugger` rule | `good first issue`, `enhancement` | rules/quality | 30 min |
| 2 | Add `quality/no-console-log` rule | `good first issue`, `enhancement` | rules/quality | 1 h |
| 3 | Add `docs/logo-or-screenshot` hint to README rule | `good first issue`, `enhancement` | rules/docs | 1 h |
| 4 | Detect `.env.example` completeness | `good first issue`, `enhancement` | rules/security | 2 h |
| 5 | Add `containers/dockerfile-healthcheck` rule | `good first issue`, `enhancement` | rules/containers | 1 h |
| 6 | Add `containers/dockerfile-multi-stage` suggestion | `good first issue`, `enhancement` | rules/containers | 2 h |
| 7 | Support `bun.lock` (text lockfile) | `good first issue`, `enhancement` | deps | 30 min |
| 8 | Add NuGet `.csproj` parsing | `good first issue`, `enhancement` | deps | half a day |
| 9 | Add Maven `pom.xml` parsing | `good first issue`, `enhancement` | deps | half a day |
| 10 | Make severity weights configurable per rule | `enhancement`, `help wanted` | core | half a day |
| 11 | Add `--baseline` flag for PR-only findings | `enhancement`, `help wanted` | cli | 1 day |
| 12 | Add HTML report renderer | `enhancement` | report | 1 day |
| 13 | Detect GitHub issue/PR templates in `docs/` | `good first issue`, `enhancement` | rules/docs | 30 min |
| 14 | False positive: `docs/license-missing` with `LICENSE-APACHE` | `bug`, `rule: false positive`, `good first issue` | rules/docs | 1 h |
| 15 | False positive: private key detected in OpenSSH test fixtures | `bug`, `rule: false positive` | rules/secrets | 2 h |
| 16 | Crash on a `package.json` with a BOM | `bug`, `good first issue` | util/fs | 1 h |
| 17 | `--ignore` should accept comma-separated values | `bug`, `good first issue` | cli | 30 min |
| 18 | Windows: backslash paths in findings | `bug`, `help wanted` | util/fs | 2 h |
| 19 | Add `--json` shorthand for `--format json` | `good first issue`, `enhancement` | cli | 30 min |
| 20 | Document the scoring formula with worked examples | `documentation`, `good first issue` | docs | 1 h |
| 21 | Add a rule-authoring tutorial with a full diff | `documentation`, `good first issue` | docs | 2 h |
| 22 | Translate the rule catalogue to Persian | `documentation`, `help wanted` | docs | 1 day |
| 23 | Add a `Dockerfile` for the CLI | `enhancement`, `help wanted` | packaging | half a day |
| 24 | Benchmark script: 50 repositories, publish a table | `enhancement`, `help wanted` | tooling | 1 day |
| 25 | Add `--min-score` exit condition | `good first issue`, `enhancement` | cli | 1 h |
| 26 | Split `src/rules/deps.ts` into one file per rule | `enhancement`, `good first issue` | refactor | 2 h |

---

## 1. Add `quality/no-debugger` rule · `good first issue` · `enhancement`

A committed `debugger` statement halts execution for every user who hits it,
and it is invisible in review because it is one word.

**Do**

- [ ] Add `quality/no-debugger` to `src/rules/quality.ts` (severity `medium`, category `quality`).
- [ ] Match only standalone statements in JS/TS files: `/^\s*debugger\s*;?\s*$/`.
- [ ] Document it in `docs/rules.md` under "Quality rules".
- [ ] Add a test in `tests/` with both a matching and a non-matching fixture (a string containing `debugger` must not match).

**Definition of done:** `npm test` passes, `npm run self-scan` passes, the rule appears in `repo-doctor rules`.

**Hints:** copy the structure of `quality/typescript-not-strict`, which is ~25 lines.

## 2. Add `quality/no-console-log` rule · `good first issue` · `enhancement`

`console.log` in shipped library code leaks data and clutters consumer output.

**Do**

- [ ] Add the rule with severity `low`, matching `console.log(` in `src/**` (skip `test`/`spec`/`benchmark` paths).
- [ ] Cap the findings per file at five with `meta.occurrences` for the rest.
- [ ] Document + test it.

## 3. Add logo/screenshot detection to the README rule · `good first issue` · `enhancement`

Projects with a screenshot or logo convert better, but nothing checks for it.

**Do**

- [ ] Extend `docs/readme-thin` (or add `docs/readme-no-visual`) to look for an image reference (`![`, `<img`, `docs/*.png`).
- [ ] Severity `info` only — never block on aesthetics.
- [ ] Test both cases.

## 4. Detect `.env.example` completeness · `good first issue` · `enhancement`

If `.env` is gitignored but `.env.example` is missing, contributors cannot know
which variables to set.

**Do**

- [ ] New rule `security/env-example-missing`, severity `low`.
- [ ] Fires when a `.env*` file is present (or referenced in docs) and no `.env.example`/`.env.sample`/`.env.template` exists.
- [ ] Suggest a fix recipe that lists the variables **names only**, never values.

## 5. Add `containers/dockerfile-healthcheck` rule · `good first issue` · `enhancement`

**Do**

- [ ] Severity `low`; skip images whose final `FROM` is `scratch`.
- [ ] Suggest `HEALTHCHECK CMD curl -f http://localhost:PORT/ || exit 1` in the message.
- [ ] Test with and without a `HEALTHCHECK`.

## 6. Add `containers/dockerfile-multi-stage` suggestion · `good first issue` · `enhancement`

Single-stage builds that install dev dependencies ship them to production.

**Do**

- [ ] Detect a Dockerfile that installs dev dependencies and also has a final `CMD`, with no `AS builder` stage.
- [ ] Severity `info`; message explains the size and attack-surface trade-off.
- [ ] Test with a multi-stage and a single-stage Dockerfile.

## 7. Support `bun.lock` (text lockfile) · `good first issue` · `enhancement`

`deps/lockfile-missing` knows `bun.lockb` but not the newer text `bun.lock`.

**Do**

- [ ] Add it to `LOCKFILES.npm` in `src/rules/deps/parse.ts`.
- [ ] Add a fixture test asserting no `deps/lockfile-missing` finding.

## 8. Add NuGet `.csproj` parsing · `good first issue` · `enhancement`

**Do**

- [ ] New ecosystem `nuget` in `src/data/index.ts`.
- [ ] Parse `<PackageReference Include="X" Version="1.2.3" />` in `*.csproj`.
- [ ] Register `packages.lock.json` and `paket.lock` as lockfiles.
- [ ] Fixture test + `docs/rules.md` note that advisories are not bundled for NuGet yet.

## 9. Add Maven `pom.xml` parsing · `good first issue` · `enhancement`

**Do**

- [ ] New ecosystem `maven`; parse `<dependency>` blocks with `<groupId>`, `<artifactId>`, `<version>`.
- [ ] Skip `${property}` versions (report them as unpinned instead).
- [ ] Lockfiles: none; instead note that Maven resolves at build time.

## 10. Make severity weights configurable per rule · `enhancement` · `help wanted`

Today `weights` only applies per category. Teams want to say "a
`deps/vulnerable-dependency` finding is worth more than a `quality/lint-missing`".

**Do**

- [ ] Extend `RepoDoctorConfig.weights` to accept `Record<string, number>` keyed by rule id, falling back to category.
- [ ] Update the JSON schema, `docs/report-format.md` and tests.
- [ ] Keep scores in `[0, 100]`.

## 11. Add `--baseline` flag for PR-only findings · `enhancement` · `help wanted`

**Do**

- [ ] `repo-doctor scan . --baseline existing.json` reports only findings whose SARIF `partialFingerprints` key is absent from the baseline.
- [ ] `scan --save` must always write the full report; the baseline only filters output.
- [ ] Document the CI workflow in `docs/agents.md`.

## 12. Add HTML report renderer · `enhancement`

**Do**

- [ ] `src/report/html.ts`, single file, no CDN, no external assets, no JS required to read it.
- [ ] Same information as the Markdown report, plus the category bars.
- [ ] `--format html` in `scan` and `report`; update `docs/cli.md`.
- [ ] Escape every interpolated value (`&`, `<`, `>`, `"`).

## 13. Detect GitHub issue/PR templates in `docs/` · `good first issue` · `enhancement`

GitHub only reads `.github/`, but many projects keep templates in `docs/`.

**Do**

- [ ] `docs/issue-templates-missing` should mention that `.github/ISSUE_TEMPLATE/` is the only location GitHub reads.
- [ ] Emit `info` (not `low`) when a `docs/` template exists.

## 14. False positive: `docs/license-missing` with `LICENSE-APACHE` · `bug` · `rule: false positive` · `good first issue`

**Repro:** a Rust repo with `LICENSE-APACHE` and `LICENSE-MIT` (the standard
dual-license layout) reports "No license file".

**Do**

- [ ] Add `LICENSE-*`, `LICENCE-*`, `COPYING-*` patterns to the candidate list.
- [ ] Add a fixture test with both files.
- [ ] Note the fix in `CHANGELOG.md`.

## 15. False positive: private key detected in OpenSSH test fixtures · `bug` · `rule: false positive`

**Repro:** `tests/fixtures/id_rsa` containing a throwaway key is reported as
`critical`.

**Do**

- [ ] Whole key files under `test`/`fixtures`/`examples` should be `low`, matching the behaviour for inline secrets.
- [ ] `security/private-key-file` needs the same `EXAMPLE_FILE_GLOBS` treatment.
- [ ] Keep the `critical` severity for tracked production paths.

## 16. Crash on a `package.json` with a BOM · `bug` · `good first issue`

**Repro:** a UTF-8 BOM makes `JSON.parse` throw, so `ctx.pkg` is `null` and the
dependency rules silently skip the project.

**Do**

- [ ] Strip a leading `\uFEFF` in `safeRead()` or `readJsonSync()`.
- [ ] Add a regression test with a real BOM-prefixed file.

## 17. `--ignore` should accept comma-separated values · `bug` · `good first issue`

**Repro:** `--ignore "dist/**,coverage/**"` creates one bogus pattern.

**Do**

- [ ] Split on commas in `listFlag()` while still supporting repeated flags.
- [ ] Test both forms.

## 18. Windows: backslash paths in findings · `bug` · `help wanted`

Findings occasionally contain `src\rules\secrets.ts` on Windows because a path
joins with the platform separator.

**Do**

- [ ] Audit `path.join` usage in rules; findings must always use POSIX separators.
- [ ] Add a test that asserts no `\` in `finding.file`.
- [ ] Add Windows to the CI matrix (already present for Node 20).

## 19. Add `--json` shorthand for `--format json` · `good first issue` · `enhancement`

**Do**

- [ ] Accept `--json` on `scan`, `fix`, `report` and `rules`.
- [ ] Keep `--format` authoritative when both are passed.
- [ ] Update `docs/cli.md`.

## 20. Document the scoring formula with worked examples · `documentation` · `good first issue`

**Do**

- [ ] Add `docs/scoring.md` with the formula, three worked examples, and why the per-rule cap is 3.
- [ ] Link it from the README and `docs/report-format.md`.

## 21. Add a rule-authoring tutorial with a full diff · `documentation` · `good first issue`

**Do**

- [ ] `docs/tutorial-add-a-rule.md`: from zero to merged, including the test and the docs entry.
- [ ] Use a real rule as the example and show the complete diff.

## 22. Translate the rule catalogue to Persian · `documentation` · `help wanted`

**Do**

- [ ] `docs/rules.fa.md` mirroring `docs/rules.md`.
- [ ] Keep rule ids in English; translate titles, `why` and `suggest`.
- [ ] Link both from the READMEs.

## 23. Add a `Dockerfile` for the CLI · `enhancement` · `help wanted`

**Do**

- [ ] Multi-stage build (`node:22-alpine`), non-root user, a `.dockerignore`.
- [ ] The image must run `repo-doctor scan /repo` with the workspace mounted read-only.
- [ ] `docker run` example in `docs/cli.md`.
- [ ] Repo Doctor's own container rules must pass on it (dogfooding).

## 24. Benchmark script: 50 repositories, publish a table · `enhancement` · `help wanted`

**Do**

- [ ] `scripts/benchmark.mjs` clones a list of public repositories into `/tmp`, runs the scan, and records duration, score and finding counts.
- [ ] Emit Markdown to `docs/benchmark.md`.
- [ ] Runs nightly in CI, not on pull requests.

## 25. Add `--min-score` exit condition · `good first issue` · `enhancement`

**Do**

- [ ] `--min-score 80` exits `1` when the score is lower, independently of `--fail-on`.
- [ ] Never conflict: exiting `1` if *either* condition fails.
- [ ] Test with a fixture scoring above and below the threshold.

## 26. Split `src/rules/deps.ts` into one file per rule · `enhancement` · `good first issue`

`deps.ts` is the largest rule file; splitting matches the other groups.

**Do**

- [ ] `src/rules/deps/{lockfile,vulnerable,deprecated,wildcard,pinning,scripts,metadata}.ts`.
- [ ] Keep `src/rules/deps.ts` as the aggregator that re-exports the array (so `rules/index.ts` does not change).
- [ ] No behaviour change: the test suite must pass untouched.
