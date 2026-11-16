# Contributing to Repo Doctor

Thanks for taking the time to contribute. This project is built almost entirely
by people who started with a small pull request, so you are in good company.

- [Code of Conduct](#code-of-conduct)
- [Good first issues](#good-first-issues)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Adding a rule](#adding-a-rule)
- [Adding an ecosystem](#adding-an-ecosystem)
- [Before you open a pull request](#before-you-open-a-pull-request)
- [Commit messages](#commit-messages)
- [Review process](#review-process)

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you agree to uphold it. Report unacceptable behaviour to the
maintainer listed in that document.

## Good first issues

Issues labelled [`good first issue`](https://github.com/pooria683/repo-doctor/labels/good%20first%20issue)
are chosen to be:

- **small** — one file, one concept, under ~100 lines of change;
- **self-contained** — no prior knowledge of the scanner internals;
- **testable** — the issue states how to verify the change.

A good first issue takes one to four hours. If you get stuck, ask in the issue —
nobody expects you to know the codebase yet, and a question is not a delay.

Also labelled [`help wanted`](https://github.com/pooria683/repo-doctor/labels/help%20wanted):
larger items where a maintainer would actively mentor a contributor.

## Ways to contribute

| Contribution | Where to start |
| ------------ | -------------- |
| Report a bug | [Bug report form](https://github.com/pooria683/repo-doctor/issues/new?template=bug_report.yml) — a minimal reproduction is the most valuable thing you can give us |
| Request a feature | [Feature request form](https://github.com/pooria683/repo-doctor/issues/new?template=feature_request.yml) — describe the problem before the solution |
| Fix documentation | Typos, unclear steps and missing examples are real bugs; PRs welcome with no issue |
| Add a rule | See [Adding a rule](#adding-a-rule) |
| Add an ecosystem | See [Adding an ecosystem](#adding-an-ecosystem) |
| Tune false positives | Run `npm run self-scan` on a repository you maintain and tell us what fired wrongly |
| Translate | We would like the rule catalogue in more languages; open an issue first |

## Development setup

Requirements: **Node.js ≥ 18.17** and `git`. No Docker, no database, no tokens.

```bash
git clone https://github.com/pooria683/repo-doctor.git
cd repo-doctor
npm install          # installs TypeScript and @types/node only
npm test             # builds the tests and runs 78 of them (~4s)
npm run build        # compiles src/ to dist/
npm run self-scan    # Repo Doctor, on Repo Doctor
```

Useful commands:

| Command | What it does |
| ------- | ------------ |
| `npm test` | Compile + run the whole suite |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | repository guard rails (see `scripts/lint-guard.mjs`) |
| `npm run self-scan` | build, then scan this repository |
| `node dist/cli/index.js scan /tmp/some-repo` | Try it on another repository |
| `node dist/cli/index.js fix /tmp/some-repo --dry-run` | Inspect the generated fixes |

There is no watch mode: the suite is fast enough to run on every save.

## Project layout

```
src/
├── types.ts            shared vocabulary — a change here is a breaking change
├── cli/                args, commands, output
├── core/               context, engine, config, score, project, public API
├── rules/              58 rules in 7 group files, plus deps/ manifest parsers
├── fix/                recipes (content) + planner (writing)
├── init/templates.ts   every generated file
├── report/             console, markdown, json, sarif
├── util/               glob, semver, fs, git, text
└── data/               advisory + version snapshots
tests/                  node:test suites, one per concern
docs/                   architecture, modules, rules, CLI, report format, security
```

Dependencies point downwards only: rules never import renderers, renderers never
import rules.

## Adding a rule

1. **Pick a group file** in `src/rules/` (`docs.ts`, `secrets.ts`, `deps.ts`,
   `quality.ts`, `containers.ts`, `github.ts`, `community.ts`). A new domain
   gets a new file plus an entry in `src/rules/index.ts`.
2. **Write the rule** as a plain object:

   ```ts
   const myRule: Rule = {
     id: "quality/no-debugger",
     title: "Leftover debugger statement",
     category: "quality",
     severity: "low",
     description: "A committed `debugger` statement halts execution in browsers.",
     requiresFile: ["**/*.js"],
     tags: ["quality"],
     run(ctx) {
       const create = createFinder(myRule);
       return ctx
         .find(["**/*.js"])
         .flatMap((file) =>
           ctx.lines(file)
             .filter((line) => /^\s*debugger\s*;?\s*$/.test(line.text))
             .map((line) => create({ file, line: line.number, message: "…", why: "…", suggestion: "…" })),
         );
     },
   };
   ```

3. **Append it** to the array the file exports.
4. **Document it** in `docs/rules.md` — a test (`registry: every rule is
   documented`) fails if you forget.
5. **Test it** in `tests/` with both a failing and a passing fixture.

### Rule checklist

- [ ] Id is `<category>/<kebab-name>` and stable forever.
- [ ] `description` explains the *why*, not the *what*.
- [ ] Every finding has `message`, `why` and `suggestion`.
- [ ] `requiresFile` short-circuits the rule when the target does not exist.
- [ ] No raw secret, token or personal data in `evidence` — use `maskSecret`.
- [ ] No filesystem writes, no subprocesses, no network.
- [ ] Regexes are linear; no nested quantifiers over unbounded input.
- [ ] Findings include `file`/`line` when they point at a location.
- [ ] False positives are considered and noted in `docs/rules.md`.

## Adding an ecosystem

1. Parse the manifest in `src/rules/deps/parse.ts` (line-based, never execute).
2. Register the filename in `manifestFiles()` and the lockfiles in `LOCKFILES`.
3. Add the `Ecosystem` union member in `src/data/index.ts`.
4. Add advisory entries to `data/advisories.json` (with real ids and URLs).
5. Add fixtures to `tests/deps.test.ts`.

## Before you open a pull request

1. **Open an issue first** for anything larger than a typo — it avoids wasted work.
2. Keep the change focused: one logical change per pull request.
3. Run the checks locally:

   ```bash
   npm test && npm run typecheck && npm run self-scan
   ```

4. Add or update tests. A bug fix without a test will be sent back, kindly.
5. Update `docs/rules.md` for new rules and `docs/cli.md` for new flags.
6. Add a `CHANGELOG.md` entry under `## [Unreleased]` for user-visible changes.
7. Check the diff for secrets. Yes, really — this project has a rule for it.

## Commit messages

Short imperative subject, ≤ 72 characters:

```
add containers/dockerfile-secret-in-env rule
fix: false positive on .env.example
docs: explain confidence levels in report format
```

Prefixes used in this repository: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`,
`chore:`. The body explains *why* when the change is not obvious. Pull requests
are squash-merged, so do not worry about commit hygiene inside your branch.

## Review process

- A maintainer reviews within about a week. A polite ping after that is welcome.
- Reviews focus on correctness, false positives and tests — not on style, which
  is enforced by tooling.
- We may ask for changes; that is normal and not a judgement of your work.
- Small, focused PRs get merged faster than large ones, always.
- Once you have landed a few substantive changes, you will be invited to review
  others' work and, eventually, to become a maintainer.

## Issue labels

| Label | Meaning |
| ----- | ------- |
| `good first issue` | Small, well-scoped, no prior knowledge needed |
| `help wanted` | A maintainer would welcome a contributor here |
| `bug` | Something behaves incorrectly |
| `enhancement` | New capability or improvement |
| `documentation` | Docs-only change |
| `needs triage` | Not yet reviewed by a maintainer |
| `rule: false positive` | A rule fired on something harmless |
| `blocked` | Waiting on a decision or another change |
