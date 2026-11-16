import type { Finding, Rule, RuleContext } from "../types.js";
import { matchAnyGlob } from "../util/glob.js";
import { maskSecret, shannonEntropy } from "../util/text.js";
import { createFinder, looksLikePlaceholder } from "./helpers.js";

export interface SecretPattern {
  id: string;
  label: string;
  regex: RegExp;
  /**
   * Capture group holding the secret itself, when the match context (variable
   * name, URL scheme) should not be part of the masked evidence.
   */
  valueGroup?: number;
  /**
   * Structural patterns have a distinctive vendor prefix, so a match is
   * credible even when the value contains words like "example" — that is how
   * documentation keys (AKIAIOSFODNN7EXAMPLE) are still reported, at a reduced
   * severity, instead of being silently dropped.
   */
  structural?: boolean;
  /** Optional validator to cut false positives (e.g. entropy thresholds). */
  validate?: (value: string) => boolean;
}

/**
 * Curated secret patterns. Ordered from most to least specific so that a
 * GitHub token is not also reported as a "generic high-entropy string".
 *
 * NOTE: values matched here are never written to the report. Only a masked
 * shape hint and a SHA-256 fingerprint leave the scanner.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  {
    id: "private-key",
    label: "Private key block",
    // Any PEM-style private key header.
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
    structural: true,
  },
  {
    id: "aws-access-key",
    label: "AWS access key ID",
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/,
    structural: true,
  },
  {
    id: "aws-secret-key",
    label: "AWS secret access key",
    regex: /\baws_secret_access_key\s*[:=]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/i,
    valueGroup: 1,
    structural: true,
  },
  {
    id: "github-token",
    label: "GitHub token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/,
    structural: true,
  },
  {
    id: "gitlab-token",
    label: "GitLab token",
    regex: /\bglpat-[A-Za-z0-9_-]{20,}\b/,
    structural: true,
  },
  {
    id: "slack-token",
    label: "Slack token",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
    structural: true,
  },
  {
    id: "slack-webhook",
    label: "Slack webhook URL",
    regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9_]+\/B[A-Za-z0-9_]+\/[A-Za-z0-9_]{20,}/,
    structural: true,
  },
  {
    id: "stripe-key",
    label: "Stripe secret key",
    regex: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/,
    structural: true,
  },
  {
    id: "google-api-key",
    label: "Google API key",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/,
    structural: true,
  },
  {
    id: "openai-key",
    label: "OpenAI API key",
    regex: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}\b/,
    validate: (value) => !/^sk-(test|example|xxx)/i.test(value),
  },
  {
    id: "npm-token",
    label: "npm token",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/,
    structural: true,
  },
  {
    id: "pypi-token",
    label: "PyPI token",
    regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/,
    structural: true,
  },
  {
    id: "sendgrid-key",
    label: "SendGrid API key",
    regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/,
    structural: true,
  },
  {
    id: "twilio-key",
    label: "Twilio API key",
    regex: /\bSK[0-9a-fA-F]{32}\b/,
    structural: true,
  },
  {
    id: "telegram-bot",
    label: "Telegram bot token",
    regex: /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/,
    structural: true,
  },
  {
    id: "discord-webhook",
    label: "Discord webhook URL",
    regex: /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d{15,}\/[A-Za-z0-9_-]{50,}/,
    structural: true,
  },
  {
    id: "heroku-key",
    label: "Heroku API key",
    regex: /\bheroku[a-z0-9_]*\s*[:=]\s*['"]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}['"]?/i,
    structural: true,
  },
  {
    id: "jwt",
    label: "JSON Web Token",
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    structural: true,
    validate: (value) => shannonEntropy(value) > 3.2,
  },
  {
    id: "db-url-with-password",
    label: "Database URL containing credentials",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s/@]+:([^@\s/]{6,})@[^\s/]+/i,
    valueGroup: 1,
    structural: true,
  },
  {
    id: "generic-secret",
    label: "Hard-coded credential",
    regex:
      /(?:^|[^\w])(?:api[_-]?key|apikey|secret[_-]?key|secret|token|password|passwd|client[_-]?secret|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[:=]\s*['"]([^'"\s]{12,})['"]/i,
    valueGroup: 1,
    validate: (value) => {
      if (looksLikePlaceholder(value)) return false;
      if (shannonEntropy(value) < 3.2) return false;
      return /[A-Za-z]/.test(value) && /[0-9]/.test(value);
    },
  },
];

/** Files where a "secret" is almost certainly a documented example. */
const EXAMPLE_FILE_GLOBS = [
  "*.example",
  "*.sample",
  "*.template",
  "*.dist",
  "*.md",
  "docs/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/fixtures/**",
  "**/__tests__/**",
  "**/__fixtures__/**",
  "**/testdata/**",
  "**/test/**",
  "**/tests/**",
];

