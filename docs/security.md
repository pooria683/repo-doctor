# Security model

Repo Doctor reads untrusted repositories. That shapes every design decision in
this document.

## Threat model

| Adversary | Capability | Mitigation |
| --------- | ---------- | ---------- |
| A repository you scan | Controls file names, contents, sizes, symlinks, `.gitignore` | Never execute repo content; cap file sizes; skip symlinks and binaries; treat all text as data |
| A secret in the scanned repo | Must not be exfiltrated or echoed | Masked evidence only; no network; reports contain fingerprints, not values |
| A malicious dependency of the tool | Would run with your privileges | Zero runtime dependencies |
| Someone reading a published report | Should not learn credentials | Findings are redacted by construction |
| A compromised upstream advisory source | Could inject data | Advisory data is a reviewed, versioned JSON snapshot in the repo |

Out of scope: an attacker with local write access to the machine running the
scan, or a compromised Node.js runtime.

## Guarantees

### 1. No network access

`src/` contains no `node:http`, `node:https`, `node:net`, `node:tls`, `node:dns`,
`node:dgram`, no `undici`, and no `fetch()` call. `tests/privacy.test.ts` walks
the source tree on every test run and fails the build if one appears.

Consequences:

- works on air-gapped machines and in restricted CI runners;
- no proxy configuration, no TLS interception issues, no rate limits;
- nothing to leak: there is no code path that could send data.

### 2. No secrets in output

`scanForSecrets()` returns raw matches only inside the process. Every finding is
built with `maskSecret()`, which produces:

```
AKIA******** (20 chars, sha256:3f1c9a02)
```

- the first four characters (enough to identify *which* credential it is),
- the length,
- the first eight hex characters of a SHA-256 of the value (stable across runs,
  so you can correlate findings without exposing the secret).

The tests assert that `JSON.stringify(result)` never contains the raw value for
any of the four report formats.

### 3. Read-only scanning

`scan` and `report` never open a file for writing. `fix` writes only paths that
do not exist, refuses to overwrite without `--force` (which the CLI never sets),
and is preview-first (`--dry-run` is the default).

### 4. No code execution from the scanned repository

Repo Doctor parses manifests as data (JSON/regex-based line parsing), never
imports them, never runs `npm install`, and never evaluates the project's code.
There is no AST evaluation, no shell-out to project scripts, and no plugin
loading in v0.1 (the plugin API in the roadmap is opt-in and sandboxed by
review, not by the runtime).

### 5. Bounded resource use

| Limit | Value | Why |
| ----- | ----- | --- |
| Files walked | 5000 (`maxFiles`) | Prevents pathological monorepos |
| File size read | 512 KiB | Prevents loading huge files |
| Manifest size | 1 MiB | Manifests are small |
| Lines per file parsed | 20 000 | Prevents quadratic regex work |
| Secret scan files | 4000 | Keeps a giant repo bounded |
| Directory depth | filesystem walk skips VCS, deps, build output | Avoids `node_modules` entirely |

Binary files (by extension or NUL byte in the first 8 KiB) are never decoded.
Symlinks are not followed, so a symlink loop cannot hang the scan.

### 6. Minimal subprocess use

The only external process is `git`, invoked with `execFileSync` (no shell) and
read-only commands: `rev-parse`, `ls-files`, `remote get-url`, `rev-list`,
`status`. The output is parsed, never evaluated. Failures are non-fatal: a
missing git or a non-repo directory simply yields `git.isRepo = false`.

## Advisory data

`data/advisories.json` is a curated snapshot, not a live feed. This is a
trade-off, and an honest one:

- **Upside:** no network, no account, no rate limits, fully auditable, and the
  report you get is reproducible tomorrow.
- **Downside:** it can miss advisories published after the snapshot date, which
  is written into every result as `meta.snapshot`.

The snapshot is not a substitute for a real vulnerability database. Repo Doctor
says so in the rule description and in `docs/rules.md`. Use it to catch the
obvious cases offline; keep `npm audit`, `pip-audit` or Dependabot for
continuous coverage.

Any future online mode must be **opt-in**, print what will be sent before
sending it, and default to off.

## Reporting a vulnerability in Repo Doctor

See [SECURITY.md](../SECURITY.md). Do not open a public issue.

Things we care about most:

- a way to make the scanner read a file outside the scanned root;
- a way to leak a secret into a report (including via `evidence`, `meta`,
  SARIF properties or an error message);
- a way to make `fix` overwrite or delete user content;
- a denial of service (hang, unbounded memory) triggerable by a crafted
  repository.

## Security checklist for contributors

Before opening a PR that touches scanning or reporting:

- [ ] No new network imports (the privacy test will tell you).
- [ ] No raw file contents in findings — mask, truncate or fingerprint.
- [ ] Paths are joined to the scan root and never escape it (`..`).
- [ ] Regexes are linear-ish: no nested quantifiers over unbounded input.
- [ ] New limits are documented in this file.
- [ ] Fixtures use obviously fake credentials (`AKIAIOSFODNN7EXAMPLE`,
      `sk_test_…`), never real-looking live keys.
