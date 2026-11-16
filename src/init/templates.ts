/**
 * File templates used by `repo-doctor fix` and `repo-doctor init`.
 *
 * Every template is a pure function of project info, so the same content is
 * produced deterministically. Templates never touch user content: they only
 * create files that do not exist yet.
 */

import type { ProjectInfo } from "../core/project.js";

const MIT = (year: number, holder: string): string => `MIT License

Copyright (c) ${year} ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const ISC = (year: number, holder: string): string => `ISC License

Copyright (c) ${year} ${holder}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;

const BSD3 = (year: number, holder: string): string => `BSD 3-Clause License

Copyright (c) ${year}, ${holder}

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
`;

const UNLICENSE = (): string => `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute this
software, either in source code form or as a compiled binary, for any purpose,
commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org/>
`;

export const SUPPORTED_LICENSE_IDS = ["MIT", "ISC", "BSD-3-Clause", "Unlicense"] as const;

/** Render license text. Returns null for licenses we cannot render offline. */
export function licenseText(spdxId: string, holder: string, year = new Date().getFullYear()): string | null {
  switch (spdxId.toUpperCase()) {
    case "MIT":
      return MIT(year, holder);
    case "ISC":
      return ISC(year, holder);
    case "BSD-3-CLAUSE":
    case "BSD-3-CLAUSE-CLEAR":
      return BSD3(year, holder);
    case "UNLICENSE":
      return UNLICENSE();
    default:
      return null;
  }
}

export function readmeTemplate(info: ProjectInfo): string {
  const repoLine = info.repoUrl ? `\n<p align="center">\n  <a href="${info.repoUrl}"><img alt="Repository" src="https://img.shields.io/badge/github-${encodeURIComponent(info.slug ?? "source")}-blue" /></a>\n  <img alt="License" src="https://img.shields.io/badge/license-${encodeURIComponent(info.license)}-green" />\n</p>\n` : "";
  return `# ${info.name}

> ${info.description || "One sentence that explains what this project does and who it is for."}
${repoLine}
## Why

Explain the problem this project solves and what makes it different from the
alternatives. Two or three sentences are enough.

## Installation

\`\`\`bash
# Replace with the real command for your stack
npm install ${info.name}
\`\`\`

## Usage

\`\`\`js
// A minimal, runnable example. This section is the one people read first.
import { thing } from "${info.name}";

thing();
\`\`\`

## Documentation

Link to deeper documentation, or document the main options here in a table.

| Option | Default | Description |
| ------ | ------- | ----------- |
| \`--example\` | \`false\` | What this option does |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and
our [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.
Issues labelled [\`good first issue\`](${info.repoUrl ?? "#"}/labels/good%20first%20issue)
are a good starting point.

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

${info.license} © ${new Date().getFullYear()} ${info.copyrightHolder}
`;
}

export function contributingTemplate(info: ProjectInfo): string {
  const testCommand = info.languages.includes("node") ? "npm test" : info.languages.includes("python") ? "pytest" : info.languages.includes("go") ? "go test ./..." : info.languages.includes("rust") ? "cargo test" : "make test";
  return `# Contributing to ${info.name}

Thanks for taking the time to contribute. This document explains how to get a
change from an idea to a merged pull request.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By
participating you agree to uphold it.

## Ways to contribute

- **Report a bug** — open an issue with a minimal reproduction.
- **Request a feature** — describe the problem, not only the solution.
- **Improve documentation** — typos, unclear steps and missing examples are real bugs.
- **Write code** — start with issues labelled \`good first issue\`.

## Development setup

\`\`\`bash
git clone ${info.repoUrl ?? "https://github.com/owner/repo.git"}
cd ${info.name}
# install dependencies with your package manager
# e.g. npm install / pip install -e ".[dev]" / cargo build
\`\`\`

## Before you open a pull request

1. Read the issue (or open one) so we agree on the approach.
2. Keep the change focused: one logical change per pull request.
3. Add or update tests for behaviour changes.
4. Update the documentation and CHANGELOG when user-visible behaviour changes.
5. Run the checks locally:

\`\`\`bash
# tests
${testCommand}
# lint + format
npm run lint && npm run format:check
\`\`\`

## Commit messages

Use short imperative subjects (\`add retry to scanner\`, not \`added retries\`). If
your change is non-obvious, explain *why* in the body.

## Pull request review

- A maintainer reviews within about a week. A polite ping after that is fine.
- We may ask for changes; that is normal and not a judgement of your work.
- Squash-merge is the default, so do not worry about commit hygiene inside the branch.

## Issue labels

| Label | Meaning |
| ----- | ------- |
| \`good first issue\` | Small, well-scoped, no prior knowledge of the codebase needed |
| \`help wanted\` | Maintainers would welcome a contributor here |
| \`bug\` | Something behaves incorrectly |
| \`enhancement\` | New capability or improvement |
| \`documentation\` | Docs-only change |
| \`needs triage\` | Not yet reviewed by a maintainer |
`;
}

