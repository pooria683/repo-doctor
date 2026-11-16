import { execFileSync } from "node:child_process";

import type { GitInfo } from "../types.js";

/** Run a git command in `cwd`; returns null on any failure (never throws). */
function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 15000,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

/** Convert `git@github.com:owner/repo.git` / HTTPS URLs into `owner/repo`. */
export function parseGitHubSlug(remoteUrl: string): string | undefined {
  const cleaned = remoteUrl.trim();
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
    /^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(cleaned);
    if (match) return `${match[1]}/${match[2]}`;
  }
  return undefined;
}

/**
 * Collect git facts without ever touching the network.
 * Falls back gracefully when the target is not a git checkout.
 */
export function readGitInfo(root: string): GitInfo {
  const inside = git(["rev-parse", "--is-inside-work-tree"], root);
  if (inside?.trim() !== "true") {
    return { isRepo: false, trackedFiles: [] };
  }

  const tracked = git(["ls-files", "-z"], root);
  const trackedFiles = tracked ? tracked.split("\0").filter((entry) => entry.length > 0) : [];

  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], root)?.trim() || undefined;
  const remote = git(["remote", "get-url", "origin"], root)?.trim() || undefined;
  const commitCountRaw = git(["rev-list", "--count", "HEAD"], root)?.trim();
  const commitCount = commitCountRaw && /^\d+$/.test(commitCountRaw) ? Number(commitCountRaw) : undefined;
  const untrackedRaw = git(["ls-files", "--others", "--exclude-standard", "-z"], root);
  const untrackedFiles = untrackedRaw ? untrackedRaw.split("\0").filter((entry) => entry.length > 0) : [];
  const statusRaw = git(["status", "--porcelain", "-z"], root);
  const dirtyFiles = statusRaw
    ? statusRaw
        .split("\0")
        .filter((entry) => entry.length > 3)
        .map((entry) => entry.slice(3))
    : [];

  return {
    isRepo: true,
    branch,
    remoteUrl: remote,
    slug: remote ? parseGitHubSlug(remote) : undefined,
    trackedFiles,
    untrackedFiles,
    commitCount,
    dirtyFiles,
  };
}
