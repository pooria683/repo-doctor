import fs from "node:fs";
import path from "node:path";

import { buildContext } from "../../core/context.js";
import { resolveConfig, writeConfigFile } from "../../core/config.js";
import { describeProject, type ProjectInfo } from "../../core/project.js";
import {
  changelogTemplate,
  ciWorkflowTemplate,
  codeOfConductTemplate,
  codeownersTemplate,
  contributingTemplate,
  dependabotTemplate,
  dockerignoreTemplate,
  editorconfigTemplate,
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
  selfScanWorkflow,
  SUPPORTED_LICENSE_IDS,
} from "../../init/templates.js";
import { booleanFlag, stringFlag, type FlagValue } from "../args.js";
import { EXIT, fail } from "../shared.js";
import { paint, print, style, writeOutput } from "../output.js";

export const initHelp = `Usage: repo-doctor init [path] [options]

Bootstrap a repository with the documentation, community files, CI workflow and
Repo Doctor configuration required for a healthy open-source project. Existing
files are never modified.

Options:
  --name <name>          Project name (default: directory name or package.json)
  --owner <owner>        GitHub owner / copyright holder
  --description <text>   One-line project description
  --license <spdx>       License to generate: ${SUPPORTED_LICENSE_IDS.join(", ")} (default: MIT)
  --ci <github-actions|none>  Add a CI workflow (default: github-actions)
  --minimal              Only the essentials (README, LICENSE, .gitignore, config)
  --yes                  Do not ask anything (non-interactive; the default)
  --no-color             Disable ANSI colors
`;

interface ScaffoldFile {
  path: string;
  content: string;
  group: "essentials" | "docs" | "community" | "automation";
}

function scaffoldFiles(info: ProjectInfo, minimal: boolean, ci: boolean): ScaffoldFile[] {
  const files: ScaffoldFile[] = [];
  const license = licenseText(info.license, info.copyrightHolder);
  if (license) files.push({ path: "LICENSE", content: license, group: "essentials" });
  files.push({ path: "README.md", content: readmeTemplate(info), group: "essentials" });
  files.push({ path: ".gitignore", content: gitignoreTemplate(info), group: "essentials" });
  files.push({ path: ".editorconfig", content: editorconfigTemplate(info), group: "essentials" });

  if (minimal) return files;

  files.push({ path: "CONTRIBUTING.md", content: contributingTemplate(info), group: "docs" });
  files.push({ path: "CODE_OF_CONDUCT.md", content: codeOfConductTemplate(info), group: "docs" });
  files.push({ path: "SECURITY.md", content: securityPolicyTemplate(info), group: "docs" });
  files.push({ path: "CHANGELOG.md", content: changelogTemplate(info), group: "docs" });
  files.push({ path: "MAINTAINERS.md", content: maintainersTemplate(info), group: "docs" });

  files.push({ path: ".github/ISSUE_TEMPLATE/bug_report.yml", content: issueBugTemplate(), group: "community" });
  files.push({ path: ".github/ISSUE_TEMPLATE/feature_request.yml", content: issueFeatureTemplate(), group: "community" });
  files.push({ path: ".github/ISSUE_TEMPLATE/good_first_issue.yml", content: issueGoodFirstTemplate(), group: "community" });
  files.push({ path: ".github/ISSUE_TEMPLATE/config.yml", content: issueConfig(), group: "community" });
  files.push({ path: ".github/PULL_REQUEST_TEMPLATE.md", content: pullRequestTemplate(info), group: "community" });
  files.push({ path: ".github/CODEOWNERS", content: codeownersTemplate(info), group: "community" });

  if (ci) {
    files.push({ path: ".github/workflows/ci.yml", content: ciWorkflowTemplate(info), group: "automation" });
    files.push({ path: ".github/workflows/repo-doctor.yml", content: selfScanWorkflow(), group: "automation" });
    files.push({ path: ".github/dependabot.yml", content: dependabotTemplate(info), group: "automation" });
  }
  return files;
}

