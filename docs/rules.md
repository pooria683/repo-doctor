# Rule catalogue

Every rule has a stable id of the form `<category>/<name>`, a default severity,
and a documentation anchor. Ids never change; disable a rule instead of
renaming it.

- [How rules work](#how-rules-work)
- [Documentation rules](#documentation-rules)
- [Security rules](#security-rules)
- [Dependency rules](#dependency-rules)
- [Quality rules](#quality-rules)
- [Container rules](#container-rules)
- [CI rules](#ci-rules)
- [Community rules](#community-rules)
- [Tuning and suppression](#tuning-and-suppression)

## How rules work

A rule is a pure function of a read-only snapshot of the repository:

```ts
interface Rule {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  description: string;
  tags?: string[];
  requiresFile?: string[];   // skip the rule when none of these exist
  run(ctx: RuleContext): Finding[] | Promise<Finding[]>;
}
```

`RuleContext` exposes the walked file list, a cached reader, glob search and
git facts (tracked files, remote, branch). Rules never write, never spawn
processes and never touch the network, which is what makes it safe to run them
against untrusted repositories.

Adding a rule takes four steps: write it in `src/rules/<group>.ts`, add it to
the array exported from that file, register it in `src/rules/index.ts` if the
group is new, and document it here (a test enforces this last step).

Severity defaults are a starting point, not a verdict. Lower them in
`.repodoctorrc.json` if a rule is noisy for your project.

## Documentation rules

| Rule | Severity | Detects | Auto-fix |
| ---- | -------- | ------- | -------- |
| `docs/readme-missing` | high | No `README.*` at the repository root | `add-readme` |
| `docs/readme-thin` | medium | README under 600 characters, or missing install/usage/license sections | — |
| `docs/license-missing` | high | No `LICENSE`, `LICENCE`, `COPYING` file | `add-license` |
| `docs/license-unrecognized` | low | License file whose text matches no known SPDX license | — |
| `docs/license-metadata-missing` | low | Manifest without a `license` field, or a mismatch with the LICENSE file | — |
| `docs/contributing-missing` | medium | No `CONTRIBUTING.md` at root, in `docs/` or `.github/` | `add-contributing` |
| `docs/code-of-conduct-missing` | medium | No `CODE_OF_CONDUCT.md` | `add-code-of-conduct` |
| `docs/security-policy-missing` | low | No `SECURITY.md` | `add-security-policy` |
| `docs/changelog-missing` | low | No `CHANGELOG.md` and at least 15 commits | `add-changelog` |
| `docs/issue-templates-missing` | low | No `.github/ISSUE_TEMPLATE/*` | `add-issue-templates` |
| `docs/pr-template-missing` | low | No `PULL_REQUEST_TEMPLATE` | `add-pr-template` |

### `docs/readme-missing`

- **Detects:** no `README.md`, `.markdown`, `.rst`, `.txt`, `.mdx` or plain `README` at the root.
- **Why it matters:** the README is the project's front page. Without it, visitors cannot tell what the project does, whether it is maintained, or how to start.
- **Fix:** create a README with purpose, install, usage, contributing and license sections. `repo-doctor fix --apply` scaffolds one.

### `docs/readme-thin`

- **Detects:** a README shorter than 600 characters, or one whose headings never mention installation, usage or licensing (case-insensitive keyword matching, so `Quick start` counts as usage).
- **Why it matters:** the three questions a visitor asks first are "what is this", "how do I run it" and "can I use it". A short README answers none of them.
- **Fix:** add the missing sections. The finding lists exactly which ones are missing in `meta.missingSections`.
- **False positives:** a deliberately minimal README for a tiny script. Lower it to `info` or disable it.

### `docs/license-missing`

- **Detects:** no license file at the root.
- **Why it matters:** without a license, default copyright applies. Nobody may legally copy, modify or redistribute the code — the project is *not* open source, regardless of what the README claims.
- **Fix:** add `LICENSE` with a recognized license. `repo-doctor fix --apply --license MIT` renders MIT, ISC, BSD-3-Clause or Unlicense offline; other licenses must be added by hand.

### `docs/license-unrecognized`

- **Detects:** a license file shorter than 40 characters, or text that matches none of the known license signatures (MIT, Apache-2.0, GPL/AGPL/LGPL, MPL-2.0, BSD, ISC, Unlicense, CC0, EPL, BSL).
- **Why it matters:** package registries, dependency scanners and corporate legal review all rely on machine-recognizable license text. Custom wording usually gets classified as "unknown", which blocks adoption.
- **Fix:** use an SPDX-recognized license text, or document the terms explicitly in the README.

### `docs/license-metadata-missing`

- **Detects:** `package.json` without `license`, or a `license` value whose family does not match the LICENSE file (e.g. manifest says `Apache-2.0`, file looks like MIT). For Python, a `pyproject.toml` without a license entry.
- **Why it matters:** registries read the manifest, not the LICENSE file. Conflicting metadata creates legal ambiguity.
- **Fix:** align both sources.

### `docs/contributing-missing`

- **Detects:** no `CONTRIBUTING` file at the root, in `docs/`, or in `.github/`.
- **Why it matters:** GitHub links this file on every new issue and PR. Without it, contributors guess at the setup and test commands, and maintainers repeat the same answers.
- **Fix:** `repo-doctor fix --apply` creates one covering setup, tests, commits, PR flow and label taxonomy.

### `docs/code-of-conduct-missing`

- **Detects:** no `CODE_OF_CONDUCT` file in the usual locations.
- **Why it matters:** a code of conduct states expected behaviour and gives maintainers a documented path to act on harassment reports.
- **Fix:** adopt Contributor Covenant 2.1 and fill in the enforcement contact. The generated file intentionally contains a placeholder.

### `docs/security-policy-missing`

- **Detects:** no `SECURITY.md` (root, `docs/`, `.github/`).
- **Why it matters:** without a private reporting channel, vulnerabilities arrive as public issues — visible to attackers before a fix exists.
- **Fix:** add supported versions, a reporting channel, and response-time expectations.

### `docs/changelog-missing`

- **Detects:** no `CHANGELOG`/`CHANGES`/`HISTORY`/`RELEASES` file, skipped for repositories under 15 commits (nothing to changelog yet).
- **Why it matters:** consumers upgrading a dependency need to know what changed and whether a release is breaking.
- **Fix:** use Keep a Changelog, or automate with release-please / semantic-release.

### `docs/issue-templates-missing`

- **Detects:** no `.github/ISSUE_TEMPLATE/` directory and no legacy `ISSUE_TEMPLATE.md`.
- **Why it matters:** unstructured bug reports omit versions and reproductions, so every issue costs a round trip.
- **Fix:** `repo-doctor fix --apply` creates bug, feature and good-first-issue forms plus the chooser config.

### `docs/pr-template-missing`

- **Detects:** no `PULL_REQUEST_TEMPLATE.md` (root, `docs/`, `.github/` or `.github/PULL_REQUEST_TEMPLATE/`).
- **Why it matters:** a short checklist is the cheapest way to get contributors to add tests and a changelog entry.

## Security rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `security/committed-secret` | critical | Credential-shaped strings in source files |
| `security/private-key-file` | critical | `*.pem`, `*.key`, `id_rsa`… files containing (or being) private keys |
| `security/sensitive-file-tracked` | high | `.env`, `.npmrc`, `.netrc`, `credentials.json`… tracked by git |
| `security/env-file-present` | low | Untracked `.env` present on disk |
| `security/gitignore-missing` | high | No `.gitignore` |
| `security/gitignore-incomplete` | medium | `.gitignore` without `.env`, dependencies, logs, editor noise |
| `security/committed-data-dump` | high | `*.sql`, `*.dump`, archives tracked by git |

### `security/committed-secret`

- **Detects:** AWS, GitHub, GitLab, Slack, Stripe, Google, npm, PyPI, SendGrid, Twilio, Telegram, Discord, Heroku credentials, PEM private keys, JWTs, database URLs with inline passwords, and generic `password = "…"` assignments that pass an entropy check.
- **Severity:** `critical` when the file is tracked (or the repository is not under git), `high` when the file exists but is untracked, `low` for documentation/test/fixture paths.
- **Privacy:** the raw value is **never** written to a finding. Evidence looks like `AKIA******** (20 chars, sha256:3f1c9a02)`.
- **Why it matters:** anyone with read access — including everyone holding a fork — can use the credential. Deleting the file does not remove it from history.
- **Fix:** rotate first, then remove the file, purge history with `git filter-repo`, and load the value from the environment or a secret manager. Automated fixing is deliberately not offered.
- **False positives:** documentation examples are detected but demoted to `low`; add paths to `ignore` if a fixture keeps firing.

### `security/private-key-file`

- **Detects:** key-extension files whose contents include a PEM private-key header, plus bare `id_rsa`/`id_ed25519`/`id_ecdsa`/`id_dsa` files.
- **Why it matters:** key pairs cannot be "changed" like a password; a leaked private key allows impersonation until the public key is removed everywhere.
- **Fix:** revoke, regenerate, distribute out of band, purge from history.

### `security/sensitive-file-tracked`

- **Detects:** tracked files matching the built-in sensitive patterns (`.env`, `*.pem`, `*.key`, `.npmrc`, `.netrc`, `credentials.json`, `service-account*.json`, `.aws/credentials`, `.kube/config`…) or patterns you add via `sensitiveFiles`.
- **Exempt:** `.env.example`, `.env.sample`, `.env.template` (and key files, which are covered by the rule above).
- **Fix:** `git rm --cached <file>`, add it to `.gitignore`, commit an example file instead, and rotate whatever it contained.

### `security/env-file-present`

- **Detects:** untracked `.env*` files on disk.
- **Severity:** `info` when `.gitignore` already covers `.env`, `medium` otherwise.
- **Why it matters:** one careless `git add -A` publishes live credentials.

### `security/gitignore-missing`

- **Detects:** no `.gitignore` at the root.
- **Why it matters:** every ecosystem produces artefacts (`node_modules`, `.venv`, `dist`, `.env`) that must never be committed.
- **Fix:** `repo-doctor fix --apply` generates a language-aware `.gitignore`.

### `security/gitignore-incomplete`

- **Detects:** a `.gitignore` missing `.env`, `node_modules/` (for Node projects), `*.log`, `.DS_Store`, `*.pem`/`*.key`, or editor directories.
- **Why it matters:** missing ignore rules are the most common path to committing secrets and build output.

### `security/committed-data-dump`

- **Detects:** tracked `*.sql`, `*.dump`, `*.bak`, `*.sqlite`, `*.db`, `*.zip`, `*.tar.gz`, `*.7z`, `*.rar` — excluding `schema.sql`, `migrations/`, `seed*.sql` and `fixtures/`.
- **Why it matters:** dumps carry production data (personal data, password hashes) and are binary, so review cannot catch mistakes.

## Dependency rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `deps/lockfile-missing` | high | Manifest without a lockfile for that ecosystem |
| `deps/multiple-lockfiles` | medium | Two or more lockfiles for the same ecosystem |
| `deps/vulnerable-dependency` | critical/high/medium | Declared range can resolve into a known-vulnerable version |
| `deps/deprecated-dependency` | medium | Known unmaintained packages |
| `deps/wildcard-version` | medium | `*`, `latest`, `x` version ranges |
| `deps/unpinned-requirements` | low | `requirements.txt` without exact pins |
| `deps/install-script` | low/medium | `preinstall`/`install`/`postinstall` scripts |
| `deps/engines-missing` | low | `package.json` without an `engines` field |
| `deps/outdated-major` | low/medium | Dependency one or more majors behind the bundled snapshot |
| `deps/none-detected` | info | No supported manifest found |

Supported manifests: `package.json`, `requirements*.txt`, `pyproject.toml`
(PEP 621 and Poetry), `Pipfile`, `go.mod`, `Cargo.toml`, `Gemfile`,
`composer.json`. Vendored and fixture manifests (under `vendor/`,
`node_modules/`, `fixtures/`, `examples/`…) are skipped.

### `deps/lockfile-missing`

- **Detects:** at least one manifest for an ecosystem, and none of that ecosystem's lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`; `poetry.lock`, `Pipfile.lock`, `uv.lock`, `pdm.lock`; `Cargo.lock`; `go.sum`; `Gemfile.lock`; `composer.lock`).
- **Why it matters:** without a lockfile every install resolves a different transitive tree. CI passes while production fails, and a malicious patch release is pulled in silently.
- **Fix:** generate and commit the lockfile for the package manager you actually use.

### `deps/multiple-lockfiles`

- **Detects:** two or more lockfiles for one ecosystem.
- **Why it matters:** two dependency trees drift apart, producing "works on my machine" failures and duplicated vulnerability surface.

### `deps/vulnerable-dependency`

- **Detects:** a declared dependency whose range intersects the vulnerable range of an advisory in the bundled snapshot (`data/advisories.json`, currently 23 curated entries for npm, PyPI, crates.io and Go).
- **Confidence:** `meta.confidence = "yes"` means the lowest version the range allows is already vulnerable (severity as published). `"maybe"` means the range spans vulnerable versions but your lockfile may resolve above — severity is lowered one step.
- **Why it matters:** this is the check that stops a known-CVE release from shipping.
- **Limits:** the snapshot is curated, not exhaustive, and it never contacts a registry. Use `npm audit` / `pip-audit` / Dependabot for continuous coverage; use Repo Doctor to catch the obvious cases with no network and no account.
- **Fix:** upgrade to `fixedVersion` (reported per finding) and refresh the lockfile.

### `deps/deprecated-dependency`

- **Detects:** packages on the built-in deprecation list (`request`, `tslint`, `node-uuid`, `gulp-util`, `babel-eslint`, `nomnom`, `istanbul`, `left-pad`, `faker`, `crypto`, `nose`, `mock`, `distribute`).
- **Why it matters:** deprecated packages keep resolving but stop receiving security fixes.

### `deps/wildcard-version`

- **Detects:** `*`, `latest`, `x`, empty ranges, and bare requirement names without a version.
- **Why it matters:** a wildcard accepts every future release, including breaking and malicious ones.

### `deps/unpinned-requirements`

- **Detects:** `requirements.txt` entries that are not exact `==` pins, when no lockfile (`poetry.lock`, `Pipfile.lock`, `uv.lock`, `pdm.lock`) exists.
- **Why it matters:** unpinned requirements are the classic cause of "works in dev, fails in prod".

### `deps/install-script`

- **Detects:** `preinstall`, `install` or `postinstall` scripts in `package.json`.
- **Severity:** `medium` for published libraries, `low` for private apps.
- **Why it matters:** install hooks run arbitrary code on every consumer's machine and are a favourite supply-chain vector.

### `deps/engines-missing`

- **Detects:** `package.json` without `engines`.
- **Why it matters:** users on unsupported runtimes get confusing syntax errors instead of a clear message.

### `deps/outdated-major`

- **Detects:** a declared range that cannot reach the current major version in `data/known-versions.json`. `medium` when two or more majors behind, `low` at one.
- **Limits:** the snapshot has ~33 curated packages and is not a registry proxy. It exists so the offline scan can say *something* useful about age.

## Quality rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `quality/tests-missing` | high | No test files and no test script |
| `quality/test-script-missing` | medium | Test files but no working `test` script |
| `quality/lint-missing` | medium | No linter config or lint script |
| `quality/formatter-missing` | low | No formatter config or format script |
| `quality/typescript-not-strict` | low | `tsconfig.json` without `strict: true` |
| `quality/typecheck-missing` | info | TypeScript project without a typecheck script |
| `quality/editorconfig-missing` | low | No `.editorconfig` |
| `quality/package-metadata-missing` | low | Missing `description`, `repository` or `keywords` |
| `quality/large-file-committed` | medium | Tracked file larger than 1 MiB |
| `quality/formatting-config-conflict` | info | `.editorconfig` and Prettier disagree on indentation |

### `quality/tests-missing`

- **Detects:** no files matching test conventions (`*.test.*`, `*.spec.*`, `__tests__/`, `test/`, `tests/`, `*_test.go`, `test_*.py`, `*_test.rs`…) and no `test`/`tests` script.
- **Why it matters:** without tests, every PR is reviewed on trust and newcomers cannot verify their change.
- **Fix:** add a runner (node:test, Vitest, pytest, `go test`) plus a `test` script, and run it in CI.

### `quality/test-script-missing`

- **Detects:** test files exist, but `scripts.test` is missing or still the npm placeholder.
- **Why it matters:** CI and contributors both call `npm test` by convention.

### `quality/lint-missing`

- **Detects:** no ESLint/Ruff/flake8/pylint/golangci-lint/RuboCop/PHPCS/Stylelint config and no lint script.
- **Why it matters:** style debates move into code review, and entire bug classes (unused imports, missing `await`, shadowed variables) are missed.

### `quality/formatter-missing`

- **Detects:** no Prettier/Biome/rustfmt/clang-format config, no `.editorconfig`, and no format script.
- **Why it matters:** unformatted contributions create noisy diffs and merge conflicts.

### `quality/typescript-not-strict`

- **Detects:** `"strict": false`, or a `tsconfig.json` that never enables `strict` and does not extend a strict base config.
- **Why it matters:** non-strict TypeScript permits null access, implicit `any` and unsafe variance — exactly the errors that reach production.

### `quality/typecheck-missing`

- **Detects:** a TypeScript project with no `typecheck`/`type-check`/`tsc` script.
- **Why it matters:** bundlers and transpilers strip types without checking them.

### `quality/editorconfig-missing`

- **Detects:** no `.editorconfig`.
- **Why it matters:** editor defaults differ (tabs vs spaces, CRLF vs LF) and every mismatch shows up as a spurious diff.

### `quality/package-metadata-missing`

- **Detects:** a non-private `package.json` without `description`, `repository` or `keywords`.
- **Why it matters:** these three fields drive registry search results, source linking and issue reporting.

### `quality/large-file-committed`

- **Detects:** tracked files over 1 MiB (images under 3 MiB are exempt).
- **Why it matters:** large files live in history forever, slowing every clone and CI checkout.

### `quality/formatting-config-conflict`

- **Detects:** `.editorconfig` `indent_size` differing from Prettier `tabWidth`.
- **Why it matters:** files flip between two widths depending on which tool saved last.

## Container rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `containers/dockerfile-root-user` | high | No `USER`, or `USER root` |
| `containers/dockerfile-unpinned-base` | medium | `FROM image` without a tag, or `:latest` |
| `containers/dockerfile-curl-pipe-shell` | high | `curl … \| sh` / `wget … \| bash` |
| `containers/dockerfile-secret-in-env` | critical | Literal secret in `ENV`/`ARG` |
| `containers/dockerfile-add-remote` | medium | `ADD <http url>` |
| `containers/dockerfile-apt-cleanup` | low | `apt-get install` without `--no-install-recommends` / cache cleanup |
| `containers/dockerignore-missing` | medium | Dockerfile but no `.dockerignore` |
| `containers/compose-privileged` | high | `privileged: true`, Docker socket mount, host networking |

### `containers/dockerfile-root-user`

- **Detects:** a Dockerfile with no `USER` instruction, or whose last `USER` is `root`/`0`.
- **Why it matters:** a root process that escapes the container (bind mount, kernel bug, mounted socket) is root on the host.
- **Fix:** create an unprivileged user and `USER 10001:10001` before `CMD`.

### `containers/dockerfile-unpinned-base`

- **Detects:** `FROM` lines without a version tag, `:latest`, and tags without a digest.
- **Why it matters:** two builds of the same commit can contain different OS packages, and a compromised upstream tag ships silently.

### `containers/dockerfile-curl-pipe-shell`

- **Detects:** `curl`/`wget` piped into a shell inside a `RUN`.
- **Why it matters:** the remote server can serve different content on every build, with no checksum to prove what ran.

### `containers/dockerfile-secret-in-env`

- **Detects:** `ENV`/`ARG` whose name looks secret-ish (`*SECRET*`, `*TOKEN*`, `*PASSWORD*`, `*API_KEY*`…) with a literal value (not `$VAR`). Values are masked in the report.
- **Why it matters:** `ENV` is visible in `docker inspect`, `ARG` in image history. Neither is a secret store.
- **Fix:** pass secrets at runtime, or use BuildKit `RUN --mount=type=secret`.

### `containers/dockerfile-add-remote`

- **Detects:** `ADD` with an `http(s)://` source.
- **Why it matters:** `ADD` cannot verify checksums and auto-extracts archives.

### `containers/dockerfile-apt-cleanup`

- **Detects:** `apt-get install` without `--no-install-recommends` or without removing `/var/lib/apt/lists` in the same layer.
- **Why it matters:** every layer keeps its files; caches add tens of megabytes and recommendations widen the attack surface.

### `containers/dockerignore-missing`

- **Detects:** a Dockerfile without a sibling `.dockerignore`.
- **Why it matters:** the build context includes `.git` history, `node_modules` and any `.env`; `COPY . .` bakes them into the image.

### `containers/compose-privileged`

- **Detects:** `privileged: true`, `/var/run/docker.sock` mounts, and `network_mode: host` in Compose files.
- **Why it matters:** each of these is effectively a path to host control.

## CI rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `ci/workflow-missing` | high | No CI configuration at all |
| `ci/action-unpinned` | medium | `uses:` pinned to a tag or branch instead of a SHA |
| `ci/workflow-permissions-missing` | medium | No `permissions:` block (worse with `write-all`) |
| `ci/script-injection` | high | `${{ github.event.* }}` inside `run:` |
| `ci/pull-request-target-checkout` | critical | `pull_request_target` + checkout of PR head |
| `ci/dependabot-missing` | low | No Dependabot/Renovate config |
| `ci/code-scanning-missing` | info | No CodeQL workflow |

### `ci/workflow-missing`

- **Detects:** no `.github/workflows/*.yml` and no alternative (`.gitlab-ci.yml`, `.circleci/config.yml`, `azure-pipelines.yml`, `.travis.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `.drone.yml`, `appveyor.yml`).
- **Why it matters:** nothing verifies that a pull request builds or passes tests.

### `ci/action-unpinned`

- **Detects:** `uses: owner/action@<ref>` where `<ref>` is not a 40-character SHA. Major-version tags (`@v4`) are `low`; branches and floating tags are `medium`.
- **Why it matters:** tags are mutable. If an action repository is compromised or force-pushed, your workflow runs the new code with your token.
- **Fix:** pin to a commit SHA and let Dependabot bump it.

### `ci/workflow-permissions-missing`

- **Detects:** a workflow with no `permissions:` block at workflow or job level; `permissions: write-all` is raised to `high`.
- **Why it matters:** a write-scoped token plus compromised code equals pushed commits or published packages. Add `permissions: contents: read`.

### `ci/script-injection`

- **Detects:** `${{ github.event.issue.* }}`, `pull_request.*`, `comment.*`, `review.*`, `head_commit.*` or `commits.*` inside a `run:` block (inline or multiline).
- **Why it matters:** PR titles, issue bodies and branch names are attacker-controlled. Interpolating them into a shell script lets anyone execute commands in your CI.
- **Fix:** pass the value through `env:` and reference `"$TITLE"` inside the script.

### `ci/pull-request-target-checkout`

- **Detects:** a workflow triggered by `pull_request_target` that checks out `github.event.pull_request.head.sha`/`.ref` or `github.head_ref`. Raised to `critical` when the workflow also references `secrets.*`.
- **Why it matters:** `pull_request_target` runs with the base repository's secrets and a write-scoped token. Building untrusted PR code there hands secrets to any fork author.
- **Fix:** use `pull_request` for untrusted code, or a `workflow_run` follow-up job that never checks out the PR head.

### `ci/dependabot-missing`

- **Detects:** no `dependabot.yml` or Renovate config, when at least one manifest exists.
- **Why it matters:** automated updates keep dependencies patched with near-zero review overhead.

### `ci/code-scanning-missing`

- **Detects:** no workflow referencing `codeql-action`, when source files exist.
- **Why it matters:** data-flow analysis catches injection, SSRF and unsafe deserialization that tests rarely cover. Free for public repositories.

## Community rules

| Rule | Severity | Detects |
| ---- | -------- | ------- |
| `community/good-first-issue-label-missing` | low | No mention of an onboarding path or `good first issue` label |
| `community/codeowners-missing` | low | No `CODEOWNERS` |
| `community/funding-missing` | info | No `.github/FUNDING.yml` |
| `community/governance-missing` | info | No `MAINTAINERS`/`GOVERNANCE`/`AUTHORS` file |
| `community/issue-triage-missing` | info | CI exists but no labeler/greeting automation |

### `community/good-first-issue-label-missing`

- **Detects:** neither the README nor CONTRIBUTING mentions `good first issue` (also checked in `.github/labels.yml`).
- **Why it matters:** newcomers rarely guess which tasks are safe to start with. Labelling three to five well-scoped issues measurably increases first-time contributions.
- **Fix:** label small tasks, document the label, and list your labels in a file so the convention survives maintainer changes.

### `community/codeowners-missing`

- **Detects:** no `CODEOWNERS` file.
- **Why it matters:** without ownership, review requests go nowhere and it is unclear who must approve a sensitive change.

### `community/funding-missing`

- **Detects:** no `.github/FUNDING.yml`.
- **Why it matters:** a Sponsor button is the lowest-friction way for users to fund maintenance. Informational only — plenty of healthy projects do not accept funding.

### `community/governance-missing`

- **Detects:** no `MAINTAINERS`/`GOVERNANCE`/`AUTHORS`/`CONTRIBUTORS` file (skipped for repositories with fewer than 8 files).
- **Why it matters:** adopters want to know whether a project is a one-person effort before depending on it.

### `community/issue-triage-missing`

- **Detects:** workflows exist but none use `actions/labeler`, `first-interaction`, `stale-action` or a similar welcome bot.
- **Why it matters:** manual triage does not scale, and unlabelled issues get lost.

## Tuning and suppression

Disable or re-grade any rule in `.repodoctorrc.json`:

```json
{
  "rules": {
    "ci/code-scanning-missing": "off",
    "docs/changelog-missing": "info",
    "deps/install-script": { "severity": "low", "options": {} }
  },
  "ignore": ["**/fixtures/**", "vendor/**"],
  "failOn": "high"
}
```

- `"off"` skips the rule entirely (it is listed in `result.config.disabledRules`).
- A severity string re-grades every finding from that rule.
- `ignore` takes globs relative to the repository root; ignored paths are never read.
- `sensitiveFiles` and `secretPatterns` extend the security rules rather than replacing them.

Inline suppression is intentionally not supported. A rule that fires on a line
you cannot change should be disabled with a comment in the config file, so the
decision is reviewable in one place.
