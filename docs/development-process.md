# Development Process

This repo uses a small issue-to-release workflow so changes stay understandable, reviewable, and traceable. The goal is not ceremony. The goal is to know what changed, why it changed, how it was tested, and what users or operators should expect.

## 1. Start Clean From Main

Begin from a clean checkout of the default branch. Pull the latest changes, confirm the working tree is clean, and create a branch for the issue or feature. A clean start makes it easier to review only the work that belongs in the pull request.

## 2. Turn Ideas Into Issues

Use `shared/prompts/code/is.md` when the work starts as a rough idea, bug, or feature request. The issue/spec should explain the problem, user or operator impact, acceptance criteria, non-goals, validation ideas, and likely docs or changelog needs.

Good issues answer: what problem are we solving, who benefits, how will we know it is done, and what is intentionally out of scope?

## 3. Plan Before Coding

Use `shared/prompts/code/pl.md` after the issue exists. The planning step reads the issue and relevant repo context, then proposes the smallest coherent implementation. A good plan names likely files, tests, docs, changelog needs, risks, and open questions.

Planning is where tradeoffs belong. Implementation should not start until the plan is clear enough to execute.

## 4. Implement The Plan

Use `shared/prompts/code/im.md` after the plan is approved. This step makes the scoped code, docs, prompt, config, or test changes. It should update `CHANGELOG.md` when the change affects users, operators, or developer workflow.

Implementation should stay close to the plan. If the code reveals that the plan is wrong, stop and revise the plan instead of drifting into a larger change.

## 5. Wrap The Work

Use `shared/prompts/code/wr.md` when the implementation is ready to package up. Wrapping means reviewing the working tree, running the right checks, confirming changelog coverage, preparing a focused commit, and optionally pushing when requested.

Good wrapping keeps unrelated files out of the commit and records enough evidence that reviewers can trust the change.

## 6. Open And Review The PR

Open a pull request with a clear summary, linked issue or rationale, user/operator impact, changelog note, and test plan. CI should run deterministic checks. AI review is useful here, but it is advisory; humans still decide whether the PR is ready.

Use `shared/prompts/code/pr.md` before merge. It reviews both process quality and product quality: issue linkage, scope, changelog, tests, docs, CI, release risk, correctness, user experience, compatibility, security, and maintainability.

## 7. Audit Changelog When Needed

Use `shared/prompts/code/cl.md` before release or for large PRs with many user-facing changes. It checks whether each meaningful change has a clear changelog entry under the right section.

Not every commit needs a changelog entry. Behavior changes, config changes, prompt or skill changes, install or CI workflow changes, and docs users rely on usually do. Pure refactors, generated output, and test-only changes usually do not.

## 8. Release And Version

Use `shared/prompts/code/re.md` when it is time to prepare a release. Release work moves `## [Unreleased]` entries into a dated version section, bumps version files consistently, runs final checks, and drafts release notes.

Do not mix ordinary feature work with release bumping unless the pull request is explicitly a release PR.

## Prompt Cheat Sheet

- `is.md`: turn an idea, bug, or rough request into an issue/spec.
- `pl.md`: plan implementation from an issue or spec.
- `im.md`: implement the approved plan without committing.
- `wr.md`: wrap the working tree with checks, changelog, commit, and optional push.
- `pr.md`: review a pull request before merge.
- `cl.md`: audit changelog coverage before a large PR or release.
- `re.md`: prepare a version bump and release notes.

## What Good Looks Like

Good work is small enough to review, linked to a reason, covered by appropriate validation, and documented where users or operators will look. The changelog should be honest about behavior changes and breaking changes. CI should handle deterministic checks, and AI review should help find blind spots without replacing human judgment.
