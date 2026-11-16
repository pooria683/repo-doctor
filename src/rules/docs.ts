import type { Rule } from "../types.js";
import { normalise, truncate } from "../util/text.js";
import { createFinder } from "./helpers.js";

const README_CANDIDATES = [
  "README.md",
  "README.markdown",
  "README.rst",
  "README.txt",
  "README",
  "readme.md",
  "Readme.md",
  "README.mdx",
];

const LICENSE_CANDIDATES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
  "COPYING",
  "COPYING.md",
  "license.md",
  "License.md",
];

const CONTRIBUTING_CANDIDATES = ["CONTRIBUTING.md", "CONTRIBUTING.rst", "CONTRIBUTING", "docs/CONTRIBUTING.md", ".github/CONTRIBUTING.md"];
const COC_CANDIDATES = ["CODE_OF_CONDUCT.md", "CODE_OF_CONDUCT.rst", "CODE_OF_CONDUCT", "docs/CODE_OF_CONDUCT.md", ".github/CODE_OF_CONDUCT.md"];
const SECURITY_CANDIDATES = ["SECURITY.md", "SECURITY.rst", ".github/SECURITY.md", "docs/SECURITY.md"];
const CHANGELOG_CANDIDATES = ["CHANGELOG.md", "CHANGELOG.rst", "CHANGELOG", "CHANGES.md", "HISTORY.md", "docs/CHANGELOG.md", "RELEASES.md"];

/** Sections a README should have before it counts as "useful". */
const README_SECTIONS: Array<{ id: string; label: string; patterns: RegExp[] }> = [
  { id: "install", label: "installation instructions", patterns: [/\binstall(ation|ing)?\b/, /\bgetting started\b/, /\bquick ?start\b/, /\bsetup\b/, /\brequirements\b/, /\bdownload\b/] },
  { id: "usage", label: "usage examples", patterns: [/\busage\b/, /\bexample/, /\bhow to use\b/, /\bquick ?start\b/, /\bapi\b/, /\bcommands?\b/] },
  { id: "license", label: "license information", patterns: [/\blicen[cs]e\b/, /\bmit\b/, /\bapache\b/, /\bgpl\b/] },
];

const KNOWN_LICENSES: Array<{ id: string; patterns: RegExp[] }> = [
  { id: "MIT", patterns: [/permission is hereby granted, free of charge/i, /the mit license/i] },
  { id: "Apache-2.0", patterns: [/apache license/i, /version 2\.0, january 2004/i] },
  { id: "AGPL-3.0", patterns: [/gnu affero general public license/i] },
  { id: "GPL-3.0", patterns: [/gnu general public license.*version 3/i] },
  { id: "GPL-2.0", patterns: [/gnu general public license.*version 2/i] },
  { id: "LGPL-3.0", patterns: [/gnu lesser general public license/i] },
  { id: "MPL-2.0", patterns: [/mozilla public license/i] },
  { id: "BSD-3-Clause", patterns: [/bsd 3-clause/i, /redistribution and use in source and binary forms/i] },
  { id: "ISC", patterns: [/isc license/i, /permission to use, copy, modify, and(\/or)? distribute/i] },
  { id: "Unlicense", patterns: [/this is free and unencumbered software released into the public domain/i] },
  { id: "CC0-1.0", patterns: [/creative commons zero/i, /cc0 1\.0/i] },
  { id: "EPL-2.0", patterns: [/eclipse public license/i] },
  { id: "BSL-1.0", patterns: [/boost software license/i] },
];

export function detectLicenseId(text: string): string | undefined {
  for (const license of KNOWN_LICENSES) {
    if (license.patterns.some((pattern) => pattern.test(text))) return license.id;
  }
  return undefined;
}

const readmeMissing: Rule = {
  id: "docs/readme-missing",
  title: "README file is missing",
  category: "documentation",
  severity: "high",
  description: "Every repository needs a README so visitors know what the project does and how to use it.",
  tags: ["documentation", "onboarding"],
  run(ctx) {
    const create = createFinder(readmeMissing);
    const readme = ctx.firstExisting(README_CANDIDATES);
    if (readme) return [];
    return [
      create({
        message: "No README file was found at the repository root.",
        why: "The README is the front page of a project: without it, new users and contributors cannot tell what the project does, whether it is maintained, or how to install it.",
        suggestion: "Run `repo-doctor fix --apply` to create a README skeleton, then fill in purpose, install and usage sections.",
        fix: {
          id: "add-readme",
          kind: "create-file",
          path: "README.md",
          description: "Create a README skeleton with purpose, install, usage, contributing and license sections.",
          safe: true,
        },
      }),
    ];
  },
};

