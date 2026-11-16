# How Repo Doctor compares

There are excellent tools in each of these areas. Repo Doctor is not trying to
replace them — it answers a different question: *is this repository ready to be
published and maintained, and what should I do next?*

## At a glance

| Capability | Repo Doctor | `npm audit` | Snyk / Dependabot | OSSF Scorecard | Gitleaks / TruffleHog | MegaLinter |
| ---------- | :---------: | :---------: | :---------------: | :------------: | :-------------------: | :--------: |
| Documentation readiness | ✅ 11 rules | — | — | partial | — | partial |
| Secret detection | ✅ 20+ patterns | — | partial | — | ✅ deeper | ✅ via plugins |
| .gitignore / repo hygiene | ✅ | — | — | partial | — | — |
| Dependency advisories | ✅ offline snapshot | ✅ live | ✅ live | — | — | ✅ via plugins |
| Dockerfile / Compose | ✅ 8 rules | — | partial (image scan) | — | — | ✅ via hadolint |
| CI workflow security | ✅ 7 rules | — | — | ✅ | — | partial |
| Community readiness | ✅ 5 rules | — | — | ✅ | — | — |
| Works without network | ✅ always | ❌ | ❌ | ❌ | ✅ | ✅ |
| No token / account needed | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Single readiness score | ✅ explainable | — | — | ✅ | — | — |
| Safe auto-fixes | ✅ 18 | ✅ `audit fix` | PRs | — | — | partial |
| SARIF output | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Runtime dependencies | **0** | many | n/a | Go binary | binary | many |

## Where Repo Doctor is the right tool

- **Pre-launch audit.** You are about to open-source an internal project and want
  to know what is missing before anyone sees it.
- **Air-gapped or restricted environments.** No outbound network, no tokens,
  no accounts.
- **CI gate on repository shape**, not on code style: no license, no CI, secrets
  in the tree, `pull_request_target` misuse.
- **Agent workflows.** Stable JSON with fix metadata an agent can execute.
- **Teaching.** Every finding explains *why* it matters, which is the part most
  scanners skip.

## Where you should use something else

| Need | Better tool |
| ---- | ----------- |
| Complete CVE coverage, live | Dependabot, Snyk, `pip-audit`, OSV-Scanner |
| Image/OS-layer vulnerability scanning | Trivy, Grype, Docker Scout |
| Deep secret detection with history scanning | Gitleaks, TruffleHog |
| Lint/style enforcement across languages | MegaLinter, your linters |
| Supply-chain provenance and branch protection posture | OSSF Scorecard |
| Semantic code analysis | CodeQL, Semgrep |

## What we intentionally do differently

1. **No network.** Always. Not "by default". A test fails the build if a HTTP
   client is imported.
2. **Zero dependencies.** Auditing supply chains should not extend them.
3. **Fixes create files, never edit them.** `fix --apply` cannot break your code
   because it never rewrites a line you wrote.
4. **Confidence is explicit.** Vulnerability findings carry
   `meta.confidence: "yes" | "maybe"` instead of pretending ranges are resolved
   versions.
5. **Secrets never leave the process.** Reports carry a masked hint and a
   fingerprint, so they can be published.
