# 🩺 Repo Doctor Report

**Target:** `example-app` (a deliberately unhealthy demo repository) · **Score:** **34/100** (F — critical) · **Files scanned:** 10 · **Rules run:** 55

> 🔴 **6** critical · 🟠 **14** high · 🟡 **16** medium · 🔵 **17** low · ⚪ **5** info

## Top priorities

1. Secret baked into the image via ENV/ARG (Dockerfile)
2. Arbitrary code execution via yaml.full_load in pyyaml (requirements.txt)
3. Possible AWS access key ID committed (src/config.js)
4. Possible Database URL containing credentials committed (src/config.js)
5. Possible Stripe secret key committed (src/config.js)

## Health by area

| Area | Score | Grade | Critical | High | Medium | Low |
| ---- | ----: | :---: | -------: | ---: | -----: | --: |
| Documentation | 50 | F | 0 | 2 | 2 | 4 |
| Security | 0 | F | 4 | 2 | 0 | 0 |
| Dependencies | 0 | F | 1 | 3 | 7 | 3 |
| Code quality | 76 | C | 0 | 0 | 2 | 6 |
| Containers | 0 | F | 1 | 4 | 3 | 1 |
| CI / automation | 35 | F | 0 | 3 | 2 | 2 |
| Community | 98 | A | 0 | 0 | 0 | 1 |

## 🔴 Critical (6)

#### 1. 🔴 Secret baked into the image via ENV/ARG

- **Rule:** `containers/dockerfile-secret-in-env` · **Severity:** 🔴 Critical · **Area:** containers
- **Where:** `Dockerfile`:2
- **What:** ENV API_KEY appears to contain a literal secret.
- **Evidence:** `API_KEY=ab************ (21 chars, sha256:4427f6a6)`
- **Why it matters:** ENV values are visible in `docker inspect` and ARG values are recorded in image history; neither is a secret store.
- **Fix:** Pass secrets at runtime (env vars from your orchestrator, mounted files) or use BuildKit `RUN --mount=type=secret` for build-time credentials.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-secret-in-env

#### 2. 🔴 Arbitrary code execution via yaml.full_load in pyyaml

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🔴 Critical · **Area:** dependencies
- **Where:** `requirements.txt`:4
- **What:** pyyaml@==5.1 is inside the vulnerable range <5.4. Fixed in 5.4.
- **Evidence:** `GHSA-8q59-q68h-6hv4 / CVE-2020-14343 — PyYAML's full_load deserializes arbitrary Python objects, allowing remote code execution.`
- **Why it matters:** PyYAML's full_load deserializes arbitrary Python objects, allowing remote code execution.
- **Fix:** Upgrade pyyaml to 5.4 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-8q59-q68h-6hv4

#### 3. 🔴 Possible AWS access key ID committed

- **Rule:** `security/committed-secret` · **Severity:** 🔴 Critical · **Area:** security
- **Where:** `src/config.js`:1
- **What:** AWS access key ID found in src/config.js:1 (tracked by git).
- **Evidence:** `AKIA************ (20 chars, sha256:1a5d44a2)`
- **Why it matters:** Anyone with read access (or a fork, or a leaked clone) can use this credential. Deleting the file does not remove it from git history.
- **Fix:** Rotate the credential now, remove it from the working tree, purge it from git history (git filter-repo), and load secrets from environment variables or a secret manager.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitycommitted-secret

#### 4. 🔴 Possible Database URL containing credentials committed

- **Rule:** `security/committed-secret` · **Severity:** 🔴 Critical · **Area:** security
- **Where:** `src/config.js`:3
- **What:** Database URL containing credentials found in src/config.js:3 (tracked by git).
- **Evidence:** `supe************ (19 chars, sha256:5ac152b6)`
- **Why it matters:** Anyone with read access (or a fork, or a leaked clone) can use this credential. Deleting the file does not remove it from git history.
- **Fix:** Rotate the credential now, remove it from the working tree, purge it from git history (git filter-repo), and load secrets from environment variables or a secret manager.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitycommitted-secret

#### 5. 🔴 Possible Stripe secret key committed

- **Rule:** `security/committed-secret` · **Severity:** 🔴 Critical · **Area:** security
- **Where:** `src/config.js`:4
- **What:** Stripe secret key found in src/config.js:4 (tracked by git).
- **Evidence:** `sk_l************ (35 chars, sha256:e5a182f5)`
- **Why it matters:** Anyone with read access (or a fork, or a leaked clone) can use this credential. Deleting the file does not remove it from git history.
- **Fix:** Rotate the credential now, remove it from the working tree, purge it from git history (git filter-repo), and load secrets from environment variables or a secret manager.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitycommitted-secret