/** Files we never scan for content secrets (generated / huge / binary-ish). */
const SKIP_GLOBS = [
  "**/*.min.js",
  "**/*.min.css",
  "**/*.map",
  "**/*.lock",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "Cargo.lock",
  "go.sum",
  "composer.lock",
  "**/*.svg",
  "**/*.csv",
];

/** Extensions worth scanning for content secrets. */
const SCANNABLE_EXTENSIONS = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".env", ".sh", ".bash", ".zsh", ".fish", ".ps1", ".py", ".rb", ".php", ".go", ".rs", ".java", ".kt",
  ".cs", ".c", ".h", ".cpp", ".hpp", ".swift", ".dart", ".ex", ".exs", ".lua", ".pl", ".r", ".scala",
  ".sql", ".tf", ".tfvars", ".gradle", ".properties", ".pem", ".key", ".txt", "",
]);

interface RawSecretHit {
  pattern: SecretPattern;
  file: string;
  line: number;
  value: string;
}

function isScannablePath(file: string): boolean {
  if (matchAnyGlob(SKIP_GLOBS, file)) return false;
  const dot = file.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.slice(dot).toLowerCase();
  if (!SCANNABLE_EXTENSIONS.has(ext)) return false;
  return true;
}

function extractCandidate(match: RegExpExecArray, pattern: SecretPattern): string {
  // Only patterns that explicitly point at the value capture it; everything
  // else uses the whole match (alternation groups are not the secret).
  if (pattern.valueGroup !== undefined) {
    const value = match[pattern.valueGroup];
    if (value) return value;
  }
  return match[0];
}

