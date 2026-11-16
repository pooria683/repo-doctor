import fs from "node:fs";
import path from "node:path";

/** Colored output helpers with NO_COLOR / --no-color support. */

export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== "0";
  return Boolean(process.stdout.isTTY);
}

export function paint(text: string, ...codes: string[]): string {
  if (!supportsColor()) return text;
  return `${codes.join("")}${text}\u001b[0m`;
}

export const style = {
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

export function print(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : text + "\n");
}

export function printError(text: string): void {
  process.stderr.write(paint(text, style.red) + "\n");
}

export function printWarn(text: string): void {
  process.stderr.write(paint(text, style.yellow) + "\n");
}

/** Write to a file, creating parent directories. Returns the absolute path. */
export function writeOutput(target: string, content: string, cwd = process.cwd()): string {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content, "utf8");
  return absolute;
}

export function readInput(target: string, cwd = process.cwd()): string {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  return fs.readFileSync(absolute, "utf8");
}

export function existsRelative(target: string, cwd = process.cwd()): boolean {
  const absolute = path.isAbsolute(target) ? target : path.resolve(cwd, target);
  return fs.existsSync(absolute);
}
