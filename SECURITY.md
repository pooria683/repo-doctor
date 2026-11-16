# Security Policy

Repo Doctor scans untrusted repositories, so its own security posture matters.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | ✅ |
| older   | ❌ |

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Use GitHub's private reporting flow: **Security → Advisories → Report a
vulnerability** ([direct link](https://github.com/pooria683/repo-doctor/security/advisories/new)).

Please include:

- the version and the command you ran;
- a minimal reproduction (a fixture layout is ideal);
- the impact you believe it has.

## What to expect

| Stage | Target |
| ----- | ------ |
| Acknowledgement | within 3 working days |
| Initial assessment | within 7 days |
| Fix or mitigation | as soon as practical, coordinated disclosure with you |

We credit reporters in the advisory unless you prefer to stay anonymous.

## In scope

- Reading files outside the scanned root.
- Leaking a secret into any report format (console, markdown, JSON, SARIF,
  `evidence`, `meta`, error messages).
- `fix` overwriting, truncating or deleting user content.
- Denial of service (hang, unbounded memory) triggered by a crafted repository.
- Any network access — there should be none, and a test enforces it.

## Out of scope

- Missing advisories in the bundled snapshot (it is documented as incomplete).
- False positives or false negatives in detection quality — open a normal issue.
- Vulnerabilities in repositories you scan (that is your report, not ours).
- Reports that require a compromised local machine or a modified build.

## Our own guarantees

See [`docs/security.md`](docs/security.md) for the full model: no network, zero
runtime dependencies, masked secrets, read-only scans, and bounded resource use.
