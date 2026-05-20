# Changelog

All notable changes to this project will be documented in this file.

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for released versions and [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) for changelog structure.

## [Unreleased]

### Breaking Changes

- Replaced legacy `/agent-mode`, `/persona`, `SYSTEM.md`, `APPEND_SYSTEM.md`, and `PI_CODING_AGENT_DIR` worker routing with preset-defined agents in `agents/*.yml`.
- Removed `~/.pi/mypi.json` and `~/.pi/mypi/env.yml` support; mypi runtime settings now live only in `~/.pi/mypi/mypi.env`.
- Renamed the TTS speed setting from `TTS_WPM` to `SAY_TTS_WPM`.

### Added

- Started tracking notable project changes in a root changelog.
- Added a documented development workflow and lifecycle prompt set for issue/spec, planning, implementation, wrapping, PR review, changelog audit, and release preparation.
- Added `/preset` activation, flat package presets, shared workflow prompts, a shared workflow-builder skill, and preset-gated `subagent` / `questionnaire` tools.
- Added shared preset runtime validation for prompt modes, tools, extensions, workers, themes, environment keys, and flat `agents/*.yml` layout.
- Added `mypi.env.example` as the single mypi runtime settings template.
- Added `/mypi-env-config` for viewing and editing `mypi.env`.

### Changed

- Consolidated PR review prompts into one merge-readiness prompt and updated the pull request template to match the workflow.
- Moved agent prompt resources into `shared/prompts/`, tool extensions into `extensions/tools/`, and package bootstrap code into `extensions/preset/bootstrap.ts`.
- Preset activation now applies configured model, thinking level, scoped environment overrides, and best-effort context-file exclusion.

### Fixed

### Removed

### Security

## [0.0.2] - 2026-05-20

- Initial tracked version baseline.
