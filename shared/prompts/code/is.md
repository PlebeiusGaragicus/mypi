---
description: Turn an idea, bug, or rough request into a clear issue/spec
argument-hint: "<idea-or-issue>"
---

Analyze the idea, bug report, or GitHub issue: $ARGUMENTS.

Your job is to refine the work into a clear issue/spec before implementation begins. Do not implement unless explicitly asked.

## Process

1. Determine whether the input is:
   - A new idea that needs an issue.
   - An existing issue that needs refinement.
   - A bug report that needs reproduction and root-cause direction.
   - A small maintenance task that may not need a full issue.
2. If a GitHub issue is provided, read the issue, comments, linked issues/PRs, and relevant repository context.
3. Inspect the code or docs enough to verify the problem shape. Do not blindly trust proposed solutions in the issue.
4. Clarify the user-facing or operator-facing impact:
   - Who benefits?
   - What changes for them?
   - What should stay out of scope?
5. Define acceptance criteria that can be checked by a human or test.
6. Identify likely docs, tests, changelog, migration, or release-note needs.
7. If the issue does not exist and the user wants one, draft the issue body and ask before creating it.

## Output Format

Issue/Spec Summary:
- ...

User or Operator Impact:
- ...

Acceptance Criteria:
- ...

Non-Goals:
- ...

Implementation Notes:
- Keep this high-level. Leave detailed planning to `pl.md`.

Validation Ideas:
- ...

Docs / Changelog:
- ...

Open Questions:
- Only include questions that block a good issue/spec.

If the work is too small for an issue, say so and explain why.
