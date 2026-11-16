import type { Finding, Rule, RuleContext } from "../types.js";
import { createFinder } from "./helpers.js";

/** Paths of GitHub Actions workflow files. */
export function workflowFiles(ctx: RuleContext): string[] {
  return ctx.find([".github/workflows/*.yml", ".github/workflows/*.yaml"]);
}

/** Parse a workflow file into lines with indices for cheap structural checks. */
function workflowLines(ctx: RuleContext, file: string): Array<{ number: number; text: string }> {
  return ctx.lines(file, 256 * 1024);
}

const WORKFLOW_EXPRESSION_RE = /\$\{\{\s*(github\.event\.(?:issue|pull_request|comment|review|head_commit|commits)[^}]*)\}\}/i;
const RUN_LINE_RE = /^\s*(-\s*)?(run|script)\s*:/i;

const workflowMissing: Rule = {
  id: "ci/workflow-missing",
  title: "No continuous integration workflow",
  category: "ci",
  severity: "high",
  description: "A CI workflow runs tests and linters on every push and pull request, catching breakage before merge.",
  tags: ["ci", "quality"],
  run(ctx) {
    const create = createFinder(workflowMissing);
    const files = workflowFiles(ctx);
    const alternatives = [".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml", ".travis.yml", "Jenkinsfile", "bitbucket-pipelines.yml", ".drone.yml", "appveyor.yml"];
    if (files.length > 0 || alternatives.some((file) => ctx.exists(file))) return [];
    if (ctx.files.length === 0) return [];
    return [
      create({
        message: "No CI configuration was found (.github/workflows, .gitlab-ci.yml, CircleCI, Travis, Jenkins...).",
        why: "Without CI, nothing verifies that a pull request builds or passes tests, so maintainers review blindly and regressions land.",
        suggestion: "Add .github/workflows/ci.yml running install, lint and tests on push and pull_request. `repo-doctor init --ci github-actions` can scaffold it.",
        fix: {
          id: "add-ci-workflow",
          kind: "create-file",
          path: ".github/workflows/ci.yml",
          description: "Create a GitHub Actions CI workflow that installs, lints and tests the project.",
          safe: true,
        },
      }),
    ];
  },
};

const actionUnpinned: Rule = {
  id: "ci/action-unpinned",
  title: "GitHub Action is not pinned to a commit SHA",
  category: "ci",
  severity: "medium",
  description: "Third-party actions referenced by tag or branch can change under you; pinning to a SHA makes builds reproducible.",
  tags: ["ci", "supply-chain"],
  run(ctx) {
    const create = createFinder(actionUnpinned);
    const findings: Finding[] = [];
    for (const file of workflowFiles(ctx)) {
      for (const line of workflowLines(ctx, file)) {
        const match = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?/.exec(line.text);
        if (!match) continue;
        const reference = match[1]!;
        if (reference.startsWith("./") || reference.startsWith("docker://")) continue;
        const at = reference.lastIndexOf("@");
        if (at === -1) continue;
        const ref = reference.slice(at + 1);
        if (/^[0-9a-f]{40}$/.test(ref)) continue;
        findings.push(
          create({
            severity: /^v\d+(\.\d+)*$/.test(ref) ? "low" : "medium",
            file,
            line: line.number,
            message: `Action "${reference}" is pinned to "${ref}" rather than a commit SHA.`,
            evidence: reference,
            why: "Tags are mutable: if the action repository is compromised or force-pushed, your workflow runs the new code with your token.",
            suggestion: "Pin to the full 40-character commit SHA and let Dependabot keep it updated, or at least pin to a major version tag from a trusted publisher.",
            meta: { action: reference, ref },
          }),
        );
      }
    }
    return findings;
  },
};

