# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for released versions and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) for changelog structure.

## [Unreleased]

### Breaking Changes

- Replaced legacy `/agent-mode`, `/persona`, `SYSTEM.md`, `APPEND_SYSTEM.md`, and `PI_CODING_AGENT_DIR` worker routing with preset-defined agents in `agents/*.yml`.
- Removed `~/.pi/mypi.json` and `~/.pi/mypi/env.yml` support; mypi runtime settings now live only in `~/.pi/mypi/mypi.env`.
- Renamed the TTS speed setting from `TTS_WPM` to `SAY_TTS_WPM`.
- Renamed the `subagent` worker override field from `persona` to `preset`.
- Removed the `subagent.preset` override field; workflow workers are now called directly by preset name through `agent`.

### Added

- Added the `socratic` preset and shared `how-to-debate` skill (promoted from `EXAMPLE/SOCRATIC`): stress-test a thesis via elenchus, then structure it into evidence-based `SocraticArgument` markdown under `./arguments/<thesis-slug>.md`.
- Opened `subagent` delegation to conversational presets: a new `cleanSession` preset field lets presets that declare workers opt out of the workflow clean-session rule. `socratic` now dispatches `web` workers for source-finding, guided by the new shared `find-sources` skill (delegation only on a clear user request; citation-ready return contract).
- Added `--debug-system-prompt` for printing the effective preset system prompt before a model call.
- Added `/debug-system-prompt` to show the effective system prompt in-session (same as Ctrl+Q; requires at least one turn).
- Added path-promoted `btc-price` CLI for the btc-price skill (CoinGecko spot quotes).
- Started tracking notable project changes in a root changelog.
- Added a documented development workflow and lifecycle prompt set for issue/spec, planning, implementation, wrapping, PR review, changelog audit, and release preparation.
- Added `/preset` activation, flat package presets, shared workflow prompts, a shared workflow-builder skill, and preset-gated `subagent` / `questionnaire` tools.
- Added shared preset runtime validation for prompt modes, tools, extensions, workers, themes, environment keys, and flat `agents/*.yml` layout.
- Added `mypi.env.example` as the single mypi runtime settings template.
- Added `/mypi-env-config` for viewing and editing `mypi.env`.
- Added docs for presets, custom preset overlays, runtime env, commands, bootstrap, validation, and workflow prompt usage.
- Added `docs/proposals.md` documenting design changes under consideration: an on-disk workflow instruction pointer, chain `{previous}` truncation, a strict mode for the preset YAML parser, prompt context-budget trims, and parallel-cap configurability.

### Fixed

- Preset restore now actually fires on session resume and `--continue`-style startup, not just reload and fork. Resuming a session silently dropped you into vanilla Pi (all seven built-in tools, no preset prompt) even though the session had saved preset state and docs/presets.md promised restore-on-resume; one resumed `socratic` session ended up probing the internet with bash curl because of it.

### Changed

