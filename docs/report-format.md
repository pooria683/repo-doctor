# Report format

Repo Doctor emits four formats from one in-memory model. This document is the
contract: field names, types and compatibility rules.

- [The model](#the-model)
- [JSON](#json)
- [Markdown](#markdown)
- [SARIF](#sarif)
- [Console](#console)
- [Severity and ordering](#severity-and-ordering)
- [Compatibility](#compatibility)

## The model

One `ScanResult` object feeds every renderer:

```
ScanResult
├── schemaVersion      "1.0.0"
├── tool               { name, version }
├── target             { path, displayPath, git{...}, filesScanned }
├── generatedAt        ISO-8601 UTC
├── config             { failOn, ignoreCount, disabledRules[], configFile? }
├── summary            { score, grade, counts, totalFindings, rulesRun, rulesFailed, filesScanned, durationMs, topPriorities[] }
├── categories[]       { category, label, score, grade, counts, findings, rulesRun }
├── findings[]         Finding
├── fixes[]            { id, title, description, safe, ruleIds[], files[] }
└── warnings[]         string
```

### `Finding`

| Field | Type | Required | Notes |
| ----- | ---- | :------: | ----- |
| `ruleId` | string | ✅ | Stable id, `<category>/<name>` |
| `category` | enum | ✅ | One of the seven areas |
| `severity` | enum | ✅ | `critical` \| `high` \| `medium` \| `low` \| `info` |
| `title` | string | ✅ | Short, target-independent |
| `message` | string | ✅ | Target-specific description |
| `why` | string | ✅ | Why it matters |
| `suggestion` | string | ✅ | What to do |
| `file` | string | — | Relative POSIX path |
| `line` | number | — | 1-based |
| `evidence` | string | — | **Redacted** snippet; secrets are masked |
| `docsUrl` | string | — | Rule documentation |
| `fix` | object | — | `{ id, kind, path?, description, safe }` |
| `meta` | object | — | Extra structured data (see below) |

`meta` keys that appear in v0.1:

| Rule | Keys |
| ---- | ---- |
| `security/committed-secret` | `pattern`, `occurrences`, `tracked` |
| `deps/vulnerable-dependency` | `advisory`, `cve`, `ecosystem`, `package`, `declaredRange`, `vulnerableRange`, `fixedVersion`, `confidence`, `dev`, `snapshot` |
| `deps/outdated-major` | `package`, `declaredRange`, `latest`, `majorsBehind` |
| `docs/readme-thin` | `missingSections[]` |
| `quality/large-file-committed` | `bytes` |

`meta` is additive: new keys may appear in a minor release.

## JSON

`--format json`. Pretty-printed, two-space indent, stable key order, trailing
newline. The same object is written to `.repo-doctor/report.json` by
`scan --save`.

```json
{
  "schemaVersion": "1.0.0",
  "tool": { "name": "repo-doctor", "version": "0.1.0" },
  "target": {
    "path": ".",
    "displayPath": "my-project",
    "git": { "isRepo": true, "branch": "main", "remote": "git@github.com:acme/app.git", "slug": "acme/app" },
    "filesScanned": 218
  },
  "generatedAt": "2025-01-05T10:00:00.000Z",
  "config": { "failOn": "high", "ignoreCount": 3, "disabledRules": [] },
  "summary": {
    "score": 62,
    "grade": "C",
    "counts": { "critical": 1, "high": 3, "medium": 4, "low": 9, "info": 5 },
    "totalFindings": 22,
    "rulesRun": 58,
    "rulesFailed": 12,
    "filesScanned": 218,
    "durationMs": 92,
    "topPriorities": ["Possible AWS access key ID committed (src/config.ts)"]
  },
  "categories": [
    { "category": "security", "label": "Security", "score": 71, "grade": "C", "counts": { "critical": 1, "high": 0, "medium": 0, "low": 2, "info": 0 }, "findings": 3, "rulesRun": 7 }
  ],
  "findings": [
    {
      "ruleId": "security/committed-secret",
      "category": "security",
      "severity": "critical",
      "title": "Possible AWS access key ID committed",
      "message": "AWS access key ID found in src/config.ts:12 (tracked by git).",
      "file": "src/config.ts",
      "line": 12,
      "evidence": "AKIA******** (20 chars, sha256:3f1c9a02)",
      "why": "Anyone with read access …",
      "suggestion": "Rotate the credential now …",
      "docsUrl": "https://github.com/pooria683/repo-doctor/blob/main/docs/rules.md#securitycommitted-secret",
      "meta": { "pattern": "aws-access-key", "occurrences": 1, "tracked": true }
    }
  ],
  "fixes": [
    { "id": "add-gitignore", "title": "Create .gitignore", "description": "…", "safe": true, "ruleIds": ["security/gitignore-missing"], "files": [".gitignore"] }
  ],
  "warnings": []
}
```

### Filtering with `jq`

```bash
# only critical findings
jq '.findings[] | select(.severity=="critical")' report.json

# one line per finding, for a CI log
jq -r '.findings[] | "\(.severity)\t\(.ruleId)\t\(.file // "-"):\(.line // 0)"' report.json

# auto-fixable rule ids
jq -r '.findings[] | select(.fix.safe) | .fix.id' report.json | sort -u
```

## Markdown

`--format markdown`. Designed for a PR comment, a README badge source, or an
issue body:

1. Title and one-line summary (score, grade, files, rules)
2. Severity counter line
3. **Top priorities** (up to five high/critical items)
4. **Health by area** table
5. Findings grouped by severity, each with rule, location, what, evidence, why,
   fix, and auto-fix id
6. **Suggested fixes** table
7. Scan notes (warnings)
8. Footer with tool version, timestamp, schema version and the offline notice

Everything is GitHub-flavoured Markdown with no HTML and no external images, so
it renders anywhere.

## SARIF

`--format sarif` produces SARIF 2.1.0 for GitHub code scanning, VS Code and any
other SARIF consumer:

- `runs[0].tool.driver` — name, version, information URI, and one rule descriptor
  per rule id that produced findings (`helpUri` points at `docs/rules.md`)
- `runs[0].results[]` — one per finding, with `ruleId`, `level`
  (`error` for critical/high, `warning` for medium, `note` for low/info),
  `physicalLocation` when a file is known, and
  `partialFingerprints["repoDoctorFindingHash/v1"]` so GitHub can track a
  finding across commits
- `runs[0].properties` — overall `score` and `grade`

```bash
repo-doctor scan . --format sarif --output repo-doctor.sarif
```

## Console

`--format console` (default). Colour is used only when stdout is a TTY and
`NO_COLOR` is unset; `--no-color` and `NO_COLOR=1` always win.

Console output is explicitly **not** machine-readable, and human hints (like the
"Failing: …" line) are suppressed for the other formats so `--format json`
pipes cleanly into `jq`.

## Severity and ordering

Findings are sorted by:

1. severity (`critical` → `info`)
2. category (alphabetical)
3. rule id
4. file path
5. line number

Ordering is deterministic: the same repository scanned twice produces the same
report, which makes diffs between runs meaningful.

## Compatibility

- `schemaVersion` follows semver. **Major** bumps mean a field was removed or
  its meaning changed.
- Adding a rule, a finding, a `meta` key or a `FixPlan` is **not** breaking.
- Rule ids are permanent. A retired rule keeps its id and is marked deprecated
  in `docs/rules.md` for at least one minor release.
- Severity values may change between minor releases when calibration improves;
  pin the tool version in CI if you depend on exact levels, and use
  `.repodoctorrc.json` to pin the ones that matter to you.
