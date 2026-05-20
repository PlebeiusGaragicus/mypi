# mypi Refactor Specs

This directory tracks the specs for aligning `mypi` around preset-defined agents, shared skills, workflow orchestration, and bundled UI behavior.

## Feature Specs

- [Agent Presets](agent-presets.md): YAML-only per-agent definitions, resource references, prompt modes, tool lists, extension activation, environment overlays, and migration from `/agent-mode` / personas.
- [Skill Builder](skill-builder.md): conventions for creating and reviewing Pi skills, including prompt-visible vs command-only skills, path promotion, and environment-backed tools.
- [Workflow Builder](workflow-builder.md): workflow prompt authoring flow and how it should move from legacy `mas` overlay assumptions to preset-driven workflows.
- [Workflow Orchestrator](workflow-orchestrator.md): multi-agent system orchestration, `workers:` catalogs, `subagent` behavior, and migration of the current workflow extension.
- [Browser Control](browser-control.md): large browser-control skill/runtime behavior and its bootstrap requirements.
- [Branding](branding.md): global mypi UI/quality-of-life extensions and what remains intentionally preset-independent.

## Current Refactor Posture

These docs are decision records for an in-progress refactor. Each page calls out:

- Target behavior.
- Current code that conflicts with the target.
- Ambiguity or feedback still needed before implementation.

## Shared Configuration

The target user-level configuration file is:

```text
~/.pi/mypi/env.yml
```

The package should ship `env.yml.example` as the definitive list of environment variables and simple user-tunable values used by mypi skills, scripts, and extensions.

