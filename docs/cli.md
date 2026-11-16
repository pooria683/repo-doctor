# CLI reference

```
repo-doctor <command> [path] [options]
```

Exit codes are consistent across commands:

| Code | Meaning |
| ---- | ------- |
| `0` | Success; nothing at or above `--fail-on` |
| `1` | Findings at or above `--fail-on` |
| `2` | Invalid usage (bad flag, bad value, missing path, unknown fix id) |
| `3` | Unexpected failure (I/O error, unreadable report) |

## `repo-doctor scan [path]`

Scans a repository and reports findings. Never writes unless `--output` or
`--save` is passed.

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--format <console\|markdown\|json\|sarif>` | `console` | Output format |
| `--output <file>` | — | Write the report to a file (parent directories are created) |
| `--save` | off | Also write `.repo-doctor/report.json` and `.repo-doctor/report.md` |
| `--fail-on <critical\|high\|medium\|low\|never>` | `high` | Exit `1` when a finding at or above this severity exists |
| `--ignore <glob>` | — | Extra ignore pattern, repeatable |
| `--only <rule\|category>` | — | Run only these rules/categories, repeatable |
| `--category <name>` | — | Shorthand for `--only <category>` |
| `--config <file>` | auto-discovery | Use a specific config file |
| `--license <spdx>` | from config | License used by generated fixes |
| `--owner <name>` | git remote owner | Copyright holder for the LICENSE |
| `--max-files <n>` | `5000` | Cap the number of files walked |
| `--include-info` / `--no-info` | include | Toggle info-level findings |
| `--verbose` | off | Show every finding in console output |
| `--quiet` | off | No output at all; use the exit code |
| `--no-color` | auto | Disable ANSI colours |

Notes:

- When `--format` is not `console` and `--output` is omitted, the report goes to
  stdout and nothing else is printed — safe to pipe.
- When `--format` is not `console` **and** `--output` is given, a short console
  summary is still printed so interactive runs are not silent.

```bash
repo-doctor scan .
repo-doctor scan ../my-lib --format markdown --output report.md
repo-doctor scan . --only security --fail-on critical --quiet
repo-doctor scan . --format json | jq '.summary'
```

## `repo-doctor fix [path]`

Previews or applies the safe fixes implied by a scan. Only files that do not
exist are created; existing files are reported as skipped.

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--dry-run` | on | Show the plan and diffs, write nothing |
| `--apply` | off | Write the files |
| `--only <fix-id>` | all | Restrict to specific fix ids, repeatable |
| `--diff` | on when dry-run | Print a unified diff for each new file |
| `--format <text\|json>` | `text` | `json` emits the plan and results |
| `--license <spdx>` | from config | MIT, ISC, BSD-3-Clause or Unlicense |
| `--owner <name>` | git remote owner | Copyright holder |
| `--config <file>` | auto | Config file |
| `--no-color` | auto | Disable colours |

Fix ids: `add-readme`, `add-license`, `add-contributing`,
`add-code-of-conduct`, `add-security-policy`, `add-changelog`,
`add-issue-templates`, `add-pr-template`, `add-gitignore`, `add-dockerignore`,
`add-editorconfig`, `add-ci-workflow`, `add-dependabot`, `add-codeowners`,
`add-funding`, `add-maintainers`, `add-test-scaffold`, `add-config`.

```bash
repo-doctor fix --dry-run                 # review first
repo-doctor fix --apply                   # then write
repo-doctor fix --apply --only add-ci-workflow
repo-doctor fix --format json | jq '.written'
```

> Generated files contain deliberate placeholders (`OWNER/REPO`,
> `@your-github-handle`, the Code of Conduct contact). Repo Doctor never guesses
> names, emails or funding accounts — fill those in before committing.

## `repo-doctor report`

Re-renders a saved scan without scanning again. Useful when CI runs the scan
once and publishes several artefacts.

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--from <file>` | `.repo-doctor/report.json` | Report to read (a bare path also works as the first positional) |
| `--format <console\|markdown\|json\|sarif>` | `markdown` | Output format |
| `--output <file>` | stdout | Write to a file |
| `--verbose` | off | Full list in console format |
| `--no-color` | auto | Disable colours |

```bash
repo-doctor scan . --save
repo-doctor report --format sarif --output repo-doctor.sarif
repo-doctor report --from old-report.json --format console
```

## `repo-doctor init [path]`

Bootstraps a repository: README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT,
SECURITY, CHANGELOG, MAINTAINERS, issue/PR templates, CODEOWNERS, `.gitignore`,
`.editorconfig`, CI workflows, Dependabot config and `.repodoctorrc.json`.
Existing files are never touched.

| Option | Default | Description |
| ------ | ------- | ----------- |
| `--name <name>` | `package.json` name or directory name | Project name |
| `--owner <owner>` | git remote owner | GitHub handle / copyright holder |
| `--description <text>` | `package.json` description | One-line description |
| `--license <spdx>` | `MIT` | MIT, ISC, BSD-3-Clause, Unlicense |
| `--ci <github-actions\|none>` | `github-actions` | Add CI and Dependabot |
| `--minimal` | off | Only README, LICENSE, `.gitignore`, `.editorconfig`, config |
| `--yes` | on | Non-interactive (no prompts exist) |
| `--no-color` | auto | Disable colours |

`.dockerignore` is only generated when a Dockerfile already exists.

```bash
repo-doctor init . --name awesome-lib --owner acme --license MIT
repo-doctor init ./new-project --minimal --ci none
```

## `repo-doctor rules`

| Option | Description |
| ------ | ----------- |
| `--format <table\|json>` | Output format (default `table`) |
| `--category <name>` | Filter by category, repeatable |
| `--validate` | Check the registry for duplicate ids and bad metadata |

```bash
repo-doctor rules
repo-doctor rules --category security
repo-doctor rules --format json | jq '.[].id'
repo-doctor rules --validate     # used in CI
```

## Global flags

`-h, --help` (also per command: `repo-doctor scan --help`), `-v, --version`,
`--no-color`.

## Environment variables

| Variable | Effect |
| -------- | ------ |
| `NO_COLOR` | Disable colours (any non-empty value) |
| `FORCE_COLOR` | Enable colours even without a TTY (`FORCE_COLOR=0` disables) |
| `REPO_DOCTOR_DEBUG=1` | Print stack traces on unexpected errors |

Nothing else is read from the environment — no tokens, no config overrides
hidden in variables.
