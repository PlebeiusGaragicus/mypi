Several reference repos are cloned locally and .gitignore'd - they are for reference only.  Review .gitignore for the definitive list.  NEVER modify them.

## Development process

Use issues, pull requests, changelog entries, and review notes as the durable record of why the repository changed.

- Prefer opening or linking a GitHub issue before non-trivial work. Small typo fixes, mechanical maintenance, and emergency follow-ups may skip an issue, but the PR should say why.
- Every pull request should include a summary, linked issue or rationale, test plan, and changelog note.
- Treat AI review as advisory: it can find risks and process gaps, but humans decide whether to merge.
- Do not use AI review as the only quality gate. Prefer automated checks for deterministic concerns such as tests, builds, formatting, generated files, and policy checks.
- Keep commits and PRs reviewable. Split unrelated changes instead of bundling process, refactor, and product behavior into one large change.

## Changelog and versioning

The root `CHANGELOG.md` is the source of truth for user-visible and operator-visible changes.

- Maintain an `## [Unreleased]` section with these subsections, in order: `### Breaking Changes`, `### Added`, `### Changed`, `### Fixed`, `### Removed`, `### Security`.
- Add a changelog entry for changes that affect behavior, commands, configuration, workflows, docs users rely on, prompts, skills, extensions, packaging, or release process.
- Skip changelog entries for purely internal refactors, typo-only edits, test-only changes, generated output, and release housekeeping unless they affect users or operators.
- Write entries in plain language from the user's point of view. Mention the issue or PR when available, for example: `Added browser runtime smoke checks ([#12](https://github.com/owner/repo/pull/12)).`
- Put incompatible behavior, migration requirements, removed commands, renamed config keys, and changed public interfaces under `### Breaking Changes`, even if they also fix a bug.
- Version bumps happen during release preparation. Move completed `Unreleased` entries into a dated version section and update `VERSION` and package manifests together when applicable.

## Session PATH bootstrap (skill scripts)

Pi does not run an interactive shell for the agent **bash** tool; each command is a new process. To expose pick-and-choose skill utilities (e.g. bare `todo`) without full paths or `source` on every command:

- **`scripts/path-promoted-skills.txt`** — One **skill folder name** per line under `shared/skills/<name>/` (comments `#` and blank lines allowed). Each promoted skill’s `scripts/` directory is prepended to `PATH` for agents and for humans who `source scripts/bootstrap.sh`. **Later lines win** if order matters for PATH precedence.
- **`extensions/agent-mode/bootstrap-path.ts`** — On extension load (via `extensions/agent-mode/index.ts`), reads `path-promoted-skills.txt` and prepends those dirs to `process.env.PATH` (idempotent). Child shells inherit this via pi’s `getShellEnv()`. Runs after `bootstrap-mypi-config.ts` inside the agent-mode bundle in `package.json` under `pi.extensions`.
- **`scripts/bootstrap.sh`** — For normal shells outside pi (e.g. local dev): `source scripts/bootstrap.sh` from repo root reads the same file and prepends the same dirs to `PATH`.

When a skill’s scripts should be invocable by **basename**, add its folder name to **`scripts/path-promoted-skills.txt`** and note in that skill’s **`SKILL.md`** that its `scripts/` dir is on `PATH` (so the agent uses bare commands, not `node …/scripts/…` paths).

## Root `package.json` and Node in skill `scripts/`

The repo root **`package.json`** sets **`"type": "module"`** so Node resolves extensionless (or `.js`) CLIs under **`shared/skills/*/scripts/`** as **ESM** when it walks up to this manifest—no per-skill `package.json` needed, and no `MODULE_TYPELESS_PACKAGE_JSON` noise for extensionless shebang scripts like `ntfy-send`.

**Convention:** treat **`shared/skills/*/scripts/`** as the only place this package is expected to grow new **`.js`** files. The rest of the package is primarily **TypeScript** extensions plus shell helpers; if you ever add CommonJS elsewhere, use an explicit **`.cjs`** extension or a separate `package.json` boundary so it does not inherit root `"type": "module"`.

## User config (`~/.pi/mypi.json`)

mypi-owned settings (API keys, service URLs, TTS WPM) live in **`~/.pi/mypi.json`** (override: **`MYPI_CONFIG_FILE`**). See [`mypi.json.example`](mypi.json.example) and [`shared/mypi-config/CONFIG.md`](shared/mypi-config/CONFIG.md). Pi’s LLM credentials remain in `~/.pi/agent/auth.json`.

- **`extensions/agent-mode/bootstrap-mypi-config.ts`** — On extension load, merges non-empty `env` keys from the file into `process.env` for unset keys only. Imported first in `extensions/agent-mode/index.ts`.
- **Per-consumer `ensure*`** — Each extension/skill persists its own defaults on first access (`tts.wpm` default 300; API/URL keys default `""`).
- **`scripts/bootstrap.sh`** — After PATH promotion, runs `shared/mypi-config/apply-shell-env.mjs` so dev shells get the same non-empty env exports.