const readmeThin: Rule = {
  id: "docs/readme-thin",
  title: "README lacks essential sections",
  category: "documentation",
  severity: "medium",
  description: "A README should explain what the project is, how to install it, how to use it and under which license.",
  requiresFile: README_CANDIDATES,
  tags: ["documentation", "onboarding"],
  run(ctx) {
    const create = createFinder(readmeThin);
    const readme = ctx.firstExisting(README_CANDIDATES)!;
    const content = ctx.readFile(readme) ?? "";
    const normalised = normalise(content);
    const missing = README_SECTIONS.filter((section) => !section.patterns.some((pattern) => pattern.test(normalised)));

    const findings = [];
    if (content.trim().length < 600) {
      findings.push(
        create({
          file: readme,
          message: `README is only ${content.trim().length} characters long, which is usually too short to be useful.`,
          evidence: truncate(content.trim(), 120),
          why: "A very short README does not answer the first three questions a visitor has: what is this, how do I run it, and can I use it?",
          suggestion: "Add a one-paragraph description, a minimal install snippet, one usage example and a license line.",
        }),
      );
    }
    if (missing.length > 0) {
      findings.push(
        create({
          file: readme,
          message: `README does not appear to cover: ${missing.map((section) => section.label).join(", ")}.`,
          why: "Missing sections force readers to inspect the source code to get started, which is the most common reason people abandon a project.",
          suggestion: `Add sections for: ${missing.map((section) => section.label).join(", ")}.`,
          meta: { missingSections: missing.map((section) => section.id) },
        }),
      );
    }
    return findings;
  },
};

const licenseMissing: Rule = {
  id: "docs/license-missing",
  title: "No license file",
  category: "documentation",
  severity: "high",
  description: "Without a license, default copyright law applies and nobody may legally use, modify or share the code.",
  tags: ["documentation", "legal"],
  run(ctx) {
    const create = createFinder(licenseMissing);
    if (ctx.firstExisting(LICENSE_CANDIDATES)) return [];
    return [
      create({
        message: "No LICENSE / COPYING file was found at the repository root.",
        why: "Code without a license is not open source: companies and individuals cannot legally reuse it, and package registries may refuse it.",
        suggestion: "Add a LICENSE file (MIT or Apache-2.0 are common defaults) and reference the license in your README and package metadata.",
        fix: {
          id: "add-license",
          kind: "create-file",
          path: "LICENSE",
          description: "Create a LICENSE file (MIT by default; pass --license to choose another SPDX id).",
          safe: true,
        },
      }),
    ];
  },
};

const licenseUnrecognized: Rule = {
  id: "docs/license-unrecognized",
  title: "License text is not a recognizable open-source license",
  category: "documentation",
  severity: "low",
  description: "Custom license text slows down adoption because users and automated license scanners cannot classify it.",
  requiresFile: LICENSE_CANDIDATES,
  tags: ["documentation", "legal"],
  run(ctx) {
    const create = createFinder(licenseUnrecognized);
    const license = ctx.firstExisting(LICENSE_CANDIDATES)!;
    const content = ctx.readFile(license) ?? "";
    if (content.trim().length < 40) {
      return [
        create({
          file: license,
          message: `${license} is nearly empty.`,
          why: "An empty or stub license file is legally the same as no license at all.",
          suggestion: "Replace it with the full text of a recognized license such as MIT or Apache-2.0.",
        }),
      ];
    }
    if (detectLicenseId(content)) return [];
    return [
      create({
        file: license,
        message: `The text in ${license} does not match a recognized open-source license.`,
        evidence: truncate(content.trim().split("\n")[0] ?? "", 120),
        why: "Unrecognized license text makes dependency scanners, package registries and corporate legal teams treat the project as unlicensed.",
        suggestion: "Use an SPDX-recognized license text, or clearly state the terms in the README.",
      }),
    ];
  },
};