export function codeOfConductTemplate(info: ProjectInfo): string {
  const contact = info.owner ? `@${info.owner}` : "the maintainers";
  return `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, caste, colour, religion, or sexual
identity and orientation.

We pledge to act and interact in ways that contribute to an open, welcoming,
diverse, inclusive, and healthy community.

## Our Standards

Examples of behaviour that contributes to a positive environment:

- Demonstrating empathy and kindness toward other people
- Being respectful of differing opinions, viewpoints, and experiences
- Giving and gracefully accepting constructive feedback
- Accepting responsibility and apologising to those affected by our mistakes

Examples of unacceptable behaviour:

- The use of sexualised language or imagery, and sexual attention of any kind
- Trolling, insulting or derogatory comments, and personal or political attacks
- Public or private harassment
- Publishing others' private information without explicit permission

## Enforcement Responsibilities

Maintainers are responsible for clarifying and enforcing these standards and
will take appropriate and fair corrective action in response to behaviour they
deem inappropriate, threatening, offensive, or harmful.

## Scope

This Code of Conduct applies within all community spaces and also applies when
an individual is officially representing the community in public spaces.

## Enforcement

Report abusive, harassing, or otherwise unacceptable behaviour to
**${contact}**. All complaints will be reviewed and investigated promptly and
fairly, and the privacy and security of the reporter will be respected.

## Enforcement Guidelines

1. **Correction** — a private written warning with clarity about the violation.
2. **Warning** — a warning with consequences for continued behaviour.
3. **Temporary ban** — a temporary ban from interaction with the community.
4. **Permanent ban** — a permanent ban from public interaction with the project.

## Attribution

This Code of Conduct is adapted from the [Contributor Covenant](https://www.contributor-covenant.org),
version 2.1, available at
<https://www.contributor-covenant.org/version/2/1/code_of_conduct/>.
`;
}

export function securityPolicyTemplate(info: ProjectInfo): string {
  return `# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| latest release | ✅ |
| older releases | ❌ |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

- Use GitHub's private reporting flow: **Security → Advisories → Report a vulnerability**
  ${info.repoUrl ? `(${info.repoUrl}/security/advisories/new)` : ""}
- Include the affected version, a reproduction, and the impact you believe it has.

## What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement | within 3 working days |
| Initial assessment | within 7 days |
| Fix or mitigation | as soon as practical, coordinated with you |

We will credit reporters in the advisory unless you prefer to stay anonymous.

## Scope

In scope: vulnerabilities in ${info.name} itself and its published artefacts.
Out of scope: reports that require a compromised local machine, missing
security headers on a demo deployment, or dependency issues already covered by a
public advisory and a version bump.
`;
}

export function changelogTemplate(info: ProjectInfo): string {
  return `# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release.

## [0.1.0] - ${new Date().toISOString().slice(0, 10)}

### Added

- First cut of ${info.name}.
`;
}

export function gitignoreTemplate(info: ProjectInfo): string {
  const sections: string[] = [
    `# Secrets and local configuration
.env
.env.*
!.env.example
*.pem
*.key
*.p12
secrets.yml`,
  ];

  if (info.languages.includes("node")) {
    sections.push(`# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
dist/
build/
coverage/
.next/
.turbo/
*.tsbuildinfo`);
  }
  if (info.languages.includes("python")) {
    sections.push(`# Python
__pycache__/
*.py[cod]
*.egg-info/
.venv/
venv/
.pytest_cache/
.mypy_cache/
.ruff_cache/
build/
dist/`);
  }
  if (info.languages.includes("go")) {
    sections.push(`# Go
/bin/
*.test
*.out`);
  }
  if (info.languages.includes("rust")) {
    sections.push(`# Rust
/target/`);
  }
  if (info.languages.includes("ruby")) {
    sections.push(`# Ruby
/.bundle/
/vendor/bundle
*.gem`);
  }
  if (info.languages.includes("php")) {
    sections.push(`# PHP
/vendor/
composer.phar`);
  }

  sections.push(`# Logs and databases
*.log
*.sqlite
*.sqlite3
*.db

# Editors and OS
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp

# Build artefacts
*.zip
*.tar.gz`);
  return sections.join("\n\n") + "\n";
}

