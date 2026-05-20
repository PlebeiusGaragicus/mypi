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
5. Draft a concise review spec before writing. Include program contract, expected user inputs, workflow state, execution graph, worker function calls, artifacts, validation gates, stop conditions, and final output shape.
6. Use `questionnaire` for important approval or destination choices when the workflow preset provides it.
7. Write only the approved target file.
8. Read the written file and validate title, program contract, execution graph, worker contracts, artifact conventions, validation gates, stop conditions, final output guidance, and a final `## User Request` section.

## Canonical Workflow Program Shape

Use these sections for new workflow prompts unless the user asks for a smaller format:

```markdown
# Workflow Name

## Program Contract

- Goal:
- Inputs:
- Outputs:
- Invariants:
- Stop conditions:

## State And Artifacts

- Artifact root:
- Manifests:
- Trace expectations:
- Durable outputs:

## Execution Graph

### 1. Node Name

- Worker:
- Inputs:
- Task payload:
- Side effects:
- Return value:
- Success:
- Errors/blockers:
- Next transition:

## Validation Gates

- Gate:
- Evidence required:
- Repair path:

## Final Output

- Include:
- Omit:

## User Request

`$@`
```

## Worker Names

Use preset names for workers. The default workflow preset currently exposes:

- `chat`
- `classifier`
- `judge`
- `scout`
- `write`
- `code`
- `web`

Workers are launched by the orchestrator with `pi --preset <worker>`. Use preset names, `subagent`, and current trace paths under `.pi/subagent-traces/`.

## Inventory

```text
workflow-builder/
└── SKILL.md
```
