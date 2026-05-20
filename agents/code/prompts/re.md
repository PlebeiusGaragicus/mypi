---
description: Prepare a release, version bump, and release notes
argument-hint: "<version-or-release-instructions>"
---

Prepare a release: $ARGUMENTS.

Use this prompt when the feature work is complete, the PR is merge-ready, and it is time to finalize versioning and release notes. Do not tag, merge, publish, or push unless the user explicitly asks.

## Process

1. Confirm the intended version and release type:
   - Patch for backwards-compatible fixes.
   - Minor for backwards-compatible features.
   - Major for breaking changes.
2. Read the changelog policy in `AGENTS.md` and the current changelog files.
3. Audit all changes since the last release tag or version baseline.
4. Move completed `## [Unreleased]` entries into a dated version section.
5. Leave a fresh `## [Unreleased]` section for future work.
6. Bump version files consistently when present:
   - `VERSION`
   - `package.json`
   - lockfiles or package manifests
   - package-specific version files
7. Run final checks appropriate for the repo.
8. Draft release notes from the changelog.
9. Report the exact tag name and release commands, but do not run them unless explicitly requested.

## Output Format

Release Summary:
- Version:
- Release type:
- Notable changes:

Files Updated:
- ...

Validation:
- ...

Release Notes Draft:
- ...

Next Commands:
- Commands to tag, push, publish, or merge, only as recommendations unless the user asked you to run them.

Risks:
- Breaking changes, migration notes, or unresolved release concerns.
