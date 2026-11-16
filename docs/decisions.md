# Technical decisions (ADRs)

Short records of the choices that shaped Repo Doctor, with the reasoning and
the cost we accepted. Read this before proposing a rewrite.

---

## ADR-001 — TypeScript on Node.js, ESM, no build framework

**Context.** The tool must parse JSON/TOML-ish manifests, match globs, walk
file trees, render four output formats and be installable with one command. The
audience is developers who already have Node or can use `npx`.

**Decision.** TypeScript compiled with `tsc` to ESM, running on Node ≥ 18.17.

**Why**

- **Distribution.** `npx repo-doctor` works without installing anything, which
  removes the biggest adoption barrier for a "try it once" tool. A Go binary
  would need per-platform release artefacts; Rust needs a whole toolchain for
  contributors.
- **Audience fit.** The people who publish open-source repositories are
  overwhelmingly Node/Python users; Node is already on their machine and in
  every GitHub Actions runner.
- **Type safety without ceremony.** The `Finding`/`Rule`/`ScanResult` contracts
  are the product. TypeScript makes a breaking change to the report shape a
  compile error rather than a silently broken CI integration.
- **No build framework.** `tsc` plus `node --test` covers compilation and
  testing. Adding Vite/Rollup/esbuild would add build config and dependency
  surface for zero user-visible benefit at this size.

**Cost accepted.** Startup time is ~90 ms, slower than a Go binary. Anyone
without Node cannot run it. Accepted: the target user has Node.

**Revisit if** the tool needs to run in environments without a Node runtime
(e.g. distroless containers as a security scanner).

---

## ADR-002 — Zero runtime dependencies

**Context.** A tool that audits supply chains — advisories, lockfiles, install
scripts — should not itself be a supply-chain risk. Every dependency is code
that runs with the user's privileges while reading their private repositories.

**Decision.** `dependencies: {}`. Glob matching, semver ranges, argument
parsing, ANSI colouring and templating are implemented locally (~1 200 lines
total). Development dependencies are limited to `typescript` and `@types/node`.

**Why**

- **Trust.** A security-conscious user can read the entire dependency tree in
  one sitting, because it does not exist.
- **Install weight.** ~99 kB tarball, installs in under a second.
- **No version conflicts** with the analysed project's own tooling.
- **No abandoned transitive dependency** can break the scanner.

**Cost accepted.** We own the edge cases (`glob`, `semver`). Mitigated by
exhaustive unit tests: `tests/glob.test.ts` and `tests/semver.test.ts` cover
brace expansion, `**` semantics, caret/tilde/prerelease ordering and range
intersection.

**Revisit if** a format requires a real parser (YAML, TOML) beyond line-based
extraction — then a single, well-known parser is better than a bad one, and the
decision gets a new ADR.

---

## ADR-003 — No network access, ever

**Context.** The obvious way to answer "are my dependencies vulnerable?" is to
query a registry or OSV. It is also the way tools leak information: package
names, private repository contents, and version pins can reveal unreleased work.

**Decision.** The CLI makes no network calls at all. Advisory data ships as a
reviewed, versioned snapshot in `data/advisories.json`. `scripts/update-data.mjs`
refreshes it, and only maintainers run it.

**Why**

- **Privacy is verifiable, not a promise.** There is no HTTP client in the
  source, and a test fails the build if one appears.
- **Works everywhere:** air-gapped machines, restricted CI, corporate proxies
  that block npm.
- **Reproducible:** the same scan today and next month gives the same advisory
  hits, which makes baselines and diffs meaningful.

**Cost accepted.** The snapshot can miss recent advisories and does not resolve
transitive versions. Documented in every finding (`meta.snapshot`) and in
`docs/rules.md`. Repo Doctor is positioned as a readiness check, not a CVE
database.

**Revisit if** an opt-in `--online` mode is added: it must print exactly what
will be sent, send only package names and versions, and stay off by default.

---

## ADR-004 — Fixes create files, never edit them