const workflowPermissions: Rule = {
  id: "ci/workflow-permissions-missing",
  title: "Workflow does not restrict GITHUB_TOKEN permissions",
  category: "ci",
  severity: "medium",
  description: "Declare `permissions: contents: read` at workflow or job level so a compromised step cannot push or publish.",
  tags: ["ci", "security"],
  run(ctx) {
    const create = createFinder(workflowPermissions);
    const findings: Finding[] = [];
    for (const file of workflowFiles(ctx)) {
      const lines = workflowLines(ctx, file);
      if (lines.length === 0) continue;
      const hasTopLevelPermissions = lines.some((line) => /^permissions\s*:/.test(line.text));
      const hasJobPermissions = lines.some((line) => /^\s{2,}permissions\s*:/.test(line.text));
      if (hasTopLevelPermissions || hasJobPermissions) continue;
      const writeAll = lines.find((line) => /^\s*permissions\s*:\s*write-all/.test(line.text));
      findings.push(
        create({
          severity: writeAll ? "high" : "medium",
          file,
          line: writeAll?.number,
          message: writeAll ? "Workflow requests `permissions: write-all`." : "No `permissions:` block; the token inherits the repository default, which is often read/write.",
          why: "A workflow with a write-scoped token that runs compromised code (a dependency postinstall, a malicious action) can push commits or publish packages.",
          suggestion: "Add `permissions: contents: read` at the top of the workflow, and grant write scopes per job only when required.",
        }),
      );
    }
    return findings;
  },
};

const scriptInjection: Rule = {
  id: "ci/script-injection",
  title: "Untrusted event data interpolated into a shell command",
  category: "ci",
  severity: "high",
  description: "`${{ github.event.* }}` placed inside `run:` is attacker-controlled shell input (command injection).",
  tags: ["ci", "security"],
  run(ctx) {
    const create = createFinder(scriptInjection);
    const findings: Finding[] = [];
    for (const file of workflowFiles(ctx)) {
      const lines = workflowLines(ctx, file);
      let insideRun = false;
      let blockIndent = 0;
      for (const line of lines) {
        const indent = line.text.length - line.text.trimStart().length;
        if (RUN_LINE_RE.test(line.text)) {
          insideRun = true;
          blockIndent = indent;
          // Inline form: run: echo "${{ github.event... }}"
          if (WORKFLOW_EXPRESSION_RE.test(line.text)) {
            findings.push(reportInjection(create, file, line.number, line.text));
          }
          continue;
        }
        if (insideRun) {
          if (line.text.trim().length === 0) continue;
          if (indent <= blockIndent) {
            insideRun = false;
          } else if (WORKFLOW_EXPRESSION_RE.test(line.text)) {
            findings.push(reportInjection(create, file, line.number, line.text));
          }
        }
      }
    }
    return findings;
  },
};

function reportInjection(
  create: ReturnType<typeof createFinder>,
  file: string,
  line: number,
  text: string,
): Finding {
  const match = WORKFLOW_EXPRESSION_RE.exec(text);
  return create({
    file,
    line,
    message: `Shell command interpolates untrusted event data: \${{ ${match?.[1]?.trim() ?? "github.event.*"} }}`,
    evidence: text.trim().slice(0, 160),
    why: "Pull request titles, issue bodies and branch names are attacker-controlled. Interpolating them into a shell script lets anyone run arbitrary commands in your CI with access to secrets.",
    suggestion: "Pass untrusted values through an environment variable instead: `env: TITLE: ${{ github.event.pull_request.title }}` then use \"$TITLE\" inside run.",
  });
}