#### 6. 🔴 Private key file in the repository

- **Rule:** `security/private-key-file` · **Severity:** 🔴 Critical · **Area:** security
- **Where:** `id_rsa`
- **What:** id_rsa looks like a private key and is tracked by git.
- **Why it matters:** Leaked private keys allow impersonation of servers, signing authorities or clients, and cannot be revoked the way passwords can.
- **Fix:** Revoke and rotate the key pair, remove the file from the repository and its history, and distribute keys out of band.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securityprivate-key-file

## 🟠 High (14)

#### 1. 🟠 pull_request_target combined with checkout of PR code

- **Rule:** `ci/pull-request-target-checkout` · **Severity:** 🟠 High · **Area:** ci
- **Where:** `.github/workflows/ci.yml`:9
- **What:** Workflow triggered by `pull_request_target` checks out and executes code from the pull request head.
- **Evidence:** `ref: ${{ github.event.pull_request.head.sha }}`
- **Why it matters:** `pull_request_target` runs in the context of the base branch with repository secrets and a write-scoped token. Building or testing untrusted PR code there is equivalent to publishing your secrets to whoever opens a PR.
- **Fix:** Split the workflow: use `pull_request` for untrusted code, and if you need secrets for a follow-up job, use a separate workflow triggered by `workflow_run` with no untrusted checkout.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#cipull-request-target-checkout

#### 2. 🟠 Untrusted event data interpolated into a shell command

- **Rule:** `ci/script-injection` · **Severity:** 🟠 High · **Area:** ci
- **Where:** `.github/workflows/ci.yml`:11
- **What:** Shell command interpolates untrusted event data: ${{ github.event.pull_request.title }}
- **Evidence:** `- run: echo "${{ github.event.pull_request.title }}"`
- **Why it matters:** Pull request titles, issue bodies and branch names are attacker-controlled. Interpolating them into a shell script lets anyone run arbitrary commands in your CI with access to secrets.
- **Fix:** Pass untrusted values through an environment variable instead: `env: TITLE: ${{ github.event.pull_request.title }}` then use "$TITLE" inside run.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#ciscript-injection

#### 3. 🟠 Untrusted event data interpolated into a shell command

- **Rule:** `ci/script-injection` · **Severity:** 🟠 High · **Area:** ci
- **Where:** `.github/workflows/ci.yml`:14
- **What:** Shell command interpolates untrusted event data: ${{ github.event.issue.title }}
- **Evidence:** `echo "${{ github.event.issue.title }}"`
- **Why it matters:** Pull request titles, issue bodies and branch names are attacker-controlled. Interpolating them into a shell script lets anyone run arbitrary commands in your CI with access to secrets.
- **Fix:** Pass untrusted values through an environment variable instead: `env: TITLE: ${{ github.event.pull_request.title }}` then use "$TITLE" inside run.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#ciscript-injection

#### 4. 🟠 Compose service runs privileged or mounts the Docker socket

- **Rule:** `containers/compose-privileged` · **Severity:** 🟠 High · **Area:** containers
- **Where:** `docker-compose.yml`:4
- **What:** Service runs with `privileged: true`.
- **Evidence:** `privileged: true`
- **Why it matters:** A privileged container has all capabilities and device access: escaping to the host requires no exploit.
- **Fix:** Drop `privileged` and add only the specific `cap_add` entries (or `devices:`) the service needs.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containerscompose-privileged

#### 5. 🟠 Compose service runs privileged or mounts the Docker socket

- **Rule:** `containers/compose-privileged` · **Severity:** 🟠 High · **Area:** containers
- **Where:** `docker-compose.yml`:6
- **What:** Docker socket is mounted into the container.
- **Evidence:** `- /var/run/docker.sock:/var/run/docker.sock`
- **Why it matters:** Access to the Docker socket is root-equivalent on the host: the container can start a new privileged container.
- **Fix:** Avoid mounting the socket; use a read-only proxy (docker-socket-proxy) or a dedicated build service.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containerscompose-privileged

#### 6. 🟠 Remote script piped into a shell during build

- **Rule:** `containers/dockerfile-curl-pipe-shell` · **Severity:** 🟠 High · **Area:** containers
- **Where:** `Dockerfile`:3
- **What:** Build step pipes a downloaded script straight into a shell.
- **Evidence:** `RUN curl -fsSL https://example.com/install.sh | bash`
- **Why it matters:** The remote server can serve different (or malicious) content on every build, and there is no checksum to verify what actually ran.
- **Fix:** Download the installer, verify its checksum or signature, then execute it — or install from your distribution's package manager.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-curl-pipe-shell

#### 7. 🟠 Container runs as root