**Context.** Auto-fix is where tools lose trust. A wrong rewrite of a user's
`package.json` or workflow is worse than no fix at all, and a scanner cannot
understand intent in arbitrary files.

**Decision.** Every fix is a *whole file we own*: README skeleton, LICENSE,
CONTRIBUTING, `.gitignore`, CI workflow, issue templates. `fix` refuses to
overwrite an existing path and defaults to a dry run with a diff. Findings that
require judgement (rotate a secret, choose a funding account, name a CoC
contact) have no fix at all.

**Why**

- **Reviewable:** `git diff` after `fix --apply` shows only added files.
- **Idempotent:** running it twice changes nothing.
- **Honest:** generated files carry visible placeholders (`OWNER/REPO`,
  `@your-github-handle`) rather than invented values.

**Cost accepted.** No "one-click upgrade dependency". That requires editing
manifests and running installers — a different risk class, and a roadmap item
with its own review.

---

## ADR-005 — One score, but fully explainable

**Context.** A single number drives action ("62/100 — fix it"), but opaque
scores get gamed and distrusted.

**Decision.** Score = weighted mean of per-area scores; each area starts at 100
and loses `severity weight × min(occurrences, 3)` per failing rule. Every input
is visible in the report, and `repo-doctor rules` lists every rule that could
fire.

**Why**

- **Actionable ordering:** critical findings dominate the number, so the number
  matches the urgency.
- **Bounded noise:** the per-rule cap prevents one repeated low finding (17
  unpinned actions) from destroying a category.
- **Configurable:** `weights` lets a team say security matters twice as much.

**Cost accepted.** A score is a blunt instrument and is not comparable across
projects of different kinds. The README says so; `docs/report-format.md`
documents the formula.

---

## ADR-006 — JSON is the machine contract; SARIF is the GitHub contract

**Context.** Consumers are humans (terminal), CI systems (exit codes), GitHub
Code Scanning (SARIF) and coding agents (structured data).

**Decision.** Four renderers over one `ScanResult`: console (humans), Markdown
(humans, PR comments), JSON (agents/CI, `schemaVersion`-versioned), SARIF 2.1.0
(code scanning). Human hints are suppressed for the machine formats so
`--format json | jq` never breaks.

**Why**

- **No adapter layer to maintain:** renderers are pure functions of the model.
- **Agent-friendly:** stable rule ids, `meta` with structured facts, and
  `fix.safe` tell an agent what it may do without parsing prose.
- **Standards over invention:** SARIF means zero integration work for GitHub,
  VS Code and other consumers.

**Cost accepted.** Four renderers to keep in sync as fields are added;
mitigated by rendering all four in the engine test suite.

---

## ADR-007 — Line-based manifest parsing instead of real parsers

**Context.** Real TOML/YAML parsers are heavy and would break ADR-002.

**Decision.** Extract dependency declarations with targeted regular
expressions and section tracking (`[project]`, `[tool.poetry.dependencies]`,
`require (...)` blocks, `gem "x"` lines).

**Why**

- **No dependency, no execution** of the analysed project's config.
- **Good enough for the question asked:** we need names and version ranges, not
  a complete data model.

**Cost accepted.** Exotic syntax (inline tables spanning lines, `include`
directives, dynamic versions) may be missed. Documented per ecosystem in
`src/rules/deps/parse.ts`; the `deps/none-detected` rule makes a blind spot
visible instead of silent.

---

## ADR-008 — Severity is a default, not a verdict

**Context.** Every rule fires on something someone considers fine.

**Decision.** Severities ship with defaults tuned for a typical public library,
and every rule can be disabled or re-graded per project. There is no inline
suppression syntax; the decision lives in one reviewable config file.

**Why**

- **One place to look:** `.repodoctorrc.json` explains why a rule is off.
- **No comment litter:** inline ignores accumulate and hide intent.
- **Honest defaults:** documentation and security weigh more than polish, and
  `info` findings never affect the score.

**Cost accepted.** Per-file exceptions are impossible; projects with a genuinely
special path must ignore the path or disable the rule globally.
