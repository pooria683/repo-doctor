## What does this change do?

<!-- One or two sentences. Link the issue: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New rule
- [ ] New ecosystem / parser
- [ ] Documentation
- [ ] Refactor / internal
- [ ] Breaking change

## Checklist

- [ ] Tests added or updated (a positive fixture **and** a negative one for new rules)
- [ ] `npm test` passes locally
- [ ] `npm run self-scan` passes locally
- [ ] `docs/rules.md` updated (required for any new or changed rule)
- [ ] `docs/cli.md` updated (required for any new flag)
- [ ] `CHANGELOG.md` entry added under `## [Unreleased]`
- [ ] No secrets, credentials or personal data in the diff
- [ ] No new runtime dependency (`dependencies` must stay empty)
- [ ] No network access added (the privacy test will catch it)
- [ ] I have read [CONTRIBUTING.md](CONTRIBUTING.md)

## How to verify

<!-- Commands a reviewer can run, and what they should see -->

```bash
npm test
node dist/cli/index.js scan ./some-fixture
```

## Notes for the reviewer

<!-- Trade-offs, false positives you considered, follow-up work -->