/** Scan files for secret content. Returns de-duplicated hits. */
export function scanForSecrets(ctx: RuleContext, files: string[], limit = 4000): RawSecretHit[] {
  const hits: RawSecretHit[] = [];
  const seen = new Set<string>();
  let scanned = 0;

  for (const file of files) {
    if (scanned >= limit) break;
    if (!isScannablePath(file)) continue;
    const lines = ctx.lines(file, 256 * 1024);
    if (lines.length === 0) continue;
    scanned += 1;
    for (const line of lines) {
      if (line.text.length > 4000) continue;
      for (const pattern of SECRET_PATTERNS) {
        // Reset lastIndex in case a previous call mutated the shared regex.
        pattern.regex.lastIndex = 0;
        const match = pattern.regex.exec(line.text);
        if (!match) continue;
        const value = extractCandidate(match, pattern);
        if (pattern.validate && !pattern.validate(value)) continue;
        if (!pattern.structural && looksLikePlaceholder(value)) continue;
        const key = `${pattern.id}:${file}:${value}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push({ pattern, file, line: line.number, value });
      }
    }
  }
  return hits;
}

const committedSecret: Rule = {
  id: "security/committed-secret",
  title: "Possible credential committed to the repository",
  category: "security",
  severity: "critical",
  description: "Source files must not contain live credentials: rotate anything that was committed, then remove it from history.",
  tags: ["security", "secrets"],
  run(ctx) {
    const create = createFinder(committedSecret);
    const tracked = new Set(ctx.git.trackedFiles.map((file) => file.toLowerCase()));
    const hits = scanForSecrets(ctx, ctx.files);

    const findings: Finding[] = [];
    const reported = new Set<string>();

    const keyFileGlobs = ["*.pem", "*.key", "*.p12", "*.pfx", "*.keystore", "*.jks", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", "*.ppk"];

    for (const hit of hits) {
      // Whole key files are reported by security/private-key-file, which gives
      // better remediation advice than a line-level "secret found".
      if (hit.pattern.id === "private-key" && matchAnyGlob(keyFileGlobs, hit.file)) continue;
      const dedupeKey = `${hit.pattern.id}:${hit.value}`;
      if (reported.has(dedupeKey)) continue;
      reported.add(dedupeKey);

      const isExample = matchAnyGlob(EXAMPLE_FILE_GLOBS, hit.file);
      const isTracked = tracked.has(hit.file.toLowerCase());
      // Outside git there is no ignore information: anything in the tree counts
      // as part of the project and is treated as exposed.
      const isProjectContent = isTracked || !ctx.git.isRepo;
      const severity = isExample ? "low" : isProjectContent ? "critical" : "high";
      const sameValueHits = hits.filter((candidate) => candidate.value === hit.value).length;

      findings.push(
        create({
          severity,
          title: isExample ? `Example credential detected (${hit.pattern.label})` : `Possible ${hit.pattern.label} committed`,
          message: isExample
            ? `${hit.pattern.label} found in ${hit.file}:${hit.line}. This looks like documentation or a test fixture.`
            : `${hit.pattern.label} found in ${hit.file}:${hit.line}${isTracked ? " (tracked by git)" : " (untracked file present on disk)"}.`,
          file: hit.file,
          line: hit.line,
          evidence: maskSecret(hit.value),
          why: isProjectContent
            ? "Anyone with read access (or a fork, or a leaked clone) can use this credential. Deleting the file does not remove it from git history."
            : "A credential stored in a local file can be committed by accident at any time.",
          suggestion: isExample
            ? "Keep fake credentials obviously fake (e.g. `sk_test_0000`) and add the pattern to your secret-scanning allowlist if it keeps firing."
            : "Rotate the credential now, remove it from the working tree, purge it from git history (git filter-repo), and load secrets from environment variables or a secret manager.",
          meta: { pattern: hit.pattern.id, occurrences: sameValueHits, tracked: isTracked }, 
        }),
      );
    }

    return findings;
  },
};

const privateKeyCommitted: Rule = {
  id: "security/private-key-file",
  title: "Private key file in the repository",
  category: "security",
  severity: "critical",
  description: "Private keys, certificates with keys, keystores and SSH keys must never be committed.",
  tags: ["security", "secrets"],
  run(ctx) {
    const create = createFinder(privateKeyCommitted);
    const keyGlobs = ["*.pem", "*.key", "*.p12", "*.pfx", "*.keystore", "*.jks", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa", "*.ppk"];
    const findings: Finding[] = [];
    const tracked = new Set(ctx.git.trackedFiles.map((file) => file.toLowerCase()));

    for (const file of ctx.files) {
      if (!matchAnyGlob(keyGlobs, file)) continue;
      // Public certificates are fine; only flag files that contain a private key.
      const content = ctx.readFile(file, 256 * 1024);
      const hasPrivateKey = content !== null && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content);
      if (!hasPrivateKey && !/(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/.test(file)) continue;
      const isTracked = tracked.has(file.toLowerCase());
      findings.push(
        create({
          severity: isTracked ? "critical" : "high",
          file,
          message: `${file} looks like a private key${isTracked ? " and is tracked by git" : ""}.`,
          why: "Leaked private keys allow impersonation of servers, signing authorities or clients, and cannot be revoked the way passwords can.",
          suggestion: "Revoke and rotate the key pair, remove the file from the repository and its history, and distribute keys out of band.",
          meta: { tracked: isTracked },
        }),
      );
    }
    return findings;
  },
};

const sensitiveFileTracked: Rule = {
  id: "security/sensitive-file-tracked",
  title: "Sensitive file is tracked by git",
  category: "security",
  severity: "high",
  description: "Environment files, credential stores and netrc files should never be committed.",
  tags: ["security", "secrets"],
  run(ctx) {
    const create = createFinder(sensitiveFileTracked);
    const findings: Finding[] = [];
    const tracked = ctx.git.trackedFiles;
    const globs = ctx.config.sensitiveFiles;

    for (const file of tracked) {
      if (!matchAnyGlob(globs, file)) continue;
      // .env.example / .env.sample are documentation, not secrets.
      if (/\.(example|sample|template|dist)$/i.test(file)) continue;
      const isPrivateKey = /(^|\/)(id_rsa|id_ed25519|id_ecdsa|id_dsa)$/.test(file) || /\.(pem|key|p12|pfx|keystore|jks)$/i.test(file);
      if (isPrivateKey) continue; // handled by security/private-key-file
      findings.push(
        create({
          file,
          message: `${file} is tracked by git and matches a sensitive-file pattern.`,
          why: "Environment and credential files frequently contain live tokens, database URLs and API keys.",
          suggestion: `Remove it with \`git rm --cached ${file}\`, add the pattern to .gitignore, commit an example file instead (${file}.example), and rotate anything it contained.`,
          meta: { tracked: true },
        }),
      );
    }
    return findings;
  },
};

const envFilePresent: Rule = {
  id: "security/env-file-present",
  title: "Local environment file detected",
  category: "security",
  severity: "low",
  description: "A .env file exists in the working tree. That is normal, but it must stay ignored and uncommitted.",
  tags: ["security", "secrets", "hygiene"],
  run(ctx) {
    const create = createFinder(envFilePresent);
    const tracked = new Set(ctx.git.trackedFiles.map((file) => file.toLowerCase()));
    const candidates = ctx.files.filter(
      (file) => /(^|\/)\.env(\..+)?$/.test(file) && !/\.(example|sample|template)$/i.test(file) && !tracked.has(file.toLowerCase()),
    );
    if (candidates.length === 0) return [];
    const example = ctx.firstExisting([".env.example", ".env.sample", ".env.template"]);
    const gitignored = ctx.readFile(".gitignore") ?? "";
    const envIgnored = /(^|\n)\s*\.env(\.\*|$)/.test(gitignored);
    return candidates.slice(0, 5).map((file) =>
      create({
        severity: envIgnored ? "info" : "medium",
        file,
        message: `${file} exists locally and is not tracked by git${envIgnored ? " (and .gitignore covers it)" : ""}.`,
        why: ".env files hold real credentials; one careless `git add -A` publishes them.",
        suggestion: example
          ? `Keep ${file} ignored and document every variable in ${example}.`
          : "Keep the file ignored, add `.env.example` documenting the required variables, and add `.env*` to .gitignore.",
      }),
    );
  },
};

