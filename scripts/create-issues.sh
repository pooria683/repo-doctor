#!/usr/bin/env bash
#
# Create the backlog described in issues/GOOD-FIRST-ISSUES.md with `gh`.
#
#   ./scripts/create-issues.sh           # dry run: print what would be created
#   ./scripts/create-issues.sh --apply   # create the labels and the issues
#
# Idempotent: issues whose title already exists are skipped, so re-running is
# safe. Requires the GitHub CLI (https://cli.github.com) and `gh auth login`.

set -euo pipefail

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh is not installed (https://cli.github.com)" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
if [[ -z "$REPO" ]]; then
  echo "error: not inside a GitHub repository, or gh is not authenticated" >&2
  exit 1
fi

echo "Repository: $REPO"
$APPLY || echo "Dry run — pass --apply to create labels and issues."
echo

LABELS=(
  "good first issue|7057ff|Small, well-scoped, no prior knowledge needed"
  "help wanted|008672|A maintainer would welcome a contributor here"
  "bug|d73a4a|Something behaves incorrectly"
  "enhancement|a2eeef|New capability or improvement"
  "documentation|0075ca|Docs-only change"
  "needs triage|ededed|Not yet reviewed by a maintainer"
  "rule: false positive|fbca04|A rule fired on something harmless"
  "rules|5319e7|Scanner rule catalogue"
  "dependencies|0366d6|Dependency detection"
  "cli|c5def5|Command-line interface"
  "ci|1d76db|Continuous integration"
)

create_label() {
  local spec="$1" name color desc
  IFS='|' read -r name color desc <<<"$spec"
  if $APPLY; then
    gh label create "$name" --color "$color" --description "$desc" --repo "$REPO" >/dev/null 2>&1 \
      && echo "  + label: $name" || echo "  = label exists: $name"
  else
    echo "  label: $name"
  fi
}

echo "Labels"
for label in "${LABELS[@]}"; do create_label "$label"; done
echo

# title|labels|body-file-section
ISSUES=(
  "Add quality/no-debugger rule|good first issue,enhancement,rules|1"
  "Add quality/no-console-log rule|good first issue,enhancement,rules|2"
  "Flag READMEs without a screenshot or logo|good first issue,enhancement,documentation|3"
  "Detect a missing .env.example|good first issue,enhancement|4"
  "Add containers/dockerfile-healthcheck rule|good first issue,enhancement|5"
  "Suggest multi-stage builds in Dockerfiles|good first issue,enhancement|6"
  "Support the text bun.lock lockfile|good first issue,enhancement,dependencies|7"
  "Add NuGet .csproj parsing|good first issue,enhancement,dependencies|8"
  "Add Maven pom.xml parsing|good first issue,enhancement,dependencies|9"
  "Make severity weights configurable per rule|enhancement,help wanted|10"
  "Add --baseline to report only PR findings|enhancement,help wanted,cli|11"
  "Add an HTML report renderer|enhancement|12"
  "Document that GitHub only reads .github/ISSUE_TEMPLATE|good first issue,documentation|13"
  "False positive: LICENSE-APACHE is not detected|bug,rule: false positive,good first issue|14"
  "False positive: test fixture keys reported as critical|bug,rule: false positive|15"
  "Crash: package.json with a UTF-8 BOM|bug,good first issue|16"
  "Accept comma-separated values in --ignore|bug,good first issue,cli|17"
  "Windows: backslash separators in finding paths|bug,help wanted|18"
  "Add --json shorthand for --format json|good first issue,enhancement,cli|19"
  "Document the scoring formula with worked examples|documentation,good first issue|20"
  "Add a rule-authoring tutorial|documentation,good first issue|21"
  "Translate the rule catalogue to Persian|documentation,help wanted|22"
  "Add a Dockerfile for the CLI|enhancement,help wanted|23"
  "Benchmark 50 repositories and publish the table|enhancement,help wanted|24"
  "Add --min-score exit condition|good first issue,enhancement,cli|25"
  "Split src/rules/deps.ts into one file per rule|good first issue,enhancement,rules|26"
)

existing_titles=""
if [[ "$APPLY" == true ]]; then
  existing_titles="$(gh issue list --repo "$REPO" --state all --limit 500 --json title --jq '.[].title' || true)"
fi

body_for() {
  local number="$1"
  # Extract the section for this issue from the backlog file.
  awk -v want="## ${number}." '
    $0 ~ "^"want { capture=1 }
    capture && /^## [0-9]+\./ && $0 !~ "^"want { exit }
    capture { print }
  ' issues/GOOD-FIRST-ISSUES.md
}

echo "Issues"
created=0
skipped=0
for entry in "${ISSUES[@]}"; do
  IFS='|' read -r title labels number <<<"$entry"
  if [[ -n "$existing_titles" ]] && grep -Fxq "$title" <<<"$existing_titles"; then
    echo "  = exists: $title"
    skipped=$((skipped + 1))
    continue
  fi
  if $APPLY; then
    body_for "$number" > "/tmp/repo-doctor-issue-$number.md"
    gh issue create --repo "$REPO" --title "$title" --label "$labels" --body-file "/tmp/repo-doctor-issue-$number.md" >/dev/null
    echo "  + $title"
    created=$((created + 1))
    sleep 1 # stay well inside the API rate limit
  else
    echo "  would create: $title  [$labels]"
  fi
done

echo
if $APPLY; then
  echo "Created $created issue(s), skipped $skipped existing."
else
  echo "Dry run complete: ${#ISSUES[@]} issues would be created."
  echo "Run ./scripts/create-issues.sh --apply to create them."
fi