const licenseMetadata: Rule = {
  id: "docs/license-metadata-missing",
  title: "Package metadata has no license field",
  category: "documentation",
  severity: "low",
  description: "Package manifests should declare their license so registries and scanners can resolve it without guesswork.",
  requiresFile: ["package.json", "pyproject.toml", "Cargo.toml", "composer.json", "setup.py"],
  tags: ["documentation", "packaging"],
  run(ctx) {
    const create = createFinder(licenseMetadata);
    if (ctx.pkg) {
      const license = typeof ctx.pkg.license === "string" ? ctx.pkg.license : ctx.pkg.license?.type;
      if (!license) {
        return [
          create({
            file: "package.json",
            message: 'package.json has no "license" field.',
            why: "npm and automated license scanners read the manifest, not the LICENSE file.",
            suggestion: 'Add `"license": "MIT"` (or your SPDX id) to package.json.',
          }),
        ];
      }
      if (license.toUpperCase() === "UNLICENSED" || license.toUpperCase() === "SEE LICENSE IN LICENSE") {
        return [];
      }
      const licenseFile = ctx.firstExisting(LICENSE_CANDIDATES);
      if (licenseFile) {
        const detected = detectLicenseId(ctx.readFile(licenseFile) ?? "");
        if (detected && !license.toUpperCase().startsWith(detected.toUpperCase().split("-")[0]!)) {
          return [
            create({
              severity: "low",
              file: "package.json",
              message: `package.json declares "${license}" but the LICENSE file looks like ${detected}.`,
              why: "Conflicting license metadata creates legal ambiguity for anyone reusing the code.",
              suggestion: `Align the manifest license field with the LICENSE file (or vice versa).`,
            }),
          ];
        }
      }
      return [];
    }

    const pyproject = ctx.readFile("pyproject.toml");
    if (pyproject && !/\blicen[cs]e\b/i.test(pyproject)) {
      return [
        create({
          file: "pyproject.toml",
          message: "pyproject.toml does not declare a license.",
          why: "PyPI displays the license from project metadata; missing it hides the project from license-compatible consumers.",
          suggestion: 'Add `license = "MIT"` (or `license = {text = "MIT"}`) to the `[project]` table.',
        }),
      ];
    }
    return [];
  },
};

const contributingMissing: Rule = {
  id: "docs/contributing-missing",
  title: "No CONTRIBUTING guide",
  category: "documentation",
  severity: "medium",
  description: "A CONTRIBUTING guide tells people how to set up the project, run tests and submit changes.",
  tags: ["documentation", "community"],
  run(ctx) {
    const create = createFinder(contributingMissing);
    if (ctx.firstExisting(CONTRIBUTING_CANDIDATES)) return [];
    return [
      create({
        message: "No CONTRIBUTING.md was found at the root, in docs/ or in .github/.",
        why: "Contributors who cannot find setup and test instructions either open low-quality issues or give up. GitHub also links this file automatically on every issue.",
        suggestion: "Add CONTRIBUTING.md with local setup, test commands, commit conventions and PR expectations.",
        fix: {
          id: "add-contributing",
          kind: "create-file",
          path: "CONTRIBUTING.md",
          description: "Create a CONTRIBUTING guide covering setup, tests, coding style and PR flow.",
          safe: true,
        },
      }),
    ];
  },
};

const codeOfConductMissing: Rule = {
  id: "docs/code-of-conduct-missing",
  title: "No CODE_OF_CONDUCT",
  category: "documentation",
  severity: "medium",
  description: "A code of conduct sets expectations for behaviour and gives maintainers a response path for harassment reports.",
  tags: ["documentation", "community"],
  run(ctx) {
    const create = createFinder(codeOfConductMissing);
    if (ctx.firstExisting(COC_CANDIDATES)) return [];
    return [
      create({
        message: "No CODE_OF_CONDUCT.md was found.",
        why: "Projects without a code of conduct signal that behaviour is unmanaged, which disproportionately discourages newcomers and under-represented contributors.",
        suggestion: "Adopt the Contributor Covenant 2.1 and name a contact for reports.",
        fix: {
          id: "add-code-of-conduct",
          kind: "create-file",
          path: "CODE_OF_CONDUCT.md",
          description: "Add the Contributor Covenant 2.1 with a placeholder enforcement contact.",
          safe: true,
        },
      }),
    ];
  },
};

