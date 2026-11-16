import fs from "node:fs";
import path from "node:path";

import {
  CATEGORIES,
  SEVERITIES,
  type Category,
  type RepoDoctorConfig,
  type ResolvedConfig,
  type RuleSetting,
  type Severity,
} from "../types.js";
import { readJsonSync, isFileSync } from "../util/fs.js";

export const CONFIG_FILE_NAMES = [".repodoctorrc.json", ".repodoctorrc", "repo-doctor.config.json"];

export const DEFAULT_WEIGHTS: Record<Category, number> = {
  security: 1.5,
  documentation: 1.2,
  dependencies: 1.2,
  quality: 1,
  containers: 1,
  ci: 1,
  community: 1,
};

export const DEFAULT_SENSITIVE_FILES = [
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.keystore",
  "*.jks",
  "id_rsa",
  "id_ed25519",
  "id_ecdsa",
  ".npmrc",
  ".pypirc",
  ".netrc",
  ".htpasswd",
  "credentials.json",
  "service-account*.json",
  "secrets.yml",
  "secrets.yaml",
  ".aws/credentials",
  ".kube/config",
];

export function isSeverity(value: unknown): value is Severity {
  return typeof value === "string" && (SEVERITIES as readonly string[]).includes(value);
}

function normaliseRuleSettings(
  rules: RepoDoctorConfig["rules"],
): Record<string, { enabled: boolean; severity?: Severity; options: Record<string, unknown> }> {
  const out: Record<string, { enabled: boolean; severity?: Severity; options: Record<string, unknown> }> = {};
  if (!rules) return out;
  for (const [ruleId, setting] of Object.entries(rules)) {
    if (setting === "off") {
      out[ruleId] = { enabled: false, options: {} };
      continue;
    }
    if (typeof setting === "string" && isSeverity(setting)) {
      out[ruleId] = { enabled: true, severity: setting, options: {} };
      continue;
    }
    if (setting && typeof setting === "object") {
      const value = setting as RuleSetting as { enabled?: boolean; severity?: Severity; options?: Record<string, unknown> };
      out[ruleId] = {
        enabled: value.enabled !== false,
        severity: isSeverity(value.severity) ? value.severity : undefined,
        options: value.options ?? {},
      };
    }
  }
  return out;
}

/** Merge user config with defaults into a fully resolved config. */
export function resolveConfig(raw: RepoDoctorConfig = {}, source?: string): ResolvedConfig {
  const weights: Record<Category, number> = { ...DEFAULT_WEIGHTS };
  if (raw.weights) {
    for (const category of CATEGORIES) {
      const value = raw.weights[category];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) weights[category] = value;
    }
  }
  return {
    ...raw,
    ignore: raw.ignore ?? [],
    rules: normaliseRuleSettings(raw.rules),
    failOn: raw.failOn ?? "high",
    sensitiveFiles: [...DEFAULT_SENSITIVE_FILES, ...(raw.sensitiveFiles ?? [])],
    secretPatterns: raw.secretPatterns ?? [],
    weights,
    includeInfo: raw.includeInfo ?? true,
    maxFiles: raw.maxFiles && raw.maxFiles > 0 ? raw.maxFiles : 5000,
    license: raw.license ?? "MIT",
    copyrightHolder: raw.copyrightHolder ?? "",
    source,
  };
}

export interface LoadConfigResult {
  config: ResolvedConfig;
  warnings: string[];
}

/**
 * Load configuration from disk. Missing file is not an error.
 * Malformed JSON is reported as a warning and defaults are used.
 */
export function loadConfig(root: string, overrides: RepoDoctorConfig = {}): LoadConfigResult {
  const warnings: string[] = [];
  let fileConfig: RepoDoctorConfig = {};
  let source: string | undefined;

  for (const name of CONFIG_FILE_NAMES) {
    const candidate = path.join(root, name);
    if (!isFileSync(candidate)) continue;
    const parsed = readJsonSync<RepoDoctorConfig>(candidate);
    if (parsed === null) {
      warnings.push(`Could not parse config file ${name}; using defaults.`);
      continue;
    }
    if (typeof parsed !== "object" || Array.isArray(parsed)) {
      warnings.push(`Config file ${name} must contain a JSON object; ignoring it.`);
      continue;
    }
    fileConfig = parsed;
    source = name;
    break;
  }

  if (!source) {
    const pkgPath = path.join(root, "package.json");
    if (isFileSync(pkgPath)) {
      const pkg = readJsonSync<Record<string, unknown>>(pkgPath);
      const embedded = pkg?.["repoDoctor"];
      if (embedded && typeof embedded === "object" && !Array.isArray(embedded)) {
        fileConfig = embedded as RepoDoctorConfig;
        source = "package.json#repoDoctor";
      }
    }
  }

  const merged: RepoDoctorConfig = {
    ...fileConfig,
    ...stripUndefined(overrides),
    ignore: [...(fileConfig.ignore ?? []), ...(overrides.ignore ?? [])],
    sensitiveFiles: [...(fileConfig.sensitiveFiles ?? []), ...(overrides.sensitiveFiles ?? [])],
    secretPatterns: [...(fileConfig.secretPatterns ?? []), ...(overrides.secretPatterns ?? [])],
    rules: { ...(fileConfig.rules ?? {}), ...(overrides.rules ?? {}) },
    weights: { ...(fileConfig.weights ?? {}), ...(overrides.weights ?? {}) },
  };

  return { config: resolveConfig(merged, source), warnings };
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}

/** Write a starter config file, refusing to overwrite. */
export function writeConfigFile(root: string, config: RepoDoctorConfig): string {
  const target = path.join(root, ".repodoctorrc.json");
  if (fs.existsSync(target)) throw new Error(`${target} already exists`);
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + "\n", "utf8");
  return target;
}