export function dockerignoreTemplate(info: ProjectInfo): string {
  return `# Version control and CI
.git
.gitignore
.github
.gitlab-ci.yml

# Dependencies (installed inside the image)
node_modules
.venv
venv
vendor

# Secrets — never send these to the build context
.env
.env.*
*.pem
*.key
.npmrc
.netrc

# Build output and caches
dist
build
out
target
coverage
.cache
.next
.turbo

# Local and editor noise
*.log
.DS_Store
.idea
.vscode
README.md
docs
tests
${info.languages.includes("node") ? "*.test.js\n*.spec.ts\n" : ""}`;
}

export function editorconfigTemplate(info: ProjectInfo): string {
  const indent = info.indent === "\t" ? "tab" : "space";
  const indentSize = info.indent === "\t" ? 4 : info.indent.length;
  return `root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = ${indent}
indent_size = ${indentSize}

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;
}

export function issueBugTemplate(): string {
  return `name: Bug report
description: Something does not work as documented
title: "bug: "
labels: ["bug", "needs triage"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for the report. A minimal reproduction is the single most useful thing you can provide.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Describe the actual behaviour, including error messages.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect to happen?
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Run ...
        2. With config ...
        3. See error
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      description: Output of the version command, or the commit SHA.
    validations:
      required: true
  - type: input
    id: environment
    attributes:
      label: Environment
      description: OS, runtime version, package manager.
    validations:
      required: false
`;
}

export function issueFeatureTemplate(): string {
  return `name: Feature request
description: Suggest a capability or an improvement
title: "feat: "
labels: ["enhancement", "needs triage"]
body:
  - type: markdown
    attributes:
      value: |
        Please describe the problem before the solution — it helps us find the best design.
  - type: textarea
    id: problem
    attributes:
      label: What problem are you trying to solve?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed solution
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
    validations:
      required: false
  - type: dropdown
    id: contribution
    attributes:
      label: Would you be able to contribute this?
      options:
        - "Yes, I can open a pull request"
        - "Yes, with guidance"
        - "No"
    validations:
      required: true
`;
}

export function issueGoodFirstTemplate(): string {
  return `name: Good first issue
description: A small, well-scoped task suitable for a first-time contributor
title: ""
labels: ["good first issue", "help wanted"]
body:
  - type: markdown
    attributes:
      value: |
        This is a beginner-friendly task. If you get stuck, ask in the issue — nobody expects you to know the codebase yet.
  - type: textarea
    id: context
    attributes:
      label: Context
      description: What is missing or wrong, and where in the code does it live?
    validations:
      required: true
  - type: textarea
    id: task
    attributes:
      label: What needs to be done
      description: Concrete, checkable steps.
    validations:
      required: true
  - type: textarea
    id: hints
    attributes:
      label: Hints
      description: Files to look at, similar code, commands to run.
    validations:
      required: false
  - type: textarea
    id: done
    attributes:
      label: Definition of done
      placeholder: |
        - [ ] Behaviour implemented
        - [ ] Tests added
        - [ ] Documentation updated
    validations:
      required: true
`;
}

export function issueConfig(): string {
  return `blank_issues_enabled: false
contact_links:
  - name: Question or discussion
    url: https://github.com/OWNER/REPO/discussions
    about: Please ask usage questions in Discussions rather than in issues.
  - name: Security vulnerability
    url: https://github.com/OWNER/REPO/security/advisories/new
    about: Report security issues privately, never in a public issue.
`;
}

export function pullRequestTemplate(info: ProjectInfo): string {
  return `## What does this change do?

<!-- One or two sentences. Link the issue: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactor / internal
- [ ] Breaking change

## Checklist

- [ ] Tests added or updated
- [ ] \`npm test\` / \`pytest\` / \`go test ./...\` passes locally
- [ ] Documentation updated (README, docs/, --help text)
- [ ] CHANGELOG entry added for user-visible changes
- [ ] No secrets, credentials or personal data in the diff
- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md)

## How to verify

<!-- Commands a reviewer can run to see the change working -->

\`\`\`bash
${info.languages.includes("node") ? "npm test" : "make test"}
\`\`\`
`;
}

export function fundingTemplate(info: ProjectInfo): string {
  return `# These are supported funding model platforms.
# Delete this file if you do not accept funding.

github: [${info.owner ?? "your-github-username"}]
# patreon: # Replace with a single Patreon username
# open_collective: # Replace with a single Open Collective username
# ko_fi: # Replace with a single Ko-fi username
# tidelift: # Replace with a single Tidelift platform-name/package-name
# custom: ["https://example.com/sponsor"]
`;
}

export function codeownersTemplate(info: ProjectInfo): string {
  const owner = info.owner ? `@${info.owner}` : "@your-github-handle";
  return `# CODEOWNERS — https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners
#
# Replace the placeholder below with the maintainers of each area.

* ${owner}

# Security-sensitive paths need a second reviewer.
/.github/ ${owner}
/SECURITY.md ${owner}
`;
}

export function dependabotTemplate(info: ProjectInfo): string {
  const ecosystems: string[] = [];
  if (info.languages.includes("node")) ecosystems.push(`  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
    groups:
      dev-dependencies:
        dependency-type: "development"`);
  if (info.languages.includes("python")) ecosystems.push(`  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"`);
  if (info.languages.includes("go")) ecosystems.push(`  - package-ecosystem: "gomod"
    directory: "/"
    schedule:
      interval: "weekly"`);
  if (info.languages.includes("rust")) ecosystems.push(`  - package-ecosystem: "cargo"
    directory: "/"
    schedule:
      interval: "weekly"`);
  if (info.languages.includes("ruby")) ecosystems.push(`  - package-ecosystem: "bundler"
    directory: "/"
    schedule:
      interval: "weekly"`);
  if (ecosystems.length === 0) {
    ecosystems.push(`  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"`);
  }
  return `version: 2
updates:
${ecosystems.join("\n")}
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    groups:
      actions:
        patterns: ["*"]
`;
}

export function ciWorkflowTemplate(info: ProjectInfo): string {
  const steps: string[] = [];
  let setup = "";
  let install = "";
  let checks = "";

  if (info.languages.includes("node")) {
    setup = `      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
`;
    install = `      - name: Install dependencies
        run: npm ci
`;
    checks = `      - name: Lint
        run: npm run lint --if-present

      - name: Typecheck
        run: npm run typecheck --if-present

      - name: Test
        run: npm test --if-present
`;
  } else if (info.languages.includes("python")) {
    setup = `      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"
`;
    install = `      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          pip install -e ".[dev]" || pip install -r requirements.txt
`;
    checks = `      - name: Lint
        run: ruff check . || true

      - name: Test
        run: pytest -q
`;
  } else if (info.languages.includes("go")) {
    setup = `      - name: Set up Go
        uses: actions/setup-go@v5
        with:
          go-version: "1.22"
`;
    install = `      - name: Download dependencies
        run: go mod download
`;
    checks = `      - name: Vet
        run: go vet ./...

      - name: Test
        run: go test -race ./...
`;
  } else if (info.languages.includes("rust")) {
    setup = `      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
`;
    install = "";
    checks = `      - name: Check
        run: cargo clippy --all-targets -- -D warnings

      - name: Test
        run: cargo test --all
`;
  } else {
    install = `      - name: Install dependencies
        run: echo "Replace with your install command"
`;
    checks = `      - name: Test
        run: echo "Replace with your test command"
`;
  }

  steps.push(setup.trimEnd(), install.trimEnd(), checks.trimEnd());
  return `name: CI

on:
  push:
    branches: [${info.defaultBranch}]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  test:
    name: Test (\${{ matrix.os }})
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest]
    steps:
      - name: Check out repository
        uses: actions/checkout@v4
        with:
          persist-credentials: false

${steps.filter(Boolean).join("\n\n")}
`;
}

export function selfScanWorkflow(): string {
  return `name: Repo Doctor

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Scan the repository
        run: npx repo-doctor@latest scan . --format markdown --fail-on high
`;
}

export function smokeTestTemplate(info: ProjectInfo): string {
  if (info.languages.includes("node")) {
    return `import test from "node:test";
import assert from "node:assert/strict";

// Replace this smoke test with real behaviour tests.
test("smoke: the package can be imported", async () => {
  assert.equal(typeof ${JSON.stringify(info.name)}, "string");
});
`;
  }
  if (info.languages.includes("python")) {
    return `def test_smoke() -> None:
    """Replace this smoke test with real behaviour tests."""
    assert True
`;
  }
  return `# Replace this smoke test with real behaviour tests.
`;
}

export function configTemplate(): string {
  return JSON.stringify(
    {
      $schema: "https://raw.githubusercontent.com/pooria683/repo-doctor/main/schema/repodoctorrc.schema.json",
      failOn: "high",
      ignore: ["dist/**", "coverage/**", "**/fixtures/**"],
      rules: {
        "ci/code-scanning-missing": "off",
      },
      weights: {
        security: 1.5,
        documentation: 1.2,
      },
      license: "MIT",
      copyrightHolder: "",
    },
    null,
    2,
  ) + "\n";
}

export function maintainersTemplate(info: ProjectInfo): string {
  const owner = info.owner ? `@${info.owner}` : "@your-github-handle";
  return `# Maintainers

| Person | Role | Areas | Contact |
| ------ | ---- | ----- | ------- |
| ${owner} | Maintainer | everything | open an issue |

## Decision making

Day-to-day changes are decided by the maintainer(s) through pull request
review. Significant design changes start as an issue so the discussion is
public and recorded.

## Becoming a maintainer

Contributors who land several substantial changes and review others' work
consistently are invited to become maintainers.
`;
}
