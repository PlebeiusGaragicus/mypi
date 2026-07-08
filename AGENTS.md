Several reference repos are cloned locally and .gitignore'd — they are for reference only. Review .gitignore for the definitive list. NEVER modify them.

## Docs

`docs/` is an MkDocs site (`mkdocs.yml` at the root, deployed to GitHub Pages by `.github/workflows/docs.yml`). When a change affects behavior, commands, presets, skills, or workflows, update the matching page in `docs/`. Design changes under consideration go in `docs/proposals.md`, not into code.

## Development process

Issues, pull requests, and changelog entries are the durable record of why the repository changed. Prefer opening or linking a GitHub issue before non-trivial work; every PR should include a summary, linked issue or rationale, test plan, and changelog note. Keep commits and PRs small and reviewable. The full issue-to-release workflow (and its prompt templates under `shared/prompts/code/`) is documented in [docs/development-process.md](docs/development-process.md).

## Changelog

Root `CHANGELOG.md` is the source of truth for user- and operator-visible changes.

- Maintain `## [Unreleased]` with subsections in this order: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`.
- Add an entry for changes to behavior, commands, configuration, workflows, prompts, skills, extensions, packaging, or docs users rely on. Skip purely internal refactors, typo fixes, and test-only changes.
- Write entries in plain language from the user's point of view; put incompatible behavior under `### Breaking Changes` even if it also fixes a bug.
- Version bumps happen only during release preparation.

## Session PATH bootstrap (skill scripts)

Pi does not run an interactive shell for the bash tool; each command is a new process. Skill CLIs are exposed by basename via PATH promotion: add the skill's folder name to `scripts/path-promoted-skills.txt`, and note in its `SKILL.md` that agents should use bare commands (via the bash tool), not paths into the repo. `extensions/preset/bootstrap.ts` applies the promotion for Pi sessions; `source scripts/bootstrap.sh` does the same for dev shells. Details: [docs/runtime.md](docs/runtime.md).

## Node and module conventions

Root `package.json` sets `"type": "module"`, so extensionless or `.js` CLIs under `shared/skills/*/scripts/` resolve as ESM with no per-skill manifest. Treat `shared/skills/*/scripts/` as the only place new `.js` files should grow; if you ever add CommonJS elsewhere, use an explicit `.cjs` extension or a separate `package.json` boundary.

## Runtime env

mypi-owned runtime values (API keys, service URLs, TTS WPM) live in `~/.pi/mypi/mypi.env` (override: `MYPI_ENV_FILE`) — the only mypi user config file, edited with `/mypi-env-config`. Pi's LLM credentials stay in `~/.pi/agent/auth.json`. Details: [docs/runtime.md](docs/runtime.md).

## Validation

Run `npm run presets:check` and `npm run presets:test` after touching `agents/*.yml` or `shared/presets/`; `npm run runtime-env:test` after touching `shared/runtime-env/`. Regenerate the system-prompt dumps with `npm run presets:debug-system-prompts` after changing preset YAML or shared prompts.

The browser-runtime test suite (`cd utilities/browser-runtime && bun test test/`) runs **locally only** — never in GitHub Actions. The tests drive a real Chromium and wedge on GitHub runners (renderer freeze, not reproducible elsewhere). CI's "Browser runtime checks" job only compiles the runtime; do not add `bun test` back to it. Run the suite locally after touching `utilities/browser-runtime`.
