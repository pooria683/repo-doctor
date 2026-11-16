import type { Finding, Rule, RuleContext } from "../types.js";
import { maskSecret } from "../util/text.js";
import { createFinder } from "./helpers.js";

const DOCKERFILE_GLOBS = ["Dockerfile", "Dockerfile.*", "*.Dockerfile", "*.dockerfile", "Containerfile", "docker/**/Dockerfile", "docker/Dockerfile*"];
const COMPOSE_GLOBS = ["docker-compose.yml", "docker-compose.yaml", "docker-compose.*.yml", "docker-compose.*.yaml", "compose.yml", "compose.yaml", "**/docker-compose.yml"];

function dockerfiles(ctx: RuleContext): string[] {
  // `find` uses glob matching over the walked file list; dedupe here.
  return [...new Set(ctx.find(DOCKERFILE_GLOBS))];
}

const SECRET_ENV_RE = /^\s*(ENV|ARG)\s+([A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|CREDENTIAL)[A-Za-z0-9_]*)[=\s]+(.+)$/i;

const dockerfileRoot: Rule = {
  id: "containers/dockerfile-root-user",
  title: "Container runs as root",
  category: "containers",
  severity: "high",
  description: "Images should create or switch to a non-root user before the entrypoint.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "security"],
  run(ctx) {
    const create = createFinder(dockerfileRoot);
    const findings: Finding[] = [];
    for (const file of dockerfiles(ctx)) {
      const lines = ctx.lines(file);
      const userLines = lines.filter((line) => /^\s*USER\s+/i.test(line.text));
      const lastUser = userLines[userLines.length - 1];
      if (!lastUser) {
        findings.push(
          create({
            file,
            message: `${file} never sets USER, so the container process runs as root.`,
            why: "A root process inside the container that escapes (bind-mount, kernel bug, mounted socket) is root on the host. Root also makes accidental file ownership changes on volumes much more likely.",
            suggestion: "Create an unprivileged user (`RUN adduser --system app`) and switch with `USER app` before CMD/ENTRYPOINT.",
            meta: { cause: "missing-user" },
          }),
        );
        continue;
      }
      const value = /^\s*USER\s+(\S+)/i.exec(lastUser.text)?.[1] ?? "";
      if (/^(root|0)(:0)?$/i.test(value.trim())) {
        findings.push(
          create({
            file,
            line: lastUser.number,
            message: `${file} explicitly runs as root (USER ${value.trim()}).`,
            evidence: lastUser.text.trim(),
            why: "Root in a container removes most of the isolation the container was supposed to provide.",
            suggestion: "Switch to a numeric non-root UID/GID (e.g. `USER 10001:10001`) so Kubernetes `runAsNonRoot` policies can verify it.",
            meta: { cause: "user-root" },
          }),
        );
      }
    }
    return findings;
  },
};

const dockerfileLatestTag: Rule = {
  id: "containers/dockerfile-unpinned-base",
  title: "Base image is unpinned or uses :latest",
  category: "containers",
  severity: "medium",
  description: "Pin base images to an explicit version (and ideally a digest) so builds are reproducible.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "supply-chain"],
  run(ctx) {
    const create = createFinder(dockerfileLatestTag);
    const findings: Finding[] = [];
    for (const file of dockerfiles(ctx)) {
      for (const line of ctx.lines(file)) {
        const match = /^\s*FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line.text);
        if (!match) continue;
        const image = match[1]!;
        if (image.toLowerCase() === "scratch" || image.startsWith("$")) continue;
        const hasDigest = image.includes("@sha256:");
        const tagPart = image.includes(":") && !image.startsWith("localhost") ? image.slice(image.lastIndexOf(":")) : "";
        if (hasDigest) continue;
        if (tagPart === "" || /^:latest$/i.test(tagPart)) {
          findings.push(
            create({
              file,
              line: line.number,
              message: `Base image "${image}" has no explicit version${tagPart === ":latest" ? " (:latest)" : ""}.`,
              evidence: line.text.trim(),
              why: "An unpinned base image means two builds of the same commit can contain different operating-system packages, and a compromised upstream tag silently ships in your release.",
              suggestion: "Pin to a version tag (`node:22.11-bookworm-slim`) and optionally a digest (image@sha256:...), updating it deliberately.",
            }),
          );
        }
      }
    }
    return findings;
  },
};