- **Rule:** `containers/dockerfile-root-user` · **Severity:** 🟠 High · **Area:** containers
- **Where:** `Dockerfile`
- **What:** Dockerfile never sets USER, so the container process runs as root.
- **Why it matters:** A root process inside the container that escapes (bind-mount, kernel bug, mounted socket) is root on the host. Root also makes accidental file ownership changes on volumes much more likely.
- **Fix:** Create an unprivileged user (`RUN adduser --system app`) and switch with `USER app` before CMD/ENTRYPOINT.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-root-user

#### 8. 🟠 No lockfile for a declared dependency ecosystem

- **Rule:** `deps/lockfile-missing` · **Severity:** 🟠 High · **Area:** dependencies
- **Where:** `package.json`
- **What:** A npm manifest exists but no lockfile (package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, npm-shrinkwrap.json) was found.
- **Why it matters:** Without a lockfile, every install can resolve different transitive versions: CI may pass while production fails, and a malicious patch release is pulled in silently.
- **Fix:** Generate and commit package-lock.json (or the lockfile for the package manager you actually use).
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depslockfile-missing

#### 9. 🟠 No lockfile for a declared dependency ecosystem

- **Rule:** `deps/lockfile-missing` · **Severity:** 🟠 High · **Area:** dependencies
- **Where:** `requirements.txt / pyproject.toml`
- **What:** A pypi manifest exists but no lockfile (poetry.lock, Pipfile.lock, uv.lock, pdm.lock, requirements.lock) was found.
- **Why it matters:** Without a lockfile, every install can resolve different transitive versions: CI may pass while production fails, and a malicious patch release is pulled in silently.
- **Fix:** Generate and commit poetry.lock (or the lockfile for the package manager you actually use).
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depslockfile-missing

#### 10. 🟠 Command injection in template in lodash

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🟠 High · **Area:** dependencies
- **Where:** `package.json`
- **What:** lodash@^4.17.0 is inside the vulnerable range <4.17.21. Fixed in 4.17.21.
- **Evidence:** `GHSA-35jh-r3h4-6jhm / CVE-2021-23337 — lodash's template function allows command injection via the variable option.`
- **Why it matters:** lodash's template function allows command injection via the variable option.
- **Fix:** Upgrade lodash to 4.17.21 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-35jh-r3h4-6jhm

#### 11. 🟠 No license file

- **Rule:** `docs/license-missing` · **Severity:** 🟠 High · **Area:** documentation
- **Where:** —
- **What:** No LICENSE / COPYING file was found at the repository root.
- **Why it matters:** Code without a license is not open source: companies and individuals cannot legally reuse it, and package registries may refuse it.
- **Fix:** Add a LICENSE file (MIT or Apache-2.0 are common defaults) and reference the license in your README and package metadata.
- **Automatic fix:** `add-license` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docslicense-missing

#### 12. 🟠 README file is missing

- **Rule:** `docs/readme-missing` · **Severity:** 🟠 High · **Area:** documentation
- **Where:** —
- **What:** No README file was found at the repository root.
- **Why it matters:** The README is the front page of a project: without it, new users and contributors cannot tell what the project does, whether it is maintained, or how to install it.
- **Fix:** Run `repo-doctor fix --apply` to create a README skeleton, then fill in purpose, install and usage sections.
- **Automatic fix:** `add-readme` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docsreadme-missing

#### 13. 🟠 No .gitignore

- **Rule:** `security/gitignore-missing` · **Severity:** 🟠 High · **Area:** security
- **Where:** —
- **What:** No .gitignore file was found at the repository root.
- **Why it matters:** Every ecosystem produces local artefacts (node_modules, .venv, build/, .env) that should never enter version control.
- **Fix:** Add a .gitignore covering dependencies, build output, logs, editors and .env files.
- **Automatic fix:** `add-gitignore` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitygitignore-missing

#### 14. 🟠 Sensitive file is tracked by git

- **Rule:** `security/sensitive-file-tracked` · **Severity:** 🟠 High · **Area:** security
- **Where:** `.env`
- **What:** .env is tracked by git and matches a sensitive-file pattern.
- **Why it matters:** Environment and credential files frequently contain live tokens, database URLs and API keys.
- **Fix:** Remove it with `git rm --cached .env`, add the pattern to .gitignore, commit an example file instead (.env.example), and rotate anything it contained.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitysensitive-file-tracked

## 🟡 Medium (16)

#### 1. 🟡 GitHub Action is not pinned to a commit SHA

