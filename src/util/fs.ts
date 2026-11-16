import fs from "node:fs";
import path from "node:path";

import { matchAnyGlob } from "./glob.js";

/** Directories that are never worth walking. */
export const DEFAULT_IGNORED_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "vendor", // go/php vendors: huge, third-party
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".nox",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".nyc_output",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".parcel-cache",
  ".cache",
  ".idea",
  ".vscode-test",
  ".DS_Store",
  "Pods",
  ".terraform",
  ".gradle",
]);

/** Extensions treated as binary/uninteresting for content scanning. */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".tiff",
  ".pdf",
  ".zip",
  ".gz",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".jar",
  ".war",
  ".class",
  ".so",
  ".dylib",
  ".dll",
  ".exe",
  ".bin",
  ".o",
  ".a",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".wav",
  ".webm",
  ".sqlite",
  ".db",
  ".pyc",
  ".pyd",
  ".snap",
  ".wasm",
]);

export const MAX_FILE_BYTES = 512 * 1024;

export function toPosix(value: string): string {
  return value.split(path.sep).join("/").replace(/\\/g, "/");
}

/** True when the file name has an extension that should never be read as text. */
export function hasBinaryExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8000);
  for (let i = 0; i < limit; i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

export interface WalkOptions {
  maxFiles?: number;
  ignore?: string[];
  /** Extra directory names to skip (besides the defaults). */
  extraIgnoredDirs?: string[];
  /** Follow one level of symlinks? Off by default: symlink loops are a real risk. */
  followSymlinks?: boolean;
}

export interface WalkResult {
  files: string[];
  truncated: boolean;
  skippedLarge: number;
}

/**
 * Walk a directory and return relative POSIX paths.
 * Directories in `DEFAULT_IGNORED_DIRS` are skipped, as are hidden VCS folders.
 */
export function walkDirectory(root: string, options: WalkOptions = {}): WalkResult {
  const maxFiles = options.maxFiles ?? 5000;
  const ignore = options.ignore ?? [];
  const extraIgnored = new Set(options.extraIgnoredDirs ?? []);
  const { matcher } = createIgnoreMatcher(ignore);

  const files: string[] = [];
  let truncated = false;
  let skippedLarge = 0;

  const stack: string[] = ["."];
  while (stack.length > 0) {
    const relDir = stack.pop()!;
    const absDir = relDir === "." ? root : path.join(root, relDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = relDir === "." ? entry.name : `${relDir}/${entry.name}`;
      const posixRel = toPosix(rel);

      if (matcher(posixRel)) continue;

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entry.name) || extraIgnored.has(entry.name)) continue;
        stack.push(posixRel);
        continue;
      }
      if (entry.isSymbolicLink() && !options.followSymlinks) continue;
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      if (files.length >= maxFiles) {
        truncated = true;
        stack.length = 0;
        break;
      }
      if (hasBinaryExtension(posixRel)) {
        skippedLarge += 1;
        continue;
      }
      files.push(posixRel);
    }
  }

  files.sort();
  return { files, truncated, skippedLarge };
}

/** Compile ignore globs once and return a predicate. */
export function createIgnoreMatcher(patterns: string[]): { matcher: (relPath: string) => boolean } {
  if (patterns.length === 0) return { matcher: () => false };
  return { matcher: (relPath: string) => matchAnyGlob(patterns, relPath) };
}

export function isFileSync(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

export function isDirectorySync(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}

export interface SafeReadResult {
  content: string | null;
  reason?: "missing" | "binary" | "too-large" | "unreadable";
  bytes?: number;
}

/** Read a file as UTF-8, with hard limits. Never throws. */
export function safeRead(absPath: string, maxBytes = MAX_FILE_BYTES): SafeReadResult {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    return { content: null, reason: "missing" };
  }
  if (!stat.isFile()) return { content: null, reason: "missing" };
  if (stat.size > maxBytes) return { content: null, reason: "too-large", bytes: stat.size };
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(absPath);
  } catch {
    return { content: null, reason: "unreadable" };
  }
  if (isBinaryBuffer(buffer)) return { content: null, reason: "binary", bytes: stat.size };
  return { content: buffer.toString("utf8"), bytes: stat.size };
}

/** Read a small file as JSON. Returns null on any problem. */
export function readJsonSync<T = unknown>(absPath: string): T | null {
  const read = safeRead(absPath, 2 * 1024 * 1024);
  if (!read.content) return null;
  try {
    return JSON.parse(read.content) as T;
  } catch {
    return null;
  }
}

export function ensureDirSync(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFileSafe(absPath: string, content: string): void {
  ensureDirSync(path.dirname(absPath));
  fs.writeFileSync(absPath, content, "utf8");
}
