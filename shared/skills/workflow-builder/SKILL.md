---
name: workflow-builder
description: Build or revise workflow prompt templates used by preset-based multi-agent orchestrators.
disable-model-invocation: true
---

# Workflow Builder

Help the user create, troubleshoot, enhance, or revise a workflow prompt stored in a durable location. The result should be a prompt file that an orchestrator preset can expose through `promptDirs`, not just advice in chat.

Do not write or modify files under the installed package tree. Package-shipped workflow prompts are read-only resources and may be reset by updates.

## Storage Targets

- User-wide prompts: `~/.pi/mypi/prompts/<slug>.md`
- Project-local prompts: `.pi/prompts/<slug>.md` under the current working directory, when the active orchestrator preset references `.pi/prompts` through `promptDirs`
- Package prompts: `shared/prompts/workflow/*.md`, read-only unless the user is explicitly doing package maintenance

## Required Trajectory

1. Clarify whether the user is creating a new workflow or revising an existing one.
2. Clarify the storage tier: user-wide, project-local, or package maintenance.
3. Derive a lowercase kebab-case `<slug>` from the workflow name.
4. Inspect existing workflow prompts and nearby project context when relevant.
5. Draft a concise review spec before writing. Include goal, expected user inputs, worker delegation plan, artifacts, validation, stop conditions, and final response shape.
6. Use `questionnaire` for important approval or destination choices when the workflow preset provides it.
7. Write only the approved target file.
8. Read the written file and validate title, goal, phases, worker contracts, artifact conventions, stop conditions, final response guidance, and a final `## User Request` section.

## Worker Names

Use preset names for workers. The default workflow preset currently exposes:

- `chat`
- `scout`
- `write`
- `code`
- `web`

Workers are launched by the orchestrator with `pi --preset <worker>`. Do not refer to `PI_CODING_AGENT_DIR`, `/agent-mode`, `/persona`, `mas`, `$DOT_PI_DIR`, or `$DOT_PI_OVERLAY` in new workflows unless the user is explicitly maintaining legacy content.

## Inventory

```text
workflow-builder/
└── SKILL.md
```