- **Rule:** `ci/action-unpinned` · **Severity:** 🟡 Medium · **Area:** ci
- **Where:** `.github/workflows/ci.yml`:7
- **What:** Action "actions/checkout@main" is pinned to "main" rather than a commit SHA.
- **Evidence:** `actions/checkout@main`
- **Why it matters:** Tags are mutable: if the action repository is compromised or force-pushed, your workflow runs the new code with your token.
- **Fix:** Pin to the full 40-character commit SHA and let Dependabot keep it updated, or at least pin to a major version tag from a trusted publisher.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#ciaction-unpinned

#### 2. 🟡 Workflow does not restrict GITHUB_TOKEN permissions

- **Rule:** `ci/workflow-permissions-missing` · **Severity:** 🟡 Medium · **Area:** ci
- **Where:** `.github/workflows/ci.yml`
- **What:** No `permissions:` block; the token inherits the repository default, which is often read/write.
- **Why it matters:** A workflow with a write-scoped token that runs compromised code (a dependency postinstall, a malicious action) can push commits or publish packages.
- **Fix:** Add `permissions: contents: read` at the top of the workflow, and grant write scopes per job only when required.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#ciworkflow-permissions-missing

#### 3. 🟡 ADD fetches a remote URL

- **Rule:** `containers/dockerfile-add-remote` · **Severity:** 🟡 Medium · **Area:** containers
- **Where:** `Dockerfile`:5
- **What:** ADD downloads a remote file during the build.
- **Evidence:** `ADD https://example.com/app.tar.gz /app`
- **Why it matters:** ADD cannot verify checksums, follows redirects, and auto-extracts archives — three ways for unexpected content to enter the image.
- **Fix:** Use `ADD` only for local files. For downloads use `RUN curl -fsSL -o file <url> && echo "<sha256>  file" | sha256sum -c - && ...`.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-add-remote

#### 4. 🟡 Base image is unpinned or uses :latest

- **Rule:** `containers/dockerfile-unpinned-base` · **Severity:** 🟡 Medium · **Area:** containers
- **Where:** `Dockerfile`:1
- **What:** Base image "node:latest" has no explicit version (:latest).
- **Evidence:** `FROM node:latest`
- **Why it matters:** An unpinned base image means two builds of the same commit can contain different operating-system packages, and a compromised upstream tag silently ships in your release.
- **Fix:** Pin to a version tag (`node:22.11-bookworm-slim`) and optionally a digest (image@sha256:...), updating it deliberately.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-unpinned-base

#### 5. 🟡 No .dockerignore

- **Rule:** `containers/dockerignore-missing` · **Severity:** 🟡 Medium · **Area:** containers
- **Where:** —
- **What:** A Dockerfile exists but there is no .dockerignore.
- **Why it matters:** The build context includes .git history, node_modules and any .env file. `COPY . .` then bakes them into the image, and every build transfers them to the daemon.
- **Fix:** Add .dockerignore covering .git, node_modules, .env*, dist, coverage and editor folders.
- **Automatic fix:** `add-dockerignore` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerignore-missing

#### 6. 🟡 Deprecated dependency

- **Rule:** `deps/deprecated-dependency` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `package.json`
- **What:** request is deprecated or unmaintained.
- **Why it matters:** Deprecated packages keep resolving, but they no longer receive security patches and often break on new runtime versions.
- **Fix:** Migrate to undici, got, axios or node:fetch.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depsdeprecated-dependency

#### 7. 🟡 Package runs a lifecycle install script

- **Rule:** `deps/install-script` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `package.json`
- **What:** Lifecycle scripts present: postinstall.
- **Evidence:** `postinstall: node build.js`
- **Why it matters:** Install scripts run on every consumer's machine with their permissions. Many CI setups and corporate registries now block them, and reviewers cannot see what they do from the diff.
- **Fix:** Prefer explicit build steps (`prepare`, `build`) over install hooks, or document why the hook is required. Consider `npm ci --ignore-scripts` in CI.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depsinstall-script

#### 8. 🟡 Open redirect in res.location / res.redirect in express

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `package.json`
- **What:** express@4.18.0 is inside the vulnerable range <4.19.2. Fixed in 4.19.2.
- **Evidence:** `GHSA-jr5f-v2jv-69x6 / CVE-2024-29041 — Malformed URLs could be used to bypass redirect validation in Express.`
- **Why it matters:** Malformed URLs could be used to bypass redirect validation in Express.
- **Fix:** Upgrade express to 4.19.2 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-jr5f-v2jv-69x6

#### 9. 🟡 Prototype pollution in minimist

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `package.json`
- **What:** minimist@^1.2.0 is inside the vulnerable range <1.2.6. Fixed in 1.2.6.
- **Evidence:** `GHSA-vh95-rmgr-6w4m / CVE-2021-44906 — minimist is vulnerable to prototype pollution when parsing crafted arguments.`
- **Why it matters:** minimist is vulnerable to prototype pollution when parsing crafted arguments.
- **Fix:** Upgrade minimist to 1.2.6 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-vh95-rmgr-6w4m