const dockerfileCurlPipe: Rule = {
  id: "containers/dockerfile-curl-pipe-shell",
  title: "Remote script piped into a shell during build",
  category: "containers",
  severity: "high",
  description: "`curl … | sh` executes unverified remote code at build time and defeats reproducibility.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "security"],
  run(ctx) {
    const create = createFinder(dockerfileCurlPipe);
    const findings: Finding[] = [];
    const pattern = /\b(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/i;
    for (const file of dockerfiles(ctx)) {
      for (const line of ctx.lines(file)) {
        if (!pattern.test(line.text)) continue;
        findings.push(
          create({
            file,
            line: line.number,
            message: `Build step pipes a downloaded script straight into a shell.`,
            evidence: line.text.trim().slice(0, 160),
            why: "The remote server can serve different (or malicious) content on every build, and there is no checksum to verify what actually ran.",
            suggestion: "Download the installer, verify its checksum or signature, then execute it — or install from your distribution's package manager.",
          }),
        );
      }
    }
    return findings;
  },
};

const dockerfileSecretEnv: Rule = {
  id: "containers/dockerfile-secret-in-env",
  title: "Secret baked into the image via ENV/ARG",
  category: "containers",
  severity: "critical",
  description: "Values in ENV and ARG are stored in image metadata (or build history) and are readable by anyone who pulls the image.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "secrets"],
  run(ctx) {
    const create = createFinder(dockerfileSecretEnv);
    const findings: Finding[] = [];
    for (const file of dockerfiles(ctx)) {
      for (const line of ctx.lines(file)) {
        const match = SECRET_ENV_RE.exec(line.text);
        if (!match) continue;
        const value = match[3]!.trim().replace(/^["']|["']$/g, "");
        // A reference to a build arg or runtime env is fine; a literal is not.
        if (/^\$\{?[A-Za-z0-9_]+\}?$/.test(value) || value.startsWith("$")) continue;
        if (value.length === 0) continue;
        const isLiteral = !/^(changeme|placeholder|example|xxx|\*+)/i.test(value);
        findings.push(
          create({
            severity: isLiteral && value.length >= 8 ? "critical" : "medium",
            file,
            line: line.number,
            message: `${match[1]!.toUpperCase()} ${match[2]!} appears to contain a literal secret.`,
            evidence: `${match[2]!}=${maskSecret(value, 2)}`,
            why: "ENV values are visible in `docker inspect` and ARG values are recorded in image history; neither is a secret store.",
            suggestion: "Pass secrets at runtime (env vars from your orchestrator, mounted files) or use BuildKit `RUN --mount=type=secret` for build-time credentials.",
          }),
        );
      }
    }
    return findings;
  },
};

const dockerfileAddRemote: Rule = {
  id: "containers/dockerfile-add-remote",
  title: "ADD fetches a remote URL",
  category: "containers",
  severity: "medium",
  description: "`ADD <url>` downloads without integrity checks and silently extracts archives. Prefer COPY + verified download.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "security"],
  run(ctx) {
    const create = createFinder(dockerfileAddRemote);
    const findings: Finding[] = [];
    for (const file of dockerfiles(ctx)) {
      for (const line of ctx.lines(file)) {
        const match = /^\s*ADD\s+(?:--\S+\s+)*(\S+)/i.exec(line.text);
        if (!match) continue;
        if (!/^https?:\/\//i.test(match[1]!)) continue;
        findings.push(
          create({
            file,
            line: line.number,
            message: "ADD downloads a remote file during the build.",
            evidence: line.text.trim().slice(0, 160),
            why: "ADD cannot verify checksums, follows redirects, and auto-extracts archives — three ways for unexpected content to enter the image.",
            suggestion: "Use `ADD` only for local files. For downloads use `RUN curl -fsSL -o file <url> && echo \"<sha256>  file\" | sha256sum -c - && ...`.",
          }),
        );
      }
    }
    return findings;
  },
};

const dockerfileAptCleanup: Rule = {
  id: "containers/dockerfile-apt-cleanup",
  title: "Package install leaves caches in the image layer",
  category: "containers",
  severity: "low",
  description: "Install and clean up in the same RUN layer, and use --no-install-recommends.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "performance"],
  run(ctx) {
    const create = createFinder(dockerfileAptCleanup);
    const findings: Finding[] = [];
    for (const file of dockerfiles(ctx)) {
      for (const line of ctx.lines(file)) {
        if (!/^\s*RUN\b/i.test(line.text)) continue;
        const installsApt = /\bapt-get\s+install\b/.test(line.text);
        if (!installsApt) continue;
        const cleansUp = /rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(line.text) || /apt-get\s+clean/.test(line.text);
        const noRecommends = /--no-install-recommends/.test(line.text);
        if (cleansUp && noRecommends) continue;
        const problems: string[] = [];
        if (!noRecommends) problems.push("no --no-install-recommends");
        if (!cleansUp) problems.push("apt lists not removed in the same layer");
        findings.push(
          create({
            file,
            line: line.number,
            message: `apt-get install is missing best practices: ${problems.join("; ")}.`,
            evidence: line.text.trim().slice(0, 160),
            why: "Every layer keeps its files: leaving package caches can add tens of megabytes, and recommended packages bloat the attack surface.",
            suggestion: "`RUN apt-get update && apt-get install -y --no-install-recommends <pkgs> && rm -rf /var/lib/apt/lists/*` in one layer.",
            meta: { problems },
          }),
        );
      }
    }
    return findings;
  },
};

const dockerignoreMissing: Rule = {
  id: "containers/dockerignore-missing",
  title: "No .dockerignore",
  category: "containers",
  severity: "medium",
  description: "Without .dockerignore the whole build context (including .git and .env files) is sent to the daemon and can be copied into the image.",
  requiresFile: DOCKERFILE_GLOBS,
  tags: ["containers", "security", "performance"],
  run(ctx) {
    const create = createFinder(dockerignoreMissing);
    const found = ctx.firstExisting([".dockerignore", "docker/.dockerignore"]);
    if (found) return [];
    return [
      create({
        message: "A Dockerfile exists but there is no .dockerignore.",
        why: "The build context includes .git history, node_modules and any .env file. `COPY . .` then bakes them into the image, and every build transfers them to the daemon.",
        suggestion: "Add .dockerignore covering .git, node_modules, .env*, dist, coverage and editor folders.",
        fix: {
          id: "add-dockerignore",
          kind: "create-file",
          path: ".dockerignore",
          description: "Add a .dockerignore that excludes VCS data, dependencies, secrets and build output.",
          safe: true,
        },
      }),
    ];
  },
};

const composePrivileged: Rule = {
  id: "containers/compose-privileged",
  title: "Compose service runs privileged or mounts the Docker socket",
  category: "containers",
  severity: "high",
  description: "`privileged: true` and /var/run/docker.sock mounts give a container effective control of the host.",
  requiresFile: COMPOSE_GLOBS,
  tags: ["containers", "security"],
  run(ctx) {
    const create = createFinder(composePrivileged);
    const findings: Finding[] = [];
    for (const file of ctx.find(COMPOSE_GLOBS)) {
      const lines = ctx.lines(file);
      for (const line of lines) {
        if (/^\s*privileged\s*:\s*true/i.test(line.text)) {
          findings.push(
            create({
              file,
              line: line.number,
              message: "Service runs with `privileged: true`.",
              evidence: line.text.trim(),
              why: "A privileged container has all capabilities and device access: escaping to the host requires no exploit.",
              suggestion: "Drop `privileged` and add only the specific `cap_add` entries (or `devices:`) the service needs.",
            }),
          );
        }
        if (/\/var\/run\/docker\.sock/.test(line.text)) {
          findings.push(
            create({
              file,
              line: line.number,
              message: "Docker socket is mounted into the container.",
              evidence: line.text.trim(),
              why: "Access to the Docker socket is root-equivalent on the host: the container can start a new privileged container.",
              suggestion: "Avoid mounting the socket; use a read-only proxy (docker-socket-proxy) or a dedicated build service.",
            }),
          );
        }
        if (/^\s*network_mode\s*:\s*['"]?host/i.test(line.text)) {
          findings.push(
            create({
              severity: "medium",
              file,
              line: line.number,
              message: "Service uses host networking.",
              evidence: line.text.trim(),
              why: "Host networking removes network isolation and lets the container bind any host port, including admin interfaces bound to localhost.",
              suggestion: "Publish only the ports you need with `ports:` instead of `network_mode: host`.",
            }),
          );
        }
      }
    }
    return findings;
  },
};

export const containerRules: Rule[] = [
  dockerfileRoot,
  dockerfileLatestTag,
  dockerfileCurlPipe,
  dockerfileSecretEnv,
  dockerfileAddRemote,
  dockerfileAptCleanup,
  dockerignoreMissing,
  composePrivileged,
];