const gitignoreMissing: Rule = {
  id: "security/gitignore-missing",
  title: "No .gitignore",
  category: "security",
  severity: "high",
  description: "Without .gitignore, build output, dependencies and local secrets get committed by accident.",
  tags: ["security", "hygiene"],
  run(ctx) {
    const create = createFinder(gitignoreMissing);
    if (ctx.exists(".gitignore")) return [];
    if (!ctx.git.isRepo && ctx.files.length === 0) return [];
    return [
      create({
        message: "No .gitignore file was found at the repository root.",
        why: "Every ecosystem produces local artefacts (node_modules, .venv, build/, .env) that should never enter version control.",
        suggestion: "Add a .gitignore covering dependencies, build output, logs, editors and .env files.",
        fix: {
          id: "add-gitignore",
          kind: "create-file",
          path: ".gitignore",
          description: "Create a language-aware .gitignore (Node, Python, OS and editor noise, .env).",
          safe: true,
        },
      }),
    ];
  },
};

const gitignoreMissingEntries: Rule = {
  id: "security/gitignore-incomplete",
  title: ".gitignore misses common secret and artefact patterns",
  category: "security",
  severity: "medium",
  description: "The .gitignore should at minimum cover .env files, dependencies, build output and OS noise.",
  requiresFile: [".gitignore"],
  tags: ["security", "hygiene"],
  run(ctx) {
    const create = createFinder(gitignoreMissingEntries);
    const content = (ctx.readFile(".gitignore") ?? "").replace(/\r\n/g, "\n");
    const lines = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"));

    const missing: string[] = [];
    const has = (patterns: RegExp[]) => lines.some((line) => patterns.some((pattern) => pattern.test(line)));

    if (!has([/^\.env$/, /^\.env\*/, /^\.env\.\*/, /^\*\.env$/, /^\.env\.local$/])) missing.push(".env");
    if (ctx.pkg && !has([/^node_modules\/?$/, /^node_modules$/, /^\/node_modules\/?$/])) missing.push("node_modules/");
    if (!has([/\.log$/, /^\*\.log$/])) missing.push("*.log");
    if (!has([/\.DS_Store/, /^Thumbs\.db$/])) missing.push(".DS_Store");
    if (!has([/\.pem$/, /\.key$/, /^\*\.key$/, /^\*\.pem$/])) missing.push("*.pem / *.key");
    if (!has([/\.idea\/?$/, /\.vscode\/?$/])) missing.push(".idea/ / .vscode/");

    if (missing.length === 0) return [];
    return [
      create({
        file: ".gitignore",
        message: `.gitignore does not cover: ${missing.join(", ")}.`,
        why: "Missing ignore rules are the most common path to committing secrets and build artefacts.",
        suggestion: `Add these patterns to .gitignore: ${missing.join(", ")}.`,
        meta: { missing },
      }),
    ];
  },
};

const committedDatabaseDump: Rule = {
  id: "security/committed-data-dump",
  title: "Database dump or archive committed",
  category: "security",
  severity: "high",
  description: "SQL dumps, archives and backups frequently contain personal data or credentials.",
  tags: ["security", "privacy"],
  run(ctx) {
    const create = createFinder(committedDatabaseDump);
    const globs = ["*.sql", "*.dump", "*.bak", "*.sqlite", "*.sqlite3", "*.db", "*.tar.gz", "*.zip", "*.7z", "*.rar"];
    const matches = ctx.git.trackedFiles.filter((file) => matchAnyGlob(globs, file) && !matchAnyGlob(["**/schema.sql", "**/migrations/**", "**/seed*.sql", "**/fixtures/**"], file));
    if (matches.length === 0) return [];
    return matches.slice(0, 5).map((file) =>
      create({
        file,
        message: `${file} is tracked and looks like a data dump or archive.`,
        why: "Dumps and archives often carry production data (personal data, password hashes) and bypass code review because they are binary.",
        suggestion: "Remove the file, add the pattern to .gitignore, and store backups outside the repository.",
      }),
    );
  },
};

export const secretRules: Rule[] = [
  committedSecret,
  privateKeyCommitted,
  sensitiveFileTracked,
  envFilePresent,
  gitignoreMissing,
  gitignoreMissingEntries,
  committedDatabaseDump,
];
