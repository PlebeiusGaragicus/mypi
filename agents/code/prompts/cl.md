---
description: Audit changelog coverage before a large PR or release
---

Audit changelog coverage for the current branch, a PR, or all commits since the last release. Use this for focused changelog confidence; use `re.md` when it is time to actually prepare a versioned release.

## Process

1. Discover the repository's changelog policy:
   - Read `AGENTS.md`, `CONTRIBUTING`, `README.md`, `.github/`, and existing changelog files.
   - Prefer the documented changelog location. If none is documented, look for root `CHANGELOG.md`, then package-level changelogs.

2. Find the comparison range:
   - If a PR URL or PR number is provided, compare the PR branch to its base branch.
   - Otherwise find the latest version tag with `git tag --sort=-version:refname` and compare that tag to `HEAD`.
   - If there are no tags, compare against the repository's main branch when available.

3. Review every commit and changed file in the range:
   - Determine whether each change is user-facing, operator-facing, developer-workflow-facing, internal-only, generated, test-only, docs-only, or release housekeeping.
   - Changes to prompts, skills, extensions, config files, command behavior, install behavior, packaging, CI, or documented workflow usually need changelog coverage.
   - Pure refactors, typo-only edits, generated output, and test-only changes can usually be skipped unless they affect behavior.

4. Validate changelog quality:
   - Entries should live under `## [Unreleased]` before release.
   - Sections should match the repo policy. A good default order is `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`.
   - Breaking changes must be called out as breaking, including migration notes when useful.
   - Entries should be written from the user's point of view and include issue or PR links when available.

5. Report before editing:
   - Missing entries.
   - Misclassified entries.
   - Entries that are too vague, too internal, or missing migration/release context.
   - Commits that do not need changelog entries and why.

## Output Format

Changelog Audit:
- Range reviewed: `<base>...<head>`
- Changelog files reviewed: `<paths>`

Required Changes:
- ...

Optional Improvements:
- ...

No Changelog Needed:
- ...

Proposed Entries:
- Provide exact entry text and target section.

If no changelog work is needed, say so clearly and explain the remaining release risk, if any.