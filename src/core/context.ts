import path from "node:path";

import type { PackageJson, ResolvedConfig, RuleContext } from "../types.js";
import { isDirectorySync, isFileSync, readJsonSync, safeRead, walkDirectory } from "../util/fs.js";
import { readGitInfo } from "../util/git.js";
import { matchAnyGlob } from "../util/glob.js";
import { numberedLines } from "../util/text.js";

export interface BuildContextOptions {
  /** Pre-computed file list (used by tests and by `report --from`). */
  files?: string[];
  maxFiles?: number;
}

export interface BuiltContext {
  ctx: RuleContext;
  warnings: string[];
}

/**
 * Build the read-only view of a repository that rules operate on.
 * Everything is computed once and cached: rules are cheap, I/O is not.
 */
export function buildContext(root: string, config: ResolvedConfig, options: BuildContextOptions = {}): BuiltContext {
  const warnings: string[] = [];

  let files = options.files;
  if (!files) {
    const walked = walkDirectory(root, {
      maxFiles: options.maxFiles ?? config.maxFiles,
      ignore: config.ignore,
    });
    files = walked.files;
    if (walked.truncated) {
      warnings.push(
        `File limit reached (${options.maxFiles ?? config.maxFiles} files). Some checks may be incomplete; adjust "maxFiles" in config.`,
      );
    }
  }

  const git = readGitInfo(root);
  // Untracked + gitignored content still matters for security checks, but only
  // tracked files can be "committed secrets". Mark them explicitly.
  const untrackedFiles = git.untrackedFiles ?? [];
  const fileIndex = new Map<string, string>();
  for (const file of files) fileIndex.set(file.toLowerCase(), file);

  const readCache = new Map<string, string | null>();
  const linesCache = new Map<string, Array<{ number: number; text: string }>>();

  const readFile = (relPath: string, maxBytes?: number): string | null => {
    const key = `${relPath}::${maxBytes ?? "default"}`;
    if (readCache.has(key)) return readCache.get(key) ?? null;
    const result = safeRead(path.join(root, relPath), maxBytes);
    readCache.set(key, result.content);
    return result.content;
  };

  const ctx: RuleContext = {
    root,
    files,
    fileIndex,
    exists: (relPath) => {
      const normalised = relPath.replace(/^\.\//, "").replace(/\/$/, "");
      if (fileIndex.has(normalised.toLowerCase())) return true;
      if (untrackedFiles.some((file) => file.toLowerCase() === normalised.toLowerCase())) return false;
      return isFileSync(path.join(root, normalised)) || isDirectorySync(path.join(root, normalised));
    },
    readFile,
    find: (patterns) => {
      const list = Array.isArray(patterns) ? patterns : [patterns];
      return files.filter((file) => matchAnyGlob(list, file));
    },
    firstExisting: (candidates) => {
      for (const candidate of candidates) {
        if (ctx.exists(candidate)) return candidate;
      }
      return undefined;
    },
    pkg: readJsonSync<PackageJson>(path.join(root, "package.json")),
    git: { ...git, untrackedFiles, dirtyFiles: git.dirtyFiles ?? [] } as RuleContext["git"],
    config,
    lines: (relPath, maxBytes) => {
      const key = `${relPath}::${maxBytes ?? "default"}`;
      const cached = linesCache.get(key);
      if (cached) return cached;
      const content = readFile(relPath, maxBytes);
      const lines = content === null ? [] : numberedLines(content);
      linesCache.set(key, lines);
      return lines;
    },
  };

  return { ctx, warnings };
}

/** All paths that git knows about (tracked) as a Set, lower-cased for lookups. */
export function trackedSet(ctx: RuleContext): Set<string> {
  return new Set((ctx.git.trackedFiles ?? []).map((file) => file.toLowerCase()));
}

/** True when the file exists on disk but is not tracked by git. */
export function isUntracked(ctx: RuleContext, relPath: string): boolean {
  const tracked = trackedSet(ctx);
  return !tracked.has(relPath.toLowerCase());
}
