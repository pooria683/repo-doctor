import { describeProject, type ProjectInfo } from "../core/project.js";
import {
  changelogTemplate,
  ciWorkflowTemplate,
  codeOfConductTemplate,
  codeownersTemplate,
  configTemplate,
  contributingTemplate,
  dependabotTemplate,
  dockerignoreTemplate,
  editorconfigTemplate,
  fundingTemplate,
  gitignoreTemplate,
  issueBugTemplate,
  issueConfig,
  issueFeatureTemplate,
  issueGoodFirstTemplate,
  licenseText,
  maintainersTemplate,
  pullRequestTemplate,
  readmeTemplate,
  securityPolicyTemplate,
  smokeTestTemplate,
} from "../init/templates.js";
import type { RuleContext } from "../types.js";

export interface FixFile {
  path: string;
  content: string;
}

export interface FixRecipe {
  id: string;
  title: string;
  description: string;
  /** Safe fixes only ever create files that do not exist yet. */
  safe: boolean;
  ruleIds: string[];
  files: (ctx: RuleContext, info: ProjectInfo) => FixFile[];
}

function recipe(
  input: Omit<FixRecipe, "files"> & { files: (ctx: RuleContext, info: ProjectInfo) => FixFile[] },
): FixRecipe {
  return input;
}

