---
description: Review PR merge readiness across process, product, and release risk
argument-hint: "<PR-URL>"
---

You are given one or more GitHub PR URLs: $@.

Review each PR as an advisory AI reviewer. This is the single pre-merge review prompt: cover both development process and product/code correctness. Do not approve, merge, push, force-push, or modify the branch unless the user separately asks you to make changes. Prefer concrete findings over broad advice.

## Review Scope

For each PR:

1. Read the PR description, linked issues, comments, commits, checks, and changed files.
2. Identify linked issues from the PR body, branch name, commit messages, comments, and GitHub cross-links. Read the relevant issue discussion before judging intent.
3. Compare the PR against the target branch. Read surrounding code and related call paths, not just the diff, when needed to validate behavior.
4. Check repository guidance in `AGENTS.md`, `CONTRIBUTING`, `README.md`, `.github/`, and nearby docs before applying generic rules.
5. Review process quality:
   - Issue linkage or clear rationale for no issue.
   - PR scope and reviewability.
   - Changelog, docs, tests, CI, release risk, migration notes, rollback notes, and operational readiness.
   - Whether generated files, formatting churn, or unrelated changes are justified.
6. Review product and code quality:
   - Correctness, regressions, edge cases, user experience, compatibility, security/privacy, maintainability, and fit with local patterns.
   - Commands, config keys, environment variables, prompts, skills, extensions, docs, APIs, install behavior, CI behavior, and file formats affected by the PR.
7. Check changelog expectations:
   - Prefer the repo's documented changelog location. If none is documented, look for root `CHANGELOG.md`, then package-level changelogs.
   - User-facing or operator-facing changes should usually update `## [Unreleased]`.
   - Breaking changes must be clearly marked as breaking, not hidden under fixes or general changes.
8. Check documentation expectations:
   - New or changed features should update user docs, examples, prompts, config docs, or README content that users rely on.
   - Internal-only changes usually do not need docs unless they change development workflow.
9. Check test and validation evidence:
   - Prefer deterministic tests/builds/lints for claims of correctness.
   - If tests are missing, explain the specific risk and the smallest useful validation.

## Output Format

For each PR, respond with:

PR: <url>

Verdict:
- `Ready with nits`, `Needs changes`, or `Blocked`, with one sentence explaining why.

Findings:
- List bugs, regressions, missing tests, release blockers, or process violations first.
- Include severity: `Critical`, `High`, `Medium`, `Low`, or `Nit`.
- Include file/function references when possible.
- If there are no findings, say `No blocking findings found.`

Process Review:
- Issue linkage, PR scope, changelog, docs, tests, CI, release/versioning, migration notes.

Product Review:
- Correctness, behavior, user experience, compatibility, security/privacy, maintainability.

Questions or Assumptions:
- Only include questions that affect merge confidence.

Suggested Follow-ups:
- Separate required pre-merge fixes from optional post-merge improvements.

Do not pad the review. If the PR is small and clean, keep the response short.