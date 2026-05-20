# Workflow Builder

Workflow prompts are reusable natural-language programs for the `workflow` preset. They define an execution graph: phases, worker choices, artifact state, checkpoints, branches, validation gates, stop conditions, and final output.

## Location

Package workflow prompts live in:

```text
shared/prompts/workflow/
```

User-authored workflow prompts should live outside preset directories and be exposed through `promptFiles` or `promptDirs` in a preset overlay.

## Authoring Rules

- Name the workflow goal, expected artifacts, and stop conditions.
- Use worker presets by capability: `scout`, `code`, `write`, `web`, `chat`, `classifier`, `judge`, or more specific custom presets.
- Pass enough context to each worker. Do not ask workers without filesystem or web tools to inspect paths, URLs, commands, or runtime state.
- Prefer file artifacts for long outputs and concise worker replies for handoff.
- Use `questionnaire` only for preflight clarification or explicit human checkpoints.
- Treat the final response as program output: keep it short and point to artifacts on disk when artifacts are produced.

## Canonical Template

New workflow prompts should use this shape unless the workflow is intentionally tiny:

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

- Worker: `<preset name>`
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

## Worker Boundaries

The parent orchestrator owns the conversation. Workers are implementation units. A worker task should include:

- exact objective
- allowed inputs and paths
- output artifact path when relevant
- expected side effects
- return value shape
- success criteria
- blocker criteria
- next transition the return value will inform

## Default User Prompt Location

User prompt libraries may be stored under:

```text
~/.pi/mypi/prompts/
```

Expose them by adding the directory to a user preset overlay.

## Review Checklist

- The workflow can be resumed or inspected from its artifacts.
- Each worker has the tools needed for the assigned task.
- The prompt avoids hidden context assumptions.
- The final output is grounded in produced artifacts or cited evidence.
- The prompt uses presets, `subagent`, and current trace paths throughout.
