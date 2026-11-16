import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveConfig } from "../src/core/config.js";
import { runScan, type ScanOutcome } from "../src/core/engine.js";
import type { RepoDoctorConfig, Rule } from "../src/types.js";

export interface Fixture {
  root: string;
  cleanup: () => void;
}

/** Create a throwaway directory populated with the given files. */
export function makeFixture(files: Record<string, string>): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "repo-doctor-test-"));
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content, "utf8");
  }
  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export interface ScanFixtureOptions {
  config?: RepoDoctorConfig;
  rules?: Rule[];
  files?: string[];
}

/** Scan a fixture with a fixed clock so results are comparable. */
export async function scanFixture(root: string, options: ScanFixtureOptions = {}): Promise<ScanOutcome> {
  const config = resolveConfig({ includeInfo: true, failOn: "never", ...options.config });
  return runScan({
    root,
    config,
    rules: options.rules,
    files: options.files,
    displayPath: "fixture",
    now: () => new Date("2025-01-01T00:00:00.000Z"),
  });
}

export function findRule(rules: Rule[], id: string): Rule {
  const rule = rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`Rule ${id} not found`);
  return rule;
}

/** A repository that should pass every documentation check. */
export const HEALTHY_DOCS: Record<string, string> = {
  "README.md": `# project

A tool that does a thing. Install with npm, use it with the documented API.

## Installation

\`\`\`bash
npm install project
\`\`\`

## Usage

\`\`\`js
import project from "project";
project();
\`\`\`

## Contributing

See CONTRIBUTING.md. Look for the \`good first issue\` label.

## Configuration

| Option | Default | Description |
| ------ | ------- | ----------- |
| --verbose | false | Print every finding instead of only the first few per severity. |
| --fail-on | high | Exit with code 1 when a finding at or above this severity exists. |

## Support

Open an issue for bugs and questions. Security reports go through SECURITY.md
so they stay private until a fix ships. Pull requests are reviewed within about
a week, and the maintainers are happy to pair on a first contribution.

## License

MIT © 2025 Example
`,
  LICENSE: "MIT License\n\nCopyright (c) 2025 Example\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...",
  "CONTRIBUTING.md": "# Contributing\n\nSetup, tests, pull requests and the good first issue label.\n",
  "CODE_OF_CONDUCT.md": "# Contributor Covenant Code of Conduct\n\nBe excellent to each other.\n",
  "SECURITY.md": "# Security Policy\n\nReport privately.\n",
  "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "## Checklist\n\n- [ ] Tests\n",
  ".github/ISSUE_TEMPLATE/bug_report.yml": "name: Bug report\ndescription: Something is broken\n",
};