const securityPolicyMissing: Rule = {
  id: "docs/security-policy-missing",
  title: "No SECURITY policy",
  category: "documentation",
  severity: "low",
  description: "A SECURITY.md tells researchers how to report vulnerabilities privately instead of in public issues.",
  tags: ["documentation", "security"],
  run(ctx) {
    const create = createFinder(securityPolicyMissing);
    if (ctx.firstExisting(SECURITY_CANDIDATES)) return [];
    return [
      create({
        message: "No SECURITY.md was found.",
        why: "Without a private reporting channel, vulnerabilities are often disclosed as public issues before a fix exists.",
        suggestion: "Add SECURITY.md with supported versions, a reporting channel and a response-time expectation.",
        fix: {
          id: "add-security-policy",
          kind: "create-file",
          path: "SECURITY.md",
          description: "Create a vulnerability disclosure policy.",
          safe: true,
        },
      }),
    ];
  },
};

const changelogMissing: Rule = {
  id: "docs/changelog-missing",
  title: "No CHANGELOG",
  category: "documentation",
  severity: "low",
  description: "A changelog lets users see what changed between versions without reading every commit.",
  tags: ["documentation", "release"],
  run(ctx) {
    const create = createFinder(changelogMissing);
    if (ctx.firstExisting(CHANGELOG_CANDIDATES)) return [];
    if (ctx.git.isRepo && (ctx.git.commitCount ?? 0) < 15) return [];
    return [
      create({
        message: "No CHANGELOG.md was found.",
        why: "Users upgrading a dependency need to know what changed and whether a release contains breaking changes.",
        suggestion: "Add CHANGELOG.md following Keep a Changelog, or automate it with release-please / semantic-release.",
        fix: {
          id: "add-changelog",
          kind: "create-file",
          path: "CHANGELOG.md",
          description: "Create a Keep-a-Changelog style CHANGELOG.md.",
          safe: true,
        },
      }),
    ];
  },
};

const issueTemplatesMissing: Rule = {
  id: "docs/issue-templates-missing",
  title: "No issue templates",
  category: "documentation",
  severity: "low",
  description: "Issue templates collect the information maintainers need and reduce back-and-forth.",
  tags: ["documentation", "community", "github"],
  run(ctx) {
    const create = createFinder(issueTemplatesMissing);
    const hasTemplates =
      ctx.exists(".github/ISSUE_TEMPLATE") ||
      ctx.find([".github/ISSUE_TEMPLATE.md", ".github/issue_template.md", "docs/ISSUE_TEMPLATE.md"]).length > 0;
    if (hasTemplates) return [];
    return [
      create({
        message: "No issue templates were found in .github/ISSUE_TEMPLATE/.",
        why: "Unstructured bug reports regularly omit versions, reproduction steps and logs, which slows triage.",
        suggestion: "Add bug report and feature request templates.",
        fix: {
          id: "add-issue-templates",
          kind: "create-file",
          path: ".github/ISSUE_TEMPLATE/bug_report.yml",
          description: "Add bug report and feature request issue forms.",
          safe: true,
        },
      }),
    ];
  },
};

const prTemplateMissing: Rule = {
  id: "docs/pr-template-missing",
  title: "No pull request template",
  category: "documentation",
  severity: "low",
  description: "A PR template reminds contributors about tests, docs and changelog entries.",
  tags: ["documentation", "community", "github"],
  run(ctx) {
    const create = createFinder(prTemplateMissing);
    const hasTemplate = ctx.find([
      ".github/PULL_REQUEST_TEMPLATE.md",
      ".github/pull_request_template.md",
      "PULL_REQUEST_TEMPLATE.md",
      "docs/PULL_REQUEST_TEMPLATE.md",
      ".github/PULL_REQUEST_TEMPLATE/*.md",
    ]);
    if (hasTemplate.length > 0) return [];
    return [
      create({
        message: "No pull request template was found.",
        why: "PRs that arrive without a linked issue, tests or a changelog note push review work back onto maintainers.",
        suggestion: "Add .github/PULL_REQUEST_TEMPLATE.md with a short checklist.",
        fix: {
          id: "add-pr-template",
          kind: "create-file",
          path: ".github/PULL_REQUEST_TEMPLATE.md",
          description: "Add a PR checklist template.",
          safe: true,
        },
      }),
    ];
  },
};

export const docsRules: Rule[] = [
  readmeMissing,
  readmeThin,
  licenseMissing,
  licenseUnrecognized,
  licenseMetadata,
  contributingMissing,
  codeOfConductMissing,
  securityPolicyMissing,
  changelogMissing,
  issueTemplatesMissing,
  prTemplateMissing,
];
