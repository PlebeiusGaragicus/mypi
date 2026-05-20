# Workflow Builder

## Purpose

The workflow-builder feature helps users create or revise workflow prompt templates for a multi-agent orchestrator.

This feature is currently represented by the `workflow-builder` skill, but the preset refactor changes the storage and invocation model around it.

## Target Behavior

Workflow building should produce durable workflow prompt files, not just chat advice.

The workflow builder should:

- Clarify whether the user is creating or modifying a workflow.
- Clarify where the workflow should live.
- Draft a review spec before writing.
- Use a questionnaire-like interaction for important choices.
- Write only the approved target file.
- Validate the written workflow against the agreed structure.

## Storage Model After Presets

Legacy `mas` terminology should become preset-driven workflow terminology.

Target locations:

- Package-shipped workflow prompts: read-only package resources.
- User-wide workflow prompts: a prompt directory referenced by the orchestrator preset, such as `~/.pi/mypi/prompts/`.
- Project workflow prompts: Pi-native `.pi/prompts/`, referenced by the orchestrator preset through `promptDirs`.

The workflow builder should not write into the installed package tree because those files can be reset by update.

## Relationship To Agent Presets

A workflow prompt is a prompt resource used by an orchestrator preset.

The orchestrator preset declares:

```yaml
extensions:
  - workflow-orchestrator
workers:
  - scout
  - write
  - code
```

The workflow prompt describes the step-by-step orchestration policy, artifact conventions, worker delegation contracts, validation passes, and final response behavior.

## Current Code/Spec Conflicts

- `shared/skills/workflow-builder/SKILL.md` now describes preset-based workflow prompt locations and worker names.
- The current workflow-builder skill uses `.pi/prompts/` as the project-local prompt target; this remains reasonable if the orchestrator preset references `.pi/prompts` in `promptDirs`.
- The skill references docs paths such as `$DOT_PI_DIR/docs/workflow-writing-guide.md`; the new docs live under this repo's `docs/` directory and need updated references.
- It references worker names `chat`, `scout`, `write`, `code`, and `web`, which remain valid as preset names but should be launched through `pi --preset <worker>`.

## Decisions

- Keep workflow building as a skill/prompted workflow, not a hardcoded extension.
- Treat workflow prompts as resources owned by an orchestrator preset.
- Do not write into package-installed resources.
- Keep explicit review checkpoints before writing workflow files.

## Open Implementation Feedback

- Choose the default durable user workflow location under `~/.pi/mypi`.
- Decide the default user-wide prompt directory, likely `~/.pi/mypi/prompts/`.
- Update the workflow-builder skill after the preset loader and final resource layout are implemented.

