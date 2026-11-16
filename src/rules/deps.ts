import { DEPRECATED_PACKAGES, loadAdvisories, loadKnownVersions, type Advisory } from "../data/index.js";
import type { Ecosystem } from "../data/index.js";
import type { Finding, Rule, Severity } from "../types.js";
import { isExactVersion, isWildcardRange, parseRange, parseVersion, rangeIntersectsVulnerable, satisfies } from "../util/semver.js";
import { createFinder } from "./helpers.js";
import { LOCKFILES, collectDependencies, ecosystemManifestName, manifestFiles, type DeclaredDependency } from "./deps/parse.js";

/** Normalise non-npm operator spellings into something the semver module understands. */
export function normaliseRange(range: string, ecosystem: Ecosystem): string {
  let value = range.trim();
  if (value === "" || value === "*" || value === "latest") return "*";
  if (ecosystem === "pypi") {
    value = value.replace(/^===/, "=").replace(/^==/, "=").replace(/^~=/, "~");
  }
  if (ecosystem === "go" || ecosystem === "cargo") {
    value = value.replace(/^v/, "");
  }
  return value;
}

function downgrade(severity: Severity, steps = 1): Severity {
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  const index = order.indexOf(severity);
  return order[Math.min(order.length - 1, index + steps)]!;
}

function describe(dep: DeclaredDependency): string {
  return `${dep.name}@${dep.range}`;
}

const lockfileMissing: Rule = {
  id: "deps/lockfile-missing",
  title: "No lockfile for a declared dependency ecosystem",
  category: "dependencies",
  severity: "high",
  description: "Lockfiles pin the exact dependency tree so installs are reproducible and CI matches production.",
  tags: ["dependencies", "reproducibility"],
  run(ctx) {
    const create = createFinder(lockfileMissing);
    const ecosystems = new Set(collectDependencies(ctx).map((dep) => dep.ecosystem));
    if (ecosystems.size === 0) return [];

    const findings: Finding[] = [];
    for (const ecosystem of ecosystems) {
      const lockfiles = LOCKFILES[ecosystem] ?? [];
      const present = lockfiles.filter((file) => ctx.find([file, `**/${file}`]).length > 0);
      if (present.length > 0) continue;
      findings.push(
        create({
          file: ecosystemManifestName(ecosystem),
          message: `A ${ecosystem} manifest exists but no lockfile (${lockfiles.join(", ")}) was found.`,
          why: "Without a lockfile, every install can resolve different transitive versions: CI may pass while production fails, and a malicious patch release is pulled in silently.",
          suggestion: `Generate and commit ${lockfiles[0]} (or the lockfile for the package manager you actually use).`,
          meta: { ecosystem, expected: lockfiles },
        }),
      );
    }
    return findings;
  },
};

const multipleLockfiles: Rule = {
  id: "deps/multiple-lockfiles",
  title: "Several lockfiles for the same ecosystem",
  category: "dependencies",
  severity: "medium",
  description: "Two lockfiles for one ecosystem means two install paths and two dependency trees that drift apart.",
  tags: ["dependencies", "hygiene"],
  run(ctx) {
    const create = createFinder(multipleLockfiles);
    const findings: Finding[] = [];
    for (const [ecosystem, lockfiles] of Object.entries(LOCKFILES) as Array<[Ecosystem, string[]]>) {
      const present = lockfiles.filter((file) => ctx.exists(file));
      if (present.length < 2) continue;
      findings.push(
        create({
          file: present[0],
          message: `${present.length} ${ecosystem} lockfiles found: ${present.join(", ")}.`,
          why: "Different contributors and CI jobs will each resolve dependencies from a different tree, producing 'works on my machine' bugs and duplicate vulnerability surface.",
          suggestion: `Pick one package manager, delete the other lockfiles, and document the choice in CONTRIBUTING.md (or use corepack to pin it).`,
          meta: { ecosystem, lockfiles: present },
        }),
      );
    }
    return findings;
  },
};

const vulnerableDependency: Rule = {
  id: "deps/vulnerable-dependency",
  title: "Dependency range includes a known-vulnerable version",
  category: "dependencies",
  severity: "high",
  description: "A declared dependency can resolve to a version with a published advisory in the bundled snapshot.",
  tags: ["dependencies", "security"],
  run(ctx) {
    const create = createFinder(vulnerableDependency);
    const { advisories, meta } = loadAdvisories();
    const deps = collectDependencies(ctx);
    if (deps.length === 0) return [];

    const findings: Finding[] = [];
    const seen = new Set<string>();

    const byPackage = new Map<string, Advisory[]>();
    for (const advisory of advisories) {
      const key = `${advisory.ecosystem}:${advisory.package}`;
      const list = byPackage.get(key) ?? [];
      list.push(advisory);
      byPackage.set(key, list);
    }

    for (const dep of deps) {
      const candidates = byPackage.get(`${dep.ecosystem}:${dep.name}`);
      if (!candidates) continue;
      const range = normaliseRange(dep.range, dep.ecosystem);

      for (const advisory of candidates) {
        const dedupe = `${dep.file}:${dep.name}:${advisory.id}`;
        if (seen.has(dedupe)) continue;
        if (!isWildcardRange(range)) {
          const { result, vulnerableFloor } = rangeIntersectsVulnerable(range, advisory.vulnerableRange);
          if (result === "no") continue;
          seen.add(dedupe);
          const severity = result === "yes" ? advisory.severity : downgrade(advisory.severity);
          findings.push(
            create({
              severity: dep.dev ? downgrade(severity) : severity,
              file: dep.file,
              line: dep.line,
              title: `${advisory.title} in ${dep.name}`,
              message:
                result === "yes"
                  ? `${describe(dep)} is inside the vulnerable range ${advisory.vulnerableRange}. Fixed in ${advisory.fixedVersion}.`
                  : `${describe(dep)} can resolve to vulnerable versions ${advisory.vulnerableRange}; your lockfile decides whether you are exposed. Fixed in ${advisory.fixedVersion}.`,
              evidence: `${advisory.id}${advisory.cve ? ` / ${advisory.cve}` : ""} — ${advisory.summary}`,
              why: advisory.summary,
              suggestion: `Upgrade ${dep.name} to ${advisory.fixedVersion} or later${result === "maybe" ? ", or verify your lockfile resolves above the vulnerable range" : ""}. Run the installer afterwards and commit the lockfile.`,
              docsUrl: advisory.url,
              meta: {
                advisory: advisory.id,
                cve: advisory.cve ?? null,
                ecosystem: dep.ecosystem,
                package: dep.name,
                declaredRange: dep.range,
                vulnerableRange: advisory.vulnerableRange,
                fixedVersion: advisory.fixedVersion,
                vulnerableFloor,
                confidence: result,
                dev: dep.dev,
                snapshot: meta.version,
              },
            }),
          );
        }
      }
    }
    return findings.slice(0, 40);
  },
};

const deprecatedDependency: Rule = {
  id: "deps/deprecated-dependency",
  title: "Deprecated dependency",
  category: "dependencies",
  severity: "medium",
  description: "The package is unmaintained; security fixes and compatibility updates will not ship.",
  tags: ["dependencies", "maintenance"],
  run(ctx) {
    const create = createFinder(deprecatedDependency);
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const dep of collectDependencies(ctx)) {
      const known = DEPRECATED_PACKAGES[dep.name];
      if (!known || known.ecosystem !== dep.ecosystem) continue;
      const key = `${dep.ecosystem}:${dep.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(
        create({
          file: dep.file,
          line: dep.line,
          message: `${dep.name} is deprecated or unmaintained.`,
          why: "Deprecated packages keep resolving, but they no longer receive security patches and often break on new runtime versions.",
          suggestion: `Migrate to ${known.replacement}.`,
          meta: { ecosystem: dep.ecosystem, package: dep.name, replacement: known.replacement },
        }),
      );
    }
    return findings;
  },
};

const wildcardVersion: Rule = {
  id: "deps/wildcard-version",
  title: "Wildcard dependency version",
  category: "dependencies",
  severity: "medium",
  description: "`*` / `latest` accepts any future release, including breaking or malicious ones.",
  tags: ["dependencies", "reproducibility"],
  run(ctx) {
    const create = createFinder(wildcardVersion);
    const offenders = collectDependencies(ctx).filter((dep) => isWildcardRange(normaliseRange(dep.range, dep.ecosystem)) || dep.range === "latest");
    if (offenders.length === 0) return [];
    const names = [...new Set(offenders.map((dep) => dep.name))];
    return [
      create({
        file: offenders[0]!.file,
        line: offenders[0]!.line,
        message: `${names.length} dependency declaration(s) use a wildcard version: ${names.slice(0, 8).join(", ")}${names.length > 8 ? "…" : ""}.`,
        evidence: names.slice(0, 10).join(", "),
        why: "A wildcard range accepts every future release: installs stop being reproducible and a compromised or breaking release lands without review.",
        suggestion: "Declare a compatible range (`^1.4.0`) or an exact pin, and rely on the lockfile plus Dependabot for updates.",
        meta: { packages: names, count: names.length },
      }),
    ];
  },
};

const unpinnedPython: Rule = {
  id: "deps/unpinned-requirements",
  title: "requirements.txt is not pinned",
  category: "dependencies",
  severity: "low",
  description: "Python requirements without `==` pins (and without a lockfile) make deployments non-reproducible.",
  tags: ["dependencies", "reproducibility"],
  run(ctx) {
    const create = createFinder(unpinnedPython);
    const files = ctx.find(["requirements*.txt"]).filter((file) => !/(^|\/)(dev|test)/i.test(file));
    if (files.length === 0) return [];
    if (ctx.find(["poetry.lock", "Pipfile.lock", "uv.lock", "pdm.lock"]).length > 0) return [];
    const findings: Finding[] = [];
    for (const file of files) {
      const deps = collectDependencies(ctx).filter((dep) => dep.file === file);
      if (deps.length === 0) continue;
      const unpinned = deps.filter((dep) => !isExactVersion(dep.range.replace(/^==/, "")));
      if (unpinned.length === 0) continue;
      findings.push(
        create({
          file,
          message: `${unpinned.length} of ${deps.length} requirements in ${file} are not pinned to an exact version.`,
          evidence: unpinned.slice(0, 6).map((dep) => describe(dep)).join(", "),
          why: "Unpinned requirements resolve differently on every install, which is the classic cause of 'works in dev, fails in prod'.",
          suggestion: "Pin exact versions (`package==1.2.3`) and regenerate with pip-tools / uv / poetry so upgrades stay deliberate.",
          meta: { unpinned: unpinned.length, total: deps.length },
        }),
      );
    }
    return findings;
  },
};

const installScripts: Rule = {
  id: "deps/install-script",
  title: "Package runs a lifecycle install script",
  category: "dependencies",
  severity: "low",
  description: "`preinstall`/`install`/`postinstall` scripts execute arbitrary code whenever the package is installed.",
  requiresFile: ["package.json"],
  tags: ["dependencies", "supply-chain"],
  run(ctx) {
    const create = createFinder(installScripts);
    const scripts = ctx.pkg?.scripts ?? {};
    const lifecycle = ["preinstall", "install", "postinstall"].filter((name) => typeof scripts[name] === "string");
    if (lifecycle.length === 0) return [];
    const isLibrary = !ctx.pkg?.private;
    return [
      create({
        severity: isLibrary ? "medium" : "low",
        file: "package.json",
        message: `Lifecycle scripts present: ${lifecycle.join(", ")}.`,
        evidence: lifecycle.map((name) => `${name}: ${scripts[name]}`).join(" | ").slice(0, 200),
        why: isLibrary
          ? "Install scripts run on every consumer's machine with their permissions. Many CI setups and corporate registries now block them, and reviewers cannot see what they do from the diff."
          : "Install scripts run arbitrary code at install time; they are a favourite supply-chain attack vector and slow down installs.",
        suggestion: "Prefer explicit build steps (`prepare`, `build`) over install hooks, or document why the hook is required. Consider `npm ci --ignore-scripts` in CI.",
        meta: { scripts: lifecycle },
      }),
    ];
  },
};

const enginesMissing: Rule = {
  id: "deps/engines-missing",
  title: "package.json does not declare supported engines",
  category: "dependencies",
  severity: "low",
  description: "An `engines` field documents which Node.js versions are supported and lets tooling warn early.",
  requiresFile: ["package.json"],
  tags: ["dependencies", "packaging"],
  run(ctx) {
    const create = createFinder(enginesMissing);
    if (!ctx.pkg || ctx.pkg.engines) return [];
    return [
      create({
        file: "package.json",
        message: 'No "engines" field in package.json.',
        why: "Without it, users on unsupported runtimes get confusing syntax or API errors instead of a clear message, and CI matrices are guesswork.",
        suggestion: 'Add `"engines": { "node": ">=20" }` (or your real minimum) and mirror it in the CI matrix.',
      }),
    ];
  },
};

const outdatedMajor: Rule = {
  id: "deps/outdated-major",
  title: "Dependency is several major versions behind",
  category: "dependencies",
  severity: "low",
  description: "The declared range cannot reach the current major release in the bundled version snapshot.",
  tags: ["dependencies", "maintenance"],
  run(ctx) {
    const create = createFinder(outdatedMajor);
    const known = loadKnownVersions();
    const findings: Finding[] = [];

    for (const dep of collectDependencies(ctx)) {
      const latest = known.packages[dep.name]?.[dep.ecosystem];
      if (!latest) continue;
      const range = normaliseRange(dep.range, dep.ecosystem);
      if (isWildcardRange(range)) continue;
      if (satisfies(latest, range)) continue;

      const sets = parseRange(range);
      const lowestAllowed = sets
        .map((set) => set.find((comparator) => comparator.op === ">=" || comparator.op === "=")?.version)
        .filter((version): version is NonNullable<typeof version> => Boolean(version))
        .sort((a, b) => a.major - b.major)[0];
      const latestParsed = parseVersion(latest);
      if (!lowestAllowed || !latestParsed) continue;
      const majorsBehind = latestParsed.major - lowestAllowed.major;
      if (majorsBehind < 1) continue;

      findings.push(
        create({
          severity: majorsBehind >= 2 ? "medium" : "low",
          file: dep.file,
          line: dep.line,
          message: `${dep.name}@${dep.range} cannot resolve to the current major (${latest}); ${majorsBehind} major version(s) behind.`,
          why: "Old majors stop receiving fixes and accumulate known advisories, and the eventual upgrade gets more expensive the longer it waits.",
          suggestion: `Plan an upgrade to ${dep.name}@${latest.split(".")[0]} and check the upstream migration guide.`,
          meta: { package: dep.name, declaredRange: dep.range, latest, majorsBehind, snapshot: known.meta.version },
        }),
      );
    }
    return findings.slice(0, 15);
  },
};

const noneDetected: Rule = {
  id: "deps/none-detected",
  title: "No dependency manifest detected",
  category: "dependencies",
  severity: "info",
  description: "Repo Doctor inspects package.json, requirements.txt, pyproject.toml, Cargo.toml, go.mod, Gemfile and composer.json.",
  tags: ["dependencies"],
  run(ctx) {
    const create = createFinder(noneDetected);
    if (manifestFiles(ctx).length > 0) return [];
    if (ctx.files.length < 3) return [];
    return [
      create({
        message: "No supported dependency manifest was found, so dependency checks were skipped.",
        why: "Dependency advisories, lockfile and pinning checks all depend on a manifest. Unsupported ecosystems are not analyzed.",
        suggestion: "If this repository does use a package manager, open an issue so the ecosystem can be added.",
      }),
    ];
  },
};

export const dependencyRules: Rule[] = [
  lockfileMissing,
  multipleLockfiles,
  vulnerableDependency,
  deprecatedDependency,
  wildcardVersion,
  unpinnedPython,
  installScripts,
  enginesMissing,
  outdatedMajor,
  noneDetected,
];

/** Exposed for tests. */
export const __testing = { downgrade, manifestFiles };
