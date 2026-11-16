import crypto from "node:crypto";

/** Split text into lines, normalising CRLF. */
export function splitLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** 1-based numbered lines, skipping files that are obviously too big. */
export function numberedLines(text: string, maxLines = 20000): Array<{ number: number; text: string }> {
  const lines = splitLines(text);
  const limit = Math.min(lines.length, maxLines);
  const out: Array<{ number: number; text: string }> = new Array(limit);
  for (let i = 0; i < limit; i++) out[i] = { number: i + 1, text: lines[i]! };
  return out;
}

export function truncate(value: string, max = 160): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

/**
 * Produce a stable, non-reversible fingerprint of a secret.
 * The raw value NEVER leaves this function.
 */
export function fingerprint(secret: string): string {
  const hash = crypto.createHash("sha256").update(secret).digest("hex").slice(0, 8);
  return `sha256:${hash}`;
}

/**
 * Mask a detected secret so it can be shown in reports safely:
 * keeps a short shape hint (prefix letters) plus length and hash.
 */
export function maskSecret(secret: string, visiblePrefix = 4): string {
  const prefix = secret.slice(0, Math.min(visiblePrefix, secret.length));
  return `${prefix}${"*".repeat(Math.min(12, Math.max(3, secret.length - prefix.length)))} (${secret.length} chars, ${fingerprint(secret)})`;
}

/** Normalise whitespace and strip markdown emphasis for loose keyword matching. */
export function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Shannon entropy in bits per character; used to catch random-looking strings. */
export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

export function countMatches(text: string, pattern: RegExp): number {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let count = 0;
  while (global.exec(text) !== null) {
    count += 1;
    if (count > 10000) break; // safety valve against zero-width matches
  }
  return count;
}

/** Pluralise a simple noun: 1 file / 2 files. */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`);
}

/** Basic Levenshtein distance, used for "did you mean" style licence detection. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const current = new Array<number>(b.length + 1);
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}