const pullRequestTarget: Rule = {
  id: "ci/pull-request-target-checkout",
  title: "pull_request_target combined with checkout of PR code",
  category: "ci",
  severity: "critical",
  description: "`pull_request_target` runs with the base repo's secrets; checking out the PR head there hands secrets to fork authors.",
  tags: ["ci", "security"],
  run(ctx) {
    const create = createFinder(pullRequestTarget);
    const findings: Finding[] = [];
    for (const file of workflowFiles(ctx)) {
      const lines = workflowLines(ctx, file);
      // The trigger can be a mapping (`pull_request_target:`) or an inline
      // array (`on: [push, pull_request_target]`).
      const hasTrigger = lines.some(
        (line) =>
          /^\s{0,4}pull_request_target\s*:/.test(line.text) ||
          /^\s{0,4}on\s*:\s*\[[^\]]*pull_request_target/.test(line.text),
      );
      if (!hasTrigger) continue;
      const checkoutOfHead = lines.find(
        (line) =>
          /ref\s*:\s*\$\{\{\s*github\.event\.pull_request\.head\.(sha|ref)/.test(line.text) ||
          /ref\s*:\s*\$\{\{\s*github\.head_ref/.test(line.text),
      );
      const secretUse = lines.find((line) => /\$\{\{\s*secrets\./.test(line.text));
      if (!checkoutOfHead) continue;
      findings.push(
        create({
          severity: secretUse ? "critical" : "high",
          file,
          line: checkoutOfHead.number,
          message: "Workflow triggered by `pull_request_target` checks out and executes code from the pull request head.",
          evidence: checkoutOfHead.text.trim().slice(0, 160),
          why: "`pull_request_target` runs in the context of the base branch with repository secrets and a write-scoped token. Building or testing untrusted PR code there is equivalent to publishing your secrets to whoever opens a PR.",
          suggestion: "Split the workflow: use `pull_request` for untrusted code, and if you need secrets for a follow-up job, use a separate workflow triggered by `workflow_run` with no untrusted checkout.",
        }),
      );
    }
    return findings;
  },
};

const dependabotMissing: Rule = {
  id: "ci/dependabot-missing",
  title: "No dependency update automation",
  category: "ci",
  severity: "low",
  description: "Dependabot (or Renovate) keeps dependencies patched without manual work.",
  tags: ["ci", "dependencies", "maintenance"],
  run(ctx) {
    const create = createFinder(dependabotMissing);
    const hasDependabot =
      ctx.find([".github/dependabot.yml", ".github/dependabot.yaml"]).length > 0 ||
      ctx.find(["renovate.json", "renovate.json5", ".renovaterc", ".renovaterc.json", ".github/renovate.json"]).length > 0;
    if (hasDependabot) return [];
    const manifests = ctx.find(["package.json", "requirements.txt", "pyproject.toml", "go.mod", "Cargo.toml", "Gemfile", "composer.json", "pom.xml", "build.gradle"]);
    if (manifests.length === 0) return [];
    return [
      create({
        file: manifests[0],
        message: "No Dependabot or Renovate configuration was found.",
        why: `Unmaintained dependencies drift into known-vulnerable versions; automation keeps ${manifests.length} manifest(s) current with review overhead close to zero.`,
        suggestion: "Add .github/dependabot.yml with weekly update checks for your ecosystems and for GitHub Actions.",
        fix: {
          id: "add-dependabot",
          kind: "create-file",
          path: ".github/dependabot.yml",
          description: "Add weekly Dependabot updates for dependencies and GitHub Actions.",
          safe: true,
        },
      }),
    ];
  },
};

const codeqlMissing: Rule = {
  id: "ci/code-scanning-missing",
  title: "No static code analysis (CodeQL) workflow",
  category: "ci",
  severity: "info",
  description: "GitHub's free CodeQL analysis catches injection, path traversal and similar issues in supported languages.",
  tags: ["ci", "security"],
  run(ctx) {
    const create = createFinder(codeqlMissing);
    if (ctx.files.length === 0) return [];
    const hasCodeScanning =
      ctx.find([".github/workflows/*.yml", ".github/workflows/*.yaml"]).some((file) => /codeql|github\/codeql-action/i.test(ctx.readFile(file, 128 * 1024) ?? ""));
    if (hasCodeScanning) return [];
    const hasCode = ctx.find(["**/*.js", "**/*.ts", "**/*.py", "**/*.go", "**/*.java", "**/*.rb", "**/*.cs"]).length > 0;
    if (!hasCode) return [];
    return [
      create({
        message: "No CodeQL / code scanning workflow detected.",
        why: "Static analysis finds data-flow bugs (SQL injection, SSRF, unsafe deserialisation) that tests rarely cover, and it is free for public repositories.",
        suggestion: "Enable CodeQL from the repository's Security tab, or add the official codeql-action workflow.",
      }),
    ];
  },
};

export const githubRules: Rule[] = [
  workflowMissing,
  actionUnpinned,
  workflowPermissions,
  scriptInjection,
  pullRequestTarget,
  dependabotMissing,
  codeqlMissing,
];