- Redesigned the `subagent` tool UI as live per-worker panels. While a worker runs its panel shows a spinner, elapsed time, turn count, context size, a rolling activity feed (every tool call with argument preview and ✓/✗ duration when it settles, plus first-line snippets of each assistant turn), the current action, and a tail of the reply text as it streams token-by-token. Completed panels show a stats header (turns, duration, tokens in/out, cost) over the feed and the final reply as markdown; failed panels lead with the failure reason. Ctrl+O expands the full feed and reply. Updates flow in single, chain, and now also parallel mode (parallel previously reported nothing until every worker finished), throttled to ~1/s during streaming. Long local-model turns no longer look like hangs; the call renderer also now shows numbered parallel tasks and chain hops.
- `subagent` workers now run with thinking off (`--thinking off`): worker tasks are bounded, and inheriting the parent session's thinking level made each worker turn take minutes of silent reasoning on large local models. A worker preset that declares its own `thinkingLevel` still wins at activation.
- Deprecated browser-control: the skill and `utilities/browser-runtime` stay in the repo (with deprecation banners), but no preset, prompt, or workflow references them anymore. The `web` preset leads with Tavily and Exa search and reads specific URLs via `tavily-extract` / `exa-contents`; the deepresearch collector contract drops `$B`, challenge handoff, and the whole screenshots artifact tree in favor of API extraction; congress-search no longer suggests `$B` for other sites. Rationale and a FireCrawl fallback evaluation are in docs/proposals.md P8.
- Banned improvised internet access in the two bash-holding presets: `code` must never use curl/wget/etc. to search the web, probe connectivity, or fetch pages (bash networking is for dev tooling only; web needs go to the `web` worker), and `web` routes all web access through the skill CLIs — no querying search engines directly, no raw-HTTP scraping, no "checking if I have internet" (curl stays allowed only where a SKILL.md documents that exact command, e.g. btc-price).
- Web-facing presets now distrust stale parametric memory: `web` must search before answering anything that may postdate its training cutoff and treat retrieved, dated sources as authoritative (a worker had declared real post-cutoff events fictional); `socratic` holds recall lightly — plain statements for textbook facts, explicit "I'm not certain" for obscure dates, figures, quotations, people, and events, and saved Arguments lean on cited sources with recall-only claims labeled and logged as open questions. The `find-sources` skill tells parents to put a matching recency reminder in every worker task.
- `subagent` workers now inherit the parent session's model instead of falling back to the global default, so an orchestrator running a non-default model (e.g. `bench workflow --model ...`) keeps orchestrator and workers on the same model. Preset-pinned models still override at activation.
- Removed `bash` from the `workflow` preset: the orchestrator has no shell and must delegate command execution to `code` and live web access to `web`, closing the gap where it could curl the web itself instead of spawning workers. Artifact directories are created by the workers that write into them (the `write` tool auto-creates parent directories); the deepresearch program's preflight and collector contract now say so explicitly.
- `bench workflow` now streams the orchestrator's progress (assistant text, tool calls, tool results) to the terminal and run.log as the run executes, instead of staying silent until the end. Ctrl-C now stops pi cleanly, records the run as interrupted, and still writes artifacts (a second Ctrl-C force-quits).
- Capped `subagent` parallel mode at 4 concurrent workers (was 100) to match LM Studio's request concurrency; larger fan-outs batch across successive calls (see docs/proposals.md P2).
- Consolidated the 16 files under `docs/` into a 9-page MkDocs site (`mkdocs.yml`, Material theme) deployed to GitHub Pages on push to `main` (`.github/workflows/docs.yml`); merged presets/agent-presets/custom-presets/preset-catalog into `presets.md`, the three workflow docs into `workflows.md`, skill-builder into `skills.md`, and runtime-env/bootstrap/commands/validation into `runtime.md`.
- Moved `FEATURES.md` into the docs site as `docs/features.md`; rewrote it as a concise feature summary.
- Rewrote `README.md` (fixed the truncated sentence, moved terminal color-depth details into `docs/branding.md`) and slimmed `AGENTS.md` to agent-facing conventions that link to the docs site for process detail.
- Removed the `postinstall` hello-world placeholder script.
- Web preset and path-promoted skill docs now state that skill CLIs run via bash, not as Pi tools named after the skill.
- MYPI session header shows only with an active preset (subtitle: `preset · project-dir`); removed `/flow-title` and `/flow-title-builtin`; header syncs from preset `activate`/`deactivate` via `syncFlowHeader`.
- Consolidated PR review prompts into one merge-readiness prompt and updated the pull request template to match the workflow.
- Moved agent prompt resources into `shared/prompts/`, tool extensions into `extensions/tools/`, and package bootstrap code into `extensions/preset/bootstrap.ts`.
- Preset activation now applies configured model, thinking level, scoped environment overrides, and best-effort context-file exclusion.
- The templated prompt base now keeps generated tools, context, and skills without inheriting Pi's default prose; web, write, and scout use it.
- Rewrote docs as current-state package specs instead of refactor notes.

### Fixed

- Fixed `subagent` counting dead workers as successes: a worker that hit the output-token ceiling (`stopReason: "length"`) or exited with an empty final reply was reported as "completed" (deepresearch bench Failure 1). Both now count as failures, and failure lines state the reason (exit code, output-token limit, aborted, empty reply).
- Fixed `--debug-system-prompt` printing pi's vanilla prompt instead of the preset's composed prompt: the handler lived in `mypi-branding` (loaded first) and captured the prompt before the preset extension rewrote it. It is now a standalone extension loaded last, so dumps include preset composition and the workflow worker catalog, and it reports the real active preset name instead of `null`.
- Fixed the `subagent` and `questionnaire` tools rejecting calls with "not enabled for the active preset" even when a workflow preset was active: Pi loads each extension with an isolated module graph, so the preset extension's in-memory activation state was invisible to the tool extensions. Active-preset state now lives on a process-wide global.
- Fixed the MYPI session header so `pi --preset <name>` activates it without depending on shared in-memory preset state across extensions.
- Fixed command argument completions for `/preset` and `/mypi-env-config` so accepting an inline completion does not crash the interactive editor.

### Removed

### Security

## [0.0.2] - 2026-05-20

- Initial tracked version baseline.