#### 10. 🟡 Proxy-Authorization header leaked to destination in requests

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `requirements.txt`:1
- **What:** requests@>=2.0 is inside the vulnerable range <2.31.0. Fixed in 2.31.0.
- **Evidence:** `GHSA-j8r2-6x86-q33q / CVE-2023-32681 — requests forwards the Proxy-Authorization header to the destination server when redirecting.`
- **Why it matters:** requests forwards the Proxy-Authorization header to the destination server when redirecting.
- **Fix:** Upgrade requests to 2.31.0 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-j8r2-6x86-q33q

#### 11. 🟡 Request body not stripped on redirect in urllib3

- **Rule:** `deps/vulnerable-dependency` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `requirements.txt`:3
- **What:** urllib3@==1.26.0 is inside the vulnerable range <2.0.7. Fixed in 2.0.7.
- **Evidence:** `GHSA-g4mx-q9vg-27p4 / CVE-2023-45803 — urllib3 does not remove the request body when following a 303 redirect, leaking data to another host.`
- **Why it matters:** urllib3 does not remove the request body when following a 303 redirect, leaking data to another host.
- **Fix:** Upgrade urllib3 to 2.0.7 or later. Run the installer afterwards and commit the lockfile.
- **Docs:** https://github.com/advisories/GHSA-g4mx-q9vg-27p4

#### 12. 🟡 Wildcard dependency version

- **Rule:** `deps/wildcard-version` · **Severity:** 🟡 Medium · **Area:** dependencies
- **Where:** `package.json`
- **What:** 2 dependency declaration(s) use a wildcard version: foo, flask.
- **Evidence:** `foo, flask`
- **Why it matters:** A wildcard range accepts every future release: installs stop being reproducible and a compromised or breaking release lands without review.
- **Fix:** Declare a compatible range (`^1.4.0`) or an exact pin, and rely on the lockfile plus Dependabot for updates.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depswildcard-version

#### 13. 🟡 No CODE_OF_CONDUCT

- **Rule:** `docs/code-of-conduct-missing` · **Severity:** 🟡 Medium · **Area:** documentation
- **Where:** —
- **What:** No CODE_OF_CONDUCT.md was found.
- **Why it matters:** Projects without a code of conduct signal that behaviour is unmanaged, which disproportionately discourages newcomers and under-represented contributors.
- **Fix:** Adopt the Contributor Covenant 2.1 and name a contact for reports.
- **Automatic fix:** `add-code-of-conduct` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docscode-of-conduct-missing

#### 14. 🟡 No CONTRIBUTING guide

- **Rule:** `docs/contributing-missing` · **Severity:** 🟡 Medium · **Area:** documentation
- **Where:** —
- **What:** No CONTRIBUTING.md was found at the root, in docs/ or in .github/.
- **Why it matters:** Contributors who cannot find setup and test instructions either open low-quality issues or give up. GitHub also links this file automatically on every issue.
- **Fix:** Add CONTRIBUTING.md with local setup, test commands, commit conventions and PR expectations.
- **Automatic fix:** `add-contributing` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docscontributing-missing

#### 15. 🟡 No linter configured

- **Rule:** `quality/lint-missing` · **Severity:** 🟡 Medium · **Area:** quality
- **Where:** —
- **What:** No linter configuration or lint script was found.
- **Why it matters:** Style and error-prone-pattern debates then land in code review, and whole classes of bugs (unused imports, shadowed variables, missing await) are missed.
- **Fix:** Add a linter appropriate to your stack (ESLint, Ruff, golangci-lint, Clippy) plus a `lint` script, and run it in CI.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitylint-missing

#### 16. 🟡 package.json has no usable test script

- **Rule:** `quality/test-script-missing` · **Severity:** 🟡 Medium · **Area:** quality
- **Where:** `package.json`
- **What:** The `test` script is still the npm placeholder.
- **Evidence:** `"test": "echo "Error: no test specified" && exit 1"`
- **Why it matters:** CI and contributors both call `npm test` by convention; without it the suite is effectively undiscoverable.
- **Fix:** Point `test` at your runner (e.g. `node --test`, `vitest run`, `jest`) and add `test:watch` for local use.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitytest-script-missing

## 🔵 Low (17)

#### 1. 🔵 GitHub Action is not pinned to a commit SHA