export const FIX_RECIPES: Record<string, FixRecipe> = {
  "add-readme": recipe({
    id: "add-readme",
    title: "Create README.md",
    description: "A README skeleton with description, install, usage, contributing, security and license sections.",
    safe: true,
    ruleIds: ["docs/readme-missing"],
    files: (_ctx, info) => [{ path: "README.md", content: readmeTemplate(info) }],
  }),
  "add-license": recipe({
    id: "add-license",
    title: "Create LICENSE",
    description: "Renders the full text of the configured SPDX license (MIT, ISC, BSD-3-Clause, Unlicense).",
    safe: true,
    ruleIds: ["docs/license-missing"],
    files: (_ctx, info) => {
      const text = licenseText(info.license, info.copyrightHolder);
      if (!text) {
        throw new Error(
          `License "${info.license}" cannot be rendered offline. Supported: MIT, ISC, BSD-3-Clause, Unlicense. Pass --license with one of those.`,
        );
      }
      return [{ path: "LICENSE", content: text }];
    },
  }),
  "add-contributing": recipe({
    id: "add-contributing",
    title: "Create CONTRIBUTING.md",
    description: "Setup, test commands, commit conventions, PR checklist and the label taxonomy.",
    safe: true,
    ruleIds: ["docs/contributing-missing"],
    files: (_ctx, info) => [{ path: "CONTRIBUTING.md", content: contributingTemplate(info) }],
  }),
  "add-code-of-conduct": recipe({
    id: "add-code-of-conduct",
    title: "Create CODE_OF_CONDUCT.md",
    description: "Contributor Covenant 2.1 with a placeholder enforcement contact.",
    safe: true,
    ruleIds: ["docs/code-of-conduct-missing"],
    files: (_ctx, info) => [{ path: "CODE_OF_CONDUCT.md", content: codeOfConductTemplate(info) }],
  }),
  "add-security-policy": recipe({
    id: "add-security-policy",
    title: "Create SECURITY.md",
    description: "Vulnerability disclosure policy with response expectations.",
    safe: true,
    ruleIds: ["docs/security-policy-missing"],
    files: (_ctx, info) => [{ path: "SECURITY.md", content: securityPolicyTemplate(info) }],
  }),
  "add-changelog": recipe({
    id: "add-changelog",
    title: "Create CHANGELOG.md",
    description: "Keep-a-Changelog scaffold with an Unreleased section.",
    safe: true,
    ruleIds: ["docs/changelog-missing"],
    files: (_ctx, info) => [{ path: "CHANGELOG.md", content: changelogTemplate(info) }],
  }),
  "add-issue-templates": recipe({
    id: "add-issue-templates",
    title: "Create issue templates",
    description: "Bug report, feature request and good-first-issue forms plus the chooser config.",
    safe: true,
    ruleIds: ["docs/issue-templates-missing"],
    files: () => [
      { path: ".github/ISSUE_TEMPLATE/bug_report.yml", content: issueBugTemplate() },
      { path: ".github/ISSUE_TEMPLATE/feature_request.yml", content: issueFeatureTemplate() },
      { path: ".github/ISSUE_TEMPLATE/good_first_issue.yml", content: issueGoodFirstTemplate() },
      { path: ".github/ISSUE_TEMPLATE/config.yml", content: issueConfig() },
    ],
  }),
  "add-pr-template": recipe({
    id: "add-pr-template",
    title: "Create pull request template",
    description: "PR checklist covering tests, docs, changelog and secret hygiene.",
    safe: true,
    ruleIds: ["docs/pr-template-missing"],
    files: (_ctx, info) => [{ path: ".github/PULL_REQUEST_TEMPLATE.md", content: pullRequestTemplate(info) }],
  }),
  "add-gitignore": recipe({
    id: "add-gitignore",
    title: "Create .gitignore",
    description: "Language-aware ignore rules for secrets, dependencies, build output and editor noise.",
    safe: true,
    ruleIds: ["security/gitignore-missing"],
    files: (_ctx, info) => [{ path: ".gitignore", content: gitignoreTemplate(info) }],
  }),
  "add-dockerignore": recipe({
    id: "add-dockerignore",
    title: "Create .dockerignore",
    description: "Keeps VCS data, secrets, dependencies and build output out of the image context.",
    safe: true,
    ruleIds: ["containers/dockerignore-missing"],
    files: (_ctx, info) => [{ path: ".dockerignore", content: dockerignoreTemplate(info) }],
  }),
  "add-editorconfig": recipe({
    id: "add-editorconfig",
    title: "Create .editorconfig",
    description: "Consistent indentation and line endings matched to the repository's existing style.",
    safe: true,
    ruleIds: ["quality/editorconfig-missing"],
    files: (_ctx, info) => [{ path: ".editorconfig", content: editorconfigTemplate(info) }],
  }),
  "add-ci-workflow": recipe({
    id: "add-ci-workflow",
    title: "Create GitHub Actions CI workflow",
    description: "Install, lint, typecheck and test on push and pull request with least-privilege permissions.",
    safe: true,
    ruleIds: ["ci/workflow-missing"],
    files: (_ctx, info) => [{ path: ".github/workflows/ci.yml", content: ciWorkflowTemplate(info) }],
  }),
  "add-dependabot": recipe({
    id: "add-dependabot",
    title: "Create Dependabot config",
    description: "Weekly dependency and GitHub Actions updates with grouping.",
    safe: true,
    ruleIds: ["ci/dependabot-missing"],
    files: (_ctx, info) => [{ path: ".github/dependabot.yml", content: dependabotTemplate(info) }],
  }),
  "add-codeowners": recipe({
    id: "add-codeowners",
    title: "Create CODEOWNERS",
    description: "Ownership map with a placeholder maintainer handle.",
    safe: true,
    ruleIds: ["community/codeowners-missing"],
    files: (_ctx, info) => [{ path: ".github/CODEOWNERS", content: codeownersTemplate(info) }],
  }),
  "add-funding": recipe({
    id: "add-funding",
    title: "Create FUNDING.yml",
    description: "GitHub Sponsors configuration stub.",
    safe: true,
    ruleIds: ["community/funding-missing"],
    files: (_ctx, info) => [{ path: ".github/FUNDING.yml", content: fundingTemplate(info) }],
  }),
  "add-maintainers": recipe({
    id: "add-maintainers",
    title: "Create MAINTAINERS.md",
    description: "Ownership and decision-making documentation.",
    safe: true,
    ruleIds: ["community/governance-missing"],
    files: (_ctx, info) => [{ path: "MAINTAINERS.md", content: maintainersTemplate(info) }],
  }),
  "add-test-scaffold": recipe({
    id: "add-test-scaffold",
    title: "Create a smoke test",
    description: "A single passing test so CI has something to run and contributors see the convention.",
    safe: true,
    ruleIds: ["quality/tests-missing"],
    files: (_ctx, info) => [
      {
        path: info.languages.includes("python") ? "tests/test_smoke.py" : "tests/smoke.test.js",
        content: smokeTestTemplate(info),
      },
    ],
  }),
  "add-config": recipe({
    id: "add-config",
    title: "Create .repodoctorrc.json",
    description: "Starter configuration with documented defaults.",
    safe: true,
    ruleIds: [],
    files: () => [{ path: ".repodoctorrc.json", content: configTemplate() }],
  }),
};
