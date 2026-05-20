---
description: Wrap current work with checks, changelog, commit, and optional push
argument-hint: "[instructions]"
---
Wrap it.

Additional instructions: $ARGUMENTS

Determine context from the conversation history first.

Rules for context detection:
- If the conversation already mentions a GitHub issue or PR, use that existing context.
- If the work came from `/is` or `/pr`, assume the issue or PR context is already known from the conversation and from the analysis work already done.
- If there is no GitHub issue or PR in the conversation history, treat this as non-GitHub work.

Unless I explicitly override something in this request, do the following in order:

1. Review the working tree and identify only the files changed for this task.
2. Run appropriate checks for the touched area. If checks are skipped, explain why.
3. Add or update the repo's documented changelog location, usually root `CHANGELOG.md`, under `## [Unreleased]` using the repo changelog rules.
4. If this task is tied to a GitHub issue or PR and a final issue or PR comment has not already been posted in this session, draft it in my tone, preview it, and post exactly one final comment.
5. Commit only files you changed in this session.
6. If this task is tied to exactly one GitHub issue, include `closes #<issue>` in the commit message. If it is tied to multiple issues, stop and ask which one to use. If it is not tied to any issue, do not include `closes #` or `fixes #` in the commit message.
7. Check the current git branch. If it is not `main`, stop and ask what to do. Do not push from another branch unless I explicitly say so.
8. Push the current branch only if allowed by the branch rule above or explicitly requested.

Constraints:
- Never stage unrelated files.
- Never use `git add .` or `git add -A`.
- Run required checks before committing if code changed.
- Do not version bump unless this is explicitly release work. Use `re.md` for releases.
- Do not open a PR unless I explicitly ask.
- If this is not GitHub issue or PR work, do not post a GitHub comment.
- If a final issue or PR comment was already posted in this session, do not post another one unless I explicitly ask.