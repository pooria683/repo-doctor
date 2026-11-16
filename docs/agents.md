# Using Repo Doctor from coding agents and automation

Repo Doctor is designed to be a *tool* an agent can call, not a report a human
must interpret. Three properties make that work: deterministic output, stable
identifiers, and actionable fix metadata.

## The loop

```
scan (JSON) ──▶ choose findings ──▶ act ──▶ fix --dry-run ──▶ verify ──▶ scan again
```

```bash
# 1. Observe
repo-doctor scan . --format json --output /tmp/doctor.json --fail-on never

# 2. Inspect the minimum an agent needs
jq '{score: .summary.score, counts: .summary.counts,
     work: [.findings[] | select(.severity=="critical" or .severity=="high")
            | {rule: .ruleId, file, line, fix: .fix.id, action: .suggestion}]}' /tmp/doctor.json

# 3. Preview the mechanical part
repo-doctor fix --dry-run --format json

# 4. Apply, then re-scan
repo-doctor fix --apply --only add-contributing --only add-code-of-conduct
repo-doctor scan . --format json --quiet --fail-on high
```

## What an agent can safely automate

| Finding kind | Safe action |
| ------------ | ----------- |
| `fix.kind == "create-file"` with `fix.safe == true` | `repo-doctor fix --apply --only <fix.id>` |
| Missing tests / lint / formatter configs | Generate tooling, then run it |
| `deps/vulnerable-dependency` | Bump to `meta.fixedVersion`, refresh lockfile, run tests |
| `docs/readme-thin` | Draft the missing sections from `meta.missingSections` |
| `ci/action-unpinned` | Resolve the tag to a SHA and pin it |

## What an agent must not automate

| Finding | Why |
| ------- | --- |
| `security/committed-secret` | Rotation is a human decision with a blast radius. Repo Doctor deliberately offers no fix. |
| `security/sensitive-file-tracked` | Needs `git rm --cached` + history rewrite; destructive. |
| `docs/code-of-conduct-missing` | The enforcement contact must be a real, consenting person. |
| `community/funding-missing` | Never invent funding accounts. |
| Anything in `meta.tracked` | Touching version control history is not a "fix". |

The generated files contain explicit placeholders (`OWNER/REPO`,
`@your-github-handle`). Treat them as TODOs, not finished work.

## Machine-readable contract

Only depend on these:

- `schemaVersion` — check it, fail loudly on an unknown major.
- `findings[].ruleId` — stable forever.
- `findings[].severity` — may be re-calibrated in minor releases.
- `findings[].fix.id` / `fix.safe` — stable; recipe ids are documented in
  `docs/cli.md`.
- `summary.score` — a number between 0 and 100; the formula is documented and
  may be refined in minor releases.

Never depend on: human-readable `message` wording, console layout, the order of
`fixes[]`, or `warnings[]` text.

## Suggested system prompt fragment

```
Use `repo-doctor scan . --format json --fail-on never` to inspect a repository.
Work in this order: critical → high → medium. Apply only findings whose
`fix.safe` is true, using `repo-doctor fix --apply --only <fix.id>`. Never apply
a fix whose `kind` is "manual", and never attempt to remediate
`security/committed-secret` — report it to the user instead.
Re-scan after every batch and stop when no critical/high findings remain.
```

## GitHub Actions example

```yaml
name: Repo Doctor
on: [pull_request]
permissions:
  contents: read
  security-events: write
jobs:
  doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - name: Scan
        run: npx repo-doctor scan . --format sarif --output doctor.sarif --fail-on high
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with: { sarif_file: doctor.sarif }
```

## Baselines (roadmap)

`--baseline` will let an agent ignore pre-existing findings and report only what
its own change introduced, using the `partialFingerprints` already present in the
SARIF output. Until then, filter by `findings[].file` against `git diff
--name-only`:

```bash
changed=$(git diff --name-only origin/main... | jq -R . | jq -s .)
jq --argjson changed "$changed" \
  '[.findings[] | select(.file as $f | $changed | index($f))]' /tmp/doctor.json
```