/** `repo-doctor init` */
export async function initCommand(positionals: string[], flags: Record<string, FlagValue>, cwd: string): Promise<number> {
  const target = positionals[0] ?? ".";
  const root = path.resolve(cwd, target);
  const colour = !booleanFlag(flags, "no-color", false);
  const p = (text: string, ...codes: string[]) => paint(text, ...(colour ? codes : []));

  if (fs.existsSync(root) && !fs.statSync(root).isDirectory()) {
    return fail(`Not a directory: ${target}`);
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  const licenseFlag = stringFlag(flags, "license") ?? "MIT";
  if (!(SUPPORTED_LICENSE_IDS as readonly string[]).includes(licenseFlag)) {
    return fail(
      `--license ${licenseFlag} cannot be generated offline. Supported: ${SUPPORTED_LICENSE_IDS.join(", ")}. Add other licenses manually.`,
    );
  }

  const config = resolveConfig({ license: licenseFlag, copyrightHolder: stringFlag(flags, "owner") ?? "" });
  const { ctx } = buildContext(root, config);
  const detected = describeProject(ctx);

  const info: ProjectInfo = {
    ...detected,
    name: stringFlag(flags, "name") ?? detected.name,
    description: stringFlag(flags, "description") ?? detected.description,
    owner: stringFlag(flags, "owner") ?? detected.owner,
    copyrightHolder: stringFlag(flags, "owner") ?? detected.copyrightHolder,
    license: licenseFlag,
  };

  const ciFlag = (stringFlag(flags, "ci") ?? "github-actions").toLowerCase();
  if (ciFlag !== "github-actions" && ciFlag !== "none") return fail("--ci must be github-actions or none.");

  const minimal = booleanFlag(flags, "minimal");
  const files = scaffoldFiles(info, minimal, ciFlag === "github-actions");

  print("");
  const shownPath = path.relative(cwd, root);
  print(p(`  Initializing ${info.name} in ${shownPath && !shownPath.startsWith("..") ? shownPath : root}`, style.bold));
  print("");

  const created: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const absolute = path.join(root, file.path);
    if (fs.existsSync(absolute)) {
      skipped.push(file.path);
      continue;
    }
    writeOutput(absolute, file.content);
    created.push(file.path);
    print(`  ${p("+", style.green)} ${file.path}`);
  }

  // Config file is written separately so it never masks an existing one.
  if (!fs.existsSync(path.join(root, ".repodoctorrc.json"))) {
    writeConfigFile(root, {
      failOn: "high",
      ignore: ["dist/**", "coverage/**"],
      license: licenseFlag,
      copyrightHolder: info.copyrightHolder,
    });
    created.push(".repodoctorrc.json");
    print(`  ${p("+", style.green)} .repodoctorrc.json`);
  } else {
    skipped.push(".repodoctorrc.json");
  }

  // .dockerignore only makes sense when a Dockerfile exists.
  if (ctx.find(["Dockerfile", "Dockerfile.*", "*.Dockerfile"]).length > 0 && !ctx.exists(".dockerignore")) {
    writeOutput(path.join(root, ".dockerignore"), dockerignoreTemplate(info));
    created.push(".dockerignore");
    print(`  ${p("+", style.green)} .dockerignore`);
  }

  print("");
  if (skipped.length > 0) {
    print(p(`  ${skipped.length} existing file(s) left untouched: ${skipped.slice(0, 6).join(", ")}${skipped.length > 6 ? "…" : ""}`, style.yellow));
    print("");
  }
  print(p(`  ✓ Created ${created.length} file(s).`, style.green));
  print("");
  print("  Next steps:");
  print(`    1. Replace the placeholders in README.md (description, install and usage commands).`);
  print(`    2. Set the Code of Conduct contact in CODE_OF_CONDUCT.md and the owner in .github/CODEOWNERS.`);
  print(`    3. Run ${p("npx repo-doctor scan .", style.cyan)} to see what is still missing.`);
  print(`    4. Commit the new files.`);
  print("");
  print(p("  Placeholder note: Repo Doctor never guesses names, emails or funding accounts.", style.dim));
  print("");

  return EXIT.ok;
}
