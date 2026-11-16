import type { Rule } from "../types.js";
import { createFinder } from "./helpers.js";

const GOOD_FIRST_ISSUE_RE = /good[ -]first[ -]issue/i;

const goodFirstIssueLabelMissing: Rule = {
  id: "community/good-first-issue-label-missing",
  title: "No good-first-issue path for new contributors",
  category: "community",
  severity: "low",
  description: "Labeling small, well-scoped tasks as `good first issue` is the most effective way to attract first-time contributors.",
  tags: ["community", "onboarding"],
  run(ctx) {
    const create = createFinder(goodFirstIssueLabelMissing);
    const contributing = ctx.firstExisting(["CONTRIBUTING.md", ".github/CONTRIBUTING.md", "docs/CONTRIBUTING.md", "CONTRIBUTING.rst"]);
    const readme = ctx.firstExisting(["README.md", "README.rst", "README"]);
    const hints = [contributing, readme].filter((file): file is string => Boolean(file));
    const labelConfig = ctx.find([".github/labels.yml", ".github/labels.yaml", ".github/labeler.yml", "docs/labels.md"]);

    const mentions = hints.some((file) => GOOD_FIRST_ISSUE_RE.test(ctx.readFile(file) ?? ""));
    const configMentions = labelConfig.some((file) => GOOD_FIRST_ISSUE_RE.test(ctx.readFile(file) ?? ""));

    if (mentions || configMentions) return [];
    if (!contributing && !readme) return []; // already reported by docs rules
    return [
      create({
        file: contributing ?? readme,
        message: "Neither CONTRIBUTING nor the README mentions a `good first issue` label or onboarding path.",
        why: "New contributors rarely guess which tasks are safe to start with. Projects that label small issues get measurably more first-time pull requests.",
        suggestion: "Label 3–5 well-scoped tasks `good first issue`, document the label in CONTRIBUTING.md, and list the labels you use in .github/labels.yml.",
      }),
    ];
  },
};

const codeownersMissing: Rule = {
  id: "community/codeowners-missing",
  title: "No CODEOWNERS file",
  category: "community",
  severity: "low",
  description: "CODEOWNERS routes review requests automatically and documents who owns which area.",
  tags: ["community", "maintenance"],
  run(ctx) {
    const create = createFinder(codeownersMissing);
    if (ctx.exists(".github/CODEOWNERS") || ctx.exists("CODEOWNERS") || ctx.exists("docs/CODEOWNERS")) return [];
    if (ctx.files.length < 5) return [];
    return [
      create({
        message: "No CODEOWNERS file was found.",
        why: "Without ownership, review requests land in a void and it is unclear who must approve a change in a sensitive area.",
        suggestion: "Add .github/CODEOWNERS mapping paths to maintainers, e.g. `/src/security/ @your-handle`.",
        fix: {
          id: "add-codeowners",
          kind: "create-file",
          path: ".github/CODEOWNERS",
          description: "Add a CODEOWNERS file with a maintainer placeholder (needs editing).",
          safe: true,
        },
      }),
    ];
  },
};

const fundingMissing: Rule = {
  id: "community/funding-missing",
  title: "No funding configuration",
  category: "community",
  severity: "info",
  description: "A FUNDING.yml surfaces a Sponsor button on the repository.",
  tags: ["community", "sustainability"],
  run(ctx) {
    const create = createFinder(fundingMissing);
    if (ctx.exists(".github/FUNDING.yml") || ctx.exists(".github/FUNDING.yaml")) return [];
    if (ctx.files.length < 5) return [];
    return [
      create({
        message: "No .github/FUNDING.yml found.",
        why: "Sustainable maintenance needs funding, and a Sponsor button is the lowest-friction way for users to contribute back.",
        suggestion: "Add .github/FUNDING.yml with GitHub Sponsors, Open Collective or a custom URL — only if you actually accept funding.",
      }),
    ];
  },
};

const governanceMissing: Rule = {
  id: "community/governance-missing",
  title: "No maintainer or governance information",
  category: "community",
  severity: "info",
  description: "Documenting who maintains the project and how decisions are made builds trust for adopters.",
  tags: ["community", "governance"],
  run(ctx) {
    const create = createFinder(governanceMissing);
    const candidates = ["MAINTAINERS.md", "AUTHORS.md", "AUTHORS", "GOVERNANCE.md", "CONTRIBUTORS.md", ".github/GOVERNANCE.md", "docs/MAINTAINERS.md"];
    if (candidates.some((file) => ctx.exists(file))) return [];
    if (ctx.files.length < 8) return [];
    return [
      create({
        message: "No MAINTAINERS / GOVERNANCE / AUTHORS document was found.",
        why: "Adopters want to know whether a project is a one-person effort and how decisions are made before they depend on it.",
        suggestion: "Add MAINTAINERS.md listing who is responsible for what, and a short decision-making section (or GOVERNANCE.md) for larger projects.",
      }),
    ];
  },
};

const issueTriageMissing: Rule = {
  id: "community/issue-triage-missing",
  title: "No automation for new issues and pull requests",
  category: "community",
  severity: "info",
  description: "Auto-labeling and welcome bots keep the queue manageable as the project grows.",
  tags: ["community", "automation"],
  run(ctx) {
    const create = createFinder(issueTriageMissing);
    if (ctx.exists(".github/labeler.yml") || ctx.exists(".github/labeler.yaml")) return [];
    if (ctx.find([".github/workflows/*.yml", ".github/workflows/*.yaml"]).length === 0) return [];
    const workflows = ctx.find([".github/workflows/*.yml", ".github/workflows/*.yaml"]);
    const hasTriage = workflows.some((file) => /actions\/labeler|first-interaction|stale-action|welcome/i.test(ctx.readFile(file, 128 * 1024) ?? ""));
    if (hasTriage) return [];
    return [
      create({
        message: "CI exists but there is no issue/PR triage automation.",
        why: "Manual triage does not scale: unlabeled issues get lost, and first-time contributors wait days for a response.",
        suggestion: "Add actions/labeler with .github/labeler.yml, a first-interaction greeting, and optionally a stale bot.",
      }),
    ];
  },
};

export const communityRules: Rule[] = [
  goodFirstIssueLabelMissing,
  codeownersMissing,
  fundingMissing,
  governanceMissing,
  issueTriageMissing,
];
