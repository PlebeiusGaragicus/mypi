---
description: Plan implementation from an issue, spec, or feature request
argument-hint: "<issue-or-request>"
---

Plan the work for: $ARGUMENTS.

Your job is to understand the requested change, inspect the repository, and produce a practical implementation plan. Do not edit files or implement code unless the user explicitly switches to implementation.

## Process

1. Read the issue, spec, PR discussion, or request in full.
2. Read repository guidance in `AGENTS.md`, `CONTRIBUTING`, `README.md`, `.github/`, and nearby docs when relevant.
3. Inspect the relevant code paths, prompts, skills, config, tests, and docs.
4. Identify the smallest coherent implementation that satisfies the acceptance criteria.
5. Call out meaningful alternatives only when they change the plan materially.
6. Identify docs, tests, changelog, migration, release, and CI implications.
7. Ask clarifying questions before planning if a decision would significantly change the implementation.

## Output Format

Plan:
- Step-by-step implementation tasks.

Files Likely To Change:
- `path`: why it needs to change.

Tests and Validation:
- Automated checks to run.
- Manual checks, if automation is not practical.

Docs and Changelog:
- What should be updated and why.

Risks and Tradeoffs:
- Compatibility, migration, security, operational, or user-experience risks.

Open Questions:
- Only include questions that affect implementation.

Keep the plan concise enough to execute. Do not turn it into a speculative architecture document.