- **Rule:** `ci/action-unpinned` · **Severity:** 🔵 Low · **Area:** ci
- **Where:** `.github/workflows/ci.yml`:10
- **What:** Action "super/thing@v1" is pinned to "v1" rather than a commit SHA.
- **Evidence:** `super/thing@v1`
- **Why it matters:** Tags are mutable: if the action repository is compromised or force-pushed, your workflow runs the new code with your token.
- **Fix:** Pin to the full 40-character commit SHA and let Dependabot keep it updated, or at least pin to a major version tag from a trusted publisher.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#ciaction-unpinned

#### 2. 🔵 No dependency update automation

- **Rule:** `ci/dependabot-missing` · **Severity:** 🔵 Low · **Area:** ci
- **Where:** `package.json`
- **What:** No Dependabot or Renovate configuration was found.
- **Why it matters:** Unmaintained dependencies drift into known-vulnerable versions; automation keeps 2 manifest(s) current with review overhead close to zero.
- **Fix:** Add .github/dependabot.yml with weekly update checks for your ecosystems and for GitHub Actions.
- **Automatic fix:** `add-dependabot` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#cidependabot-missing

#### 3. 🔵 No CODEOWNERS file

- **Rule:** `community/codeowners-missing` · **Severity:** 🔵 Low · **Area:** community
- **Where:** —
- **What:** No CODEOWNERS file was found.
- **Why it matters:** Without ownership, review requests land in a void and it is unclear who must approve a change in a sensitive area.
- **Fix:** Add .github/CODEOWNERS mapping paths to maintainers, e.g. `/src/security/ @your-handle`.
- **Automatic fix:** `add-codeowners` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#communitycodeowners-missing

#### 4. 🔵 Package install leaves caches in the image layer

- **Rule:** `containers/dockerfile-apt-cleanup` · **Severity:** 🔵 Low · **Area:** containers
- **Where:** `Dockerfile`:4
- **What:** apt-get install is missing best practices: no --no-install-recommends; apt lists not removed in the same layer.
- **Evidence:** `RUN apt-get update && apt-get install -y curl`
- **Why it matters:** Every layer keeps its files: leaving package caches can add tens of megabytes, and recommended packages bloat the attack surface.
- **Fix:** `RUN apt-get update && apt-get install -y --no-install-recommends <pkgs> && rm -rf /var/lib/apt/lists/*` in one layer.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#containersdockerfile-apt-cleanup

#### 5. 🔵 package.json does not declare supported engines

- **Rule:** `deps/engines-missing` · **Severity:** 🔵 Low · **Area:** dependencies
- **Where:** `package.json`
- **What:** No "engines" field in package.json.
- **Why it matters:** Without it, users on unsupported runtimes get confusing syntax or API errors instead of a clear message, and CI matrices are guesswork.
- **Fix:** Add `"engines": { "node": ">=20" }` (or your real minimum) and mirror it in the CI matrix.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depsengines-missing

#### 6. 🔵 Dependency is several major versions behind

- **Rule:** `deps/outdated-major` · **Severity:** 🔵 Low · **Area:** dependencies
- **Where:** `package.json`
- **What:** express@4.18.0 cannot resolve to the current major (5.1.0); 1 major version(s) behind.
- **Why it matters:** Old majors stop receiving fixes and accumulate known advisories, and the eventual upgrade gets more expensive the longer it waits.
- **Fix:** Plan an upgrade to express@5 and check the upstream migration guide.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depsoutdated-major

#### 7. 🔵 requirements.txt is not pinned

- **Rule:** `deps/unpinned-requirements` · **Severity:** 🔵 Low · **Area:** dependencies
- **Where:** `requirements.txt`
- **What:** 3 of 4 requirements in requirements.txt are not pinned to an exact version.
- **Evidence:** `requests@>=2.0, flask@*, pyyaml@==5.1`
- **Why it matters:** Unpinned requirements resolve differently on every install, which is the classic cause of 'works in dev, fails in prod'.
- **Fix:** Pin exact versions (`package==1.2.3`) and regenerate with pip-tools / uv / poetry so upgrades stay deliberate.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#depsunpinned-requirements

#### 8. 🔵 No issue templates

- **Rule:** `docs/issue-templates-missing` · **Severity:** 🔵 Low · **Area:** documentation
- **Where:** —
- **What:** No issue templates were found in .github/ISSUE_TEMPLATE/.
- **Why it matters:** Unstructured bug reports regularly omit versions, reproduction steps and logs, which slows triage.
- **Fix:** Add bug report and feature request templates.
- **Automatic fix:** `add-issue-templates` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docsissue-templates-missing

#### 9. 🔵 Package metadata has no license field

- **Rule:** `docs/license-metadata-missing` · **Severity:** 🔵 Low · **Area:** documentation
- **Where:** `package.json`
- **What:** package.json has no "license" field.
- **Why it matters:** npm and automated license scanners read the manifest, not the LICENSE file.
- **Fix:** Add `"license": "MIT"` (or your SPDX id) to package.json.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docslicense-metadata-missing

