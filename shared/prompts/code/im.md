---
description: Implement an approved plan without committing
argument-hint: "<plan-or-instructions>"
---

Implement the approved work: $ARGUMENTS.

Use this prompt after `pl.md` or after the user has otherwise approved a clear implementation direction. Make the scoped changes, validate them, and stop before committing unless the user explicitly asks you to commit.

## Process

1. Reconstruct the approved plan from the conversation, issue, or provided instructions.
2. Re-read relevant files before editing. Work with existing changes; do not revert user work unless explicitly requested.
3. Implement the smallest coherent change that satisfies the plan.
4. Add or update tests when the behavior is important enough to regress.
5. Update docs, examples, prompts, config references, or `README.md` when user-facing behavior changes.
6. Update the documented changelog location, usually root `CHANGELOG.md`, for user-facing, operator-facing, or developer-workflow-visible changes.
7. Run targeted checks that match the touched area.
8. Summarize what changed, what was validated, and what still needs review.

## Constraints

- Do not commit, push, tag, or open a PR unless explicitly asked.
- Do not stage unrelated files.
- Do not use `git add .` or `git add -A`.
- Keep edits scoped to the approved plan.
- If the plan becomes invalid after reading the code, stop and explain the new finding before making broad changes.

## Output Format

Change Summary:
- ...

Validation:
- ...

Notes or Follow-ups:
- ...
