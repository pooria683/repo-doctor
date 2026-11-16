<div align="center">

# 🩺 Repo Doctor

**Find out why your open-source repository is not ready yet — and fix it.**

A dependency-free CLI that audits documentation, security, dependencies, code
quality, containers, CI and community readiness, then hands you the diff.

[![CI](https://github.com/pooria683/repo-doctor/actions/workflows/ci.yml/badge.svg)](https://github.com/pooria683/repo-doctor/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-78%20passing-success)](https://github.com/pooria683/repo-doctor/tree/main/tests)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)](https://github.com/pooria683/repo-doctor/blob/main/package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18.17-339933)](https://nodejs.org)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick start](#quick-start) · [What it checks](#what-it-checks) · [Commands](#commands) · [Privacy](#privacy-by-design) · [Roadmap](docs/roadmap.md) · [فارسی](README.fa.md)

</div>

---

```console
$ npx repo-doctor scan .

  Repo Doctor  my-project

  Health   62/100  (C)   218 files · 58 rules · 92ms

  Documentation    ███████████░░░░░░░░░  55
  Security         ██████████████░░░░░░  71
  Dependencies     █████████████████░░░  85
  Code quality     ████████████████░░░░  80
  CI / automation  ████████████░░░░░░░░  61
  Community        ███████████████░░░░░  78

  ✖ HIGH (3)
    Possible AWS access key ID committed  src/config.ts:12
      security/committed-secret — AWS access key ID found in src/config.ts:12 (tracked by git).
    No lockfile for a declared dependency ecosystem  package.json
      deps/lockfile-missing — An npm manifest exists but no lockfile (package-lock.json, …) was found.
    No continuous integration workflow
      ci/workflow-missing — No CI configuration was found.

  3 safe fixes available → npx repo-doctor fix --dry-run
```

## Why another linter?

Existing tools each cover a slice: secret scanners find secrets, `npm audit`
finds CVEs, linters find style issues. None of them answer the question a
maintainer actually has — *is this repository ready to be published and
maintained?* — and almost none of them tell you what to do next.

Repo Doctor covers the whole readiness surface in one pass, scores it, and
produces **actionable fixes** instead of a wall of warnings.

Three deliberate design choices:

1. **Zero runtime dependencies.** `dependencies: {}`. No transitive supply chain in a tool that inspects your supply chain.
2. **No network, ever.** No registry lookups, no telemetry, no GitHub token. Advisory data ships as a curated snapshot you can audit and diff.
3. **Fixes are non-destructive.** `fix --apply` only *creates missing files*. It never edits, overwrites or deletes anything you wrote.

## Quick start

```bash
# no install required
npx repo-doctor scan .

# or install it
npm install -g repo-doctor
repo-doctor scan .
```

Then, if you want the scaffolding:

```bash
repo-doctor fix --dry-run    # see exactly what would be created
repo-doctor fix --apply      # write the files
repo-doctor init . --name my-lib --owner my-handle --license MIT
```

`init` on an empty directory produces a repository that already scores 97/100.

## What it checks

58 rules across seven areas. Full detail, detection logic and false-positive
notes live in [`docs/rules.md`](docs/rules.md).

| Area | Rules | Examples |
| ---- | :---: | -------- |
| 📚 Documentation | 11 | README quality and sections, LICENSE (and manifest mismatch), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, issue/PR templates |
| 🔐 Security | 7 | 20+ credential patterns, private keys, tracked `.env`, `.gitignore` coverage, data dumps |
| 📦 Dependencies | 10 | lockfiles, known-vulnerable ranges, deprecated packages, wildcards, unpinned requirements, install scripts |
| 🧪 Code quality | 10 | tests, test script, lint, formatter, TypeScript strictness, `.editorconfig`, large files, package metadata |
| 🐳 Containers | 8 | root user, unpinned base image, `curl \| sh`, secrets in `ENV`, `ADD <url>`, apt hygiene, `.dockerignore`, privileged Compose |
| ⚙️ CI | 7 | missing pipeline, unpinned actions, token permissions, script injection, `pull_request_target` abuse, Dependabot, CodeQL |
| 🤝 Community | 5 | good-first-issue path, CODEOWNERS, funding, governance, issue triage |

### Severity model

| Severity | Meaning | Example |
| -------- | ------- | ------- |
| **Critical** | Credible, exploitable, or legally blocking. Fix before publishing. | Live AWS key in a tracked file |
| **High** | Real risk or a hard blocker for contributors/users. Fix this week. | No license, no CI, `pull_request_target` misuse |
| **Medium** | Slows adoption or hides bugs. Plan it. | No CONTRIBUTING, README without install steps |
| **Low** | Polish and hygiene. Batch it. | No `.editorconfig`, no CHANGELOG |
| **Info** | Context, not a problem. | No CodeQL workflow |

Scores are explainable: each area starts at 100 and loses
`severity weight × min(occurrences, 3)` per failing rule (critical 40, high 15,
medium 6, low 2), floored at 0. The overall score is the weighted mean of the
areas (security and documentation weigh slightly more by default). No hidden
magic, and `repo-doctor rules` tells you exactly what could fire.

## Commands

| Command | What it does |
| ------- | ------------ |
| `repo-doctor scan [path]` | Scan and report. `--format console\|markdown\|json\|sarif`, `--fail-on <severity>`, `--save` |
| `repo-doctor fix [path]` | Preview (`--dry-run`, default) or write (`--apply`) safe fixes |
| `repo-doctor report` | Re-render a saved result: `--from .repo-doctor/report.json --format sarif` |
| `repo-doctor init [path]` | Scaffold docs, community files, CI and config |
| `repo-doctor rules` | List the catalogue, or `--validate` the registry |

Full reference: [`docs/cli.md`](docs/cli.md).

### In CI

```yaml
- name: Repo Doctor
  run: npx repo-doctor scan . --format markdown --fail-on high
```

SARIF output feeds GitHub code scanning, so findings appear inline in the PR:

```yaml
permissions:
  contents: read
  security-events: write
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx repo-doctor scan . --format sarif --output repo-doctor.sarif --fail-on critical
      - uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: repo-doctor.sarif
```

Exit codes: `0` clean, `1` findings at or above `--fail-on`, `2` bad usage,
`3` unexpected failure.

### For coding agents

The JSON report is the machine interface — stable schema, stable rule ids, and
`fix` metadata an agent can act on:

```json
{
  "schemaVersion": "1.0.0",
  "summary": { "score": 62, "grade": "C", "counts": { "critical": 1, "high": 3 } },
  "findings": [
    {
      "ruleId": "security/committed-secret",
      "severity": "critical",
      "category": "security",
      "file": "src/config.ts",
      "line": 12,
      "message": "AWS access key ID found in src/config.ts:12 (tracked by git).",
      "evidence": "AKIA******** (20 chars, sha256:3f1c9a02)",
      "why": "Anyone with read access …",
      "suggestion": "Rotate the credential now, remove it …",
      "fix": { "id": "add-gitignore", "kind": "create-file", "safe": true }
    }
  ]
}
```

Schema and field semantics: [`docs/report-format.md`](docs/report-format.md).
Agent integration notes: [`docs/agents.md`](docs/agents.md).

## Privacy by design

- **No network calls.** There is no `http`, `https`, `net` or `fetch` in the
  source; a test fails the build if one appears.
- **No telemetry, no accounts, no GitHub token.** Works on any directory, with
  or without a git remote, including private checkouts and air-gapped machines.
- **Secrets never leave the scanner.** Findings contain a masked shape hint and
  a truncated SHA-256 fingerprint (`AKIA******** (20 chars, sha256:3f1c9a02)`),
  never the value — so a report can be attached to a public issue.
- **Read-only.** `scan` never writes. `fix` only creates files that do not
  exist. The only child process is `git` (read-only commands, no network).

Details and threat model: [`docs/security.md`](docs/security.md).

## Configuration

Optional `.repodoctorrc.json` (or a `repoDoctor` key in `package.json`):

```json
{
  "failOn": "high",
  "ignore": ["dist/**", "coverage/**", "**/fixtures/**"],
  "rules": {
    "ci/code-scanning-missing": "off",
    "docs/changelog-missing": "info"
  },
  "weights": { "security": 2 },
  "license": "MIT",
  "copyrightHolder": "Your Name"
}
```

JSON Schema: [`schema/repodoctorrc.schema.json`](schema/repodoctorrc.schema.json).

## Programmatic API

```ts
import { scan, renderSarif } from "repo-doctor";

const { result, failed } = await scan({ path: ".", failOn: "high" });
console.log(result.summary.score, result.findings.length);
if (failed) process.exitCode = 1;
```

## How it is built

Zero runtime dependencies, TypeScript, ESM, `node:test`.

```
src/
├── cli/          argument parsing, commands, output
├── core/         context, engine, scoring, config
├── rules/        58 rules in 7 groups
├── deps/         manifest parsers
├── fix/          recipes + planner
├── init/         file templates
├── report/       console, markdown, json, sarif
└── util/         glob, semver, fs, git, text
```

Module responsibilities, data flow and extension points:
[`docs/architecture.md`](docs/architecture.md).

## Roadmap

- [x] **v0.1** — offline scanner, 58 rules, 4 report formats, safe fixes, `init`
- [ ] **v0.2** — HTML report, `--baseline` (only new findings), monorepo awareness
- [ ] **v0.3** — optional `--online` advisory lookup (explicit opt-in, documented egress)
- [ ] **v0.4** — GitHub App / PR bot, custom rule plugins
- [ ] **v1.0** — stable schema, plugin API, translations

Details, milestones and non-goals: [`docs/roadmap.md`](docs/roadmap.md).

## Contributing

Contributions are very welcome — especially new rules, new ecosystem parsers
and documentation. Start with a [`good first issue`](https://github.com/pooria683/repo-doctor/labels/good%20first%20issue),
read [CONTRIBUTING.md](CONTRIBUTING.md), and follow our
[Code of Conduct](CODE_OF_CONDUCT.md).

```bash
git clone https://github.com/pooria683/repo-doctor.git
cd repo-doctor
npm install
npm test          # 78 tests, ~4s
npm run self-scan # Repo Doctor, on Repo Doctor
```

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).
Do not open a public issue for a security problem.

## License

[MIT](LICENSE) © 2025 Repo Doctor contributors