#### 10. 🔵 No pull request template

- **Rule:** `docs/pr-template-missing` · **Severity:** 🔵 Low · **Area:** documentation
- **Where:** —
- **What:** No pull request template was found.
- **Why it matters:** PRs that arrive without a linked issue, tests or a changelog note push review work back onto maintainers.
- **Fix:** Add .github/PULL_REQUEST_TEMPLATE.md with a short checklist.
- **Automatic fix:** `add-pr-template` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docspr-template-missing

#### 11. 🔵 No SECURITY policy

- **Rule:** `docs/security-policy-missing` · **Severity:** 🔵 Low · **Area:** documentation
- **Where:** —
- **What:** No SECURITY.md was found.
- **Why it matters:** Without a private reporting channel, vulnerabilities are often disclosed as public issues before a fix exists.
- **Fix:** Add SECURITY.md with supported versions, a reporting channel and a response-time expectation.
- **Automatic fix:** `add-security-policy` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#docssecurity-policy-missing

#### 12. 🔵 No .editorconfig

- **Rule:** `quality/editorconfig-missing` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** —
- **What:** No .editorconfig file was found.
- **Why it matters:** Editor defaults differ wildly (tabs vs spaces, CRLF vs LF), and every mismatch shows up as a spurious diff in review.
- **Fix:** Add .editorconfig with indent_style, indent_size, end_of_line, insert_final_newline and trim_trailing_whitespace.
- **Automatic fix:** `add-editorconfig` (safe, creates files only)
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualityeditorconfig-missing

#### 13. 🔵 No formatter configuration

- **Rule:** `quality/formatter-missing` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** —
- **What:** No formatter configuration or format script was found.
- **Why it matters:** Unformatted contributions create noisy diffs, merge conflicts and review comments that have nothing to do with logic.
- **Fix:** Add Prettier (with .prettierrc), Ruff format / Black, or `cargo fmt`, plus a `format` script and a CI check.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualityformatter-missing

#### 14. 🔵 package.json is missing discovery metadata

- **Rule:** `quality/package-metadata-missing` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** `package.json`
- **What:** package.json has no "description".
- **Why it matters:** Registries and search results show the description; without it the package looks abandoned.
- **Fix:** Add a one-sentence description of what the package does.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitypackage-metadata-missing

#### 15. 🔵 package.json is missing discovery metadata

- **Rule:** `quality/package-metadata-missing` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** `package.json`
- **What:** package.json has no "repository" field.
- **Why it matters:** Users and tools (npm, Snyk, source maps) cannot link the published package back to its source, which breaks issue reporting.
- **Fix:** Add `"repository": { "type": "git", "url": "git+https://github.com/owner/repo.git" }`.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitypackage-metadata-missing

#### 16. 🔵 package.json is missing discovery metadata

- **Rule:** `quality/package-metadata-missing` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** `package.json`
- **What:** package.json has no "keywords".
- **Why it matters:** Keywords are how people find a package in registry search.
- **Fix:** Add 5–10 keywords describing the problem the package solves.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitypackage-metadata-missing

#### 17. 🔵 TypeScript is configured without strict mode

- **Rule:** `quality/typescript-not-strict` · **Severity:** 🔵 Low · **Area:** quality
- **Where:** `tsconfig.json`
- **What:** tsconfig.json does not enable "strict".
- **Why it matters:** Non-strict TypeScript silently allows null access, implicit any and unsafe function variance — the errors it misses are the ones that reach production.
- **Fix:** Enable "strict": true and fix the fallout incrementally (strictNullChecks first if the list is long), and add a `typecheck` script.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitytypescript-not-strict

## ⚪ Info (5)

#### 1. ⚪ No static code analysis (CodeQL) workflow

- **Rule:** `ci/code-scanning-missing` · **Severity:** ⚪ Info · **Area:** ci
- **Where:** —
- **What:** No CodeQL / code scanning workflow detected.
- **Why it matters:** Static analysis finds data-flow bugs (SQL injection, SSRF, unsafe deserialisation) that tests rarely cover, and it is free for public repositories.
- **Fix:** Enable CodeQL from the repository's Security tab, or add the official codeql-action workflow.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#cicode-scanning-missing

#### 2. ⚪ No funding configuration

- **Rule:** `community/funding-missing` · **Severity:** ⚪ Info · **Area:** community
- **Where:** —
- **What:** No .github/FUNDING.yml found.
- **Why it matters:** Sustainable maintenance needs funding, and a Sponsor button is the lowest-friction way for users to contribute back.
- **Fix:** Add .github/FUNDING.yml with GitHub Sponsors, Open Collective or a custom URL — only if you actually accept funding.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#communityfunding-missing

#### 3. ⚪ No maintainer or governance information

- **Rule:** `community/governance-missing` · **Severity:** ⚪ Info · **Area:** community
- **Where:** —
- **What:** No MAINTAINERS / GOVERNANCE / AUTHORS document was found.
- **Why it matters:** Adopters want to know whether a project is a one-person effort and how decisions are made before they depend on it.
- **Fix:** Add MAINTAINERS.md listing who is responsible for what, and a short decision-making section (or GOVERNANCE.md) for larger projects.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#communitygovernance-missing

#### 4. ⚪ No automation for new issues and pull requests

- **Rule:** `community/issue-triage-missing` · **Severity:** ⚪ Info · **Area:** community
- **Where:** —
- **What:** CI exists but there is no issue/PR triage automation.
- **Why it matters:** Manual triage does not scale: unlabeled issues get lost, and first-time contributors wait days for a response.
- **Fix:** Add actions/labeler with .github/labeler.yml, a first-interaction greeting, and optionally a stale bot.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#communityissue-triage-missing

#### 5. ⚪ No typecheck step in scripts or CI

- **Rule:** `quality/typecheck-missing` · **Severity:** ⚪ Info · **Area:** quality
- **Where:** `package.json`
- **What:** TypeScript project without a `typecheck` script.
- **Why it matters:** If the build transpiles without checking types (ts-node, swc, esbuild, bundlers), type errors reach production unnoticed.
- **Fix:** Add `"typecheck": "tsc --noEmit"` and run it in CI.
- **Docs:** https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#qualitytypecheck-missing

## Suggested fixes

| Fix | What it does | Files | Safe |
| --- | ------------ | ----- | :--: |
| `add-license` | Renders the full text of the configured SPDX license (MIT, ISC, BSD-3-Clause, Unlicense). | `LICENSE` | ✅ |
| `add-readme` | A README skeleton with description, install, usage, contributing, security and license sections. | `README.md` | ✅ |
| `add-gitignore` | Language-aware ignore rules for secrets, dependencies, build output and editor noise. | `.gitignore` | ✅ |
| `add-dockerignore` | Keeps VCS data, secrets, dependencies and build output out of the image context. | `.dockerignore` | ✅ |
| `add-code-of-conduct` | Contributor Covenant 2.1 with a placeholder enforcement contact. | `CODE_OF_CONDUCT.md` | ✅ |
| `add-contributing` | Setup, test commands, commit conventions, PR checklist and the label taxonomy. | `CONTRIBUTING.md` | ✅ |
| `add-dependabot` | Weekly dependency and GitHub Actions updates with grouping. | `.github/dependabot.yml` | ✅ |
| `add-codeowners` | Ownership map with a placeholder maintainer handle. | `.github/CODEOWNERS` | ✅ |
| `add-issue-templates` | Bug report, feature request and good-first-issue forms plus the chooser config. | `.github/ISSUE_TEMPLATE/bug_report.yml`<br>`.github/ISSUE_TEMPLATE/feature_request.yml`<br>`.github/ISSUE_TEMPLATE/good_first_issue.yml`<br>`.github/ISSUE_TEMPLATE/config.yml` | ✅ |
| `add-pr-template` | PR checklist covering tests, docs, changelog and secret hygiene. | `.github/PULL_REQUEST_TEMPLATE.md` | ✅ |
| `add-security-policy` | Vulnerability disclosure policy with response expectations. | `SECURITY.md` | ✅ |
| `add-editorconfig` | Consistent indentation and line endings matched to the repository's existing style. | `.editorconfig` | ✅ |

```bash
# preview every change without touching the disk
npx repo-doctor fix --dry-run
```

---

Generated by **repo-doctor v0.1.0** on 2026-11-16T15:10:34.808Z · schema 1.0.0 · 100% offline, nothing was uploaded.

---

## About this sample

This report was generated by scanning a deliberately unhealthy demo repository
containing: a committed AWS key, a Stripe key and a database URL in
`src/config.js`; a tracked `.env`; an unguarded `id_rsa`; a Dockerfile that runs
as root, uses `:latest`, pipes `curl` into `bash` and bakes a secret into `ENV`;
a privileged Compose service; a `pull_request_target` workflow with script
injection and unpinned actions; vulnerable `lodash`, `express`, `pyyaml` and
`urllib3` versions; and no documentation, tests or lint setup at all.

Note that every credential is shown as a masked shape hint plus a SHA-256
fingerprint — never the value. That is what makes a report safe to attach to an
issue or a pull request.

Regenerate it yourself:

```bash
repo-doctor scan path/to/repo --format markdown
```
