# Workflows

A workflow prompt is an executable program written in natural language. The `workflow` preset is its interpreter and scheduler; the `subagent` tool is its function-call primitive. Workflow prompts define an execution graph — phases, worker choices, artifact state, checkpoints, branches, validation gates, stop conditions, and final output — and the orchestrator advances through it by delegating bounded tasks to worker presets.

## Activation

The orchestrator extension is package-loaded, but the `subagent` tool only works when the active preset declares it:

```yaml
extensions:
  - workflow-orchestrator
workers:
  - chat
  - classifier
  - judge
  - scout
  - write
  - code
  - web
```

The preset's `workers:` list is the allowed worker catalog — the orchestrator does not infer workers from every installed preset. Before the agent starts, the extension appends a generated catalog of allowed workers to the system prompt.

## Running A Workflow

Workflow presets are intended to start from fresh context:

```text
/new
/preset workflow
/deepresearch <topic>
```

If a workflow preset is restored into a branch with existing user messages, mypi clears the preset state and asks you to run `/new` first.

## Worker Launching

Each `subagent` call launches a worker as a fresh process from the parent's working directory:

```text
pi --preset <worker> --model <parent session's model> -p "<task>"
```

Workers inherit the parent session's model rather than the global default, so an orchestrator run on a non-default model (e.g. a bench `--model` override) keeps its whole worker fleet on that model instead of thrashing loads between two models on a memory-constrained server. A preset that pins its own `provider`/`model` still overrides this at activation.

This is the core context-isolation move for weak local models: every worker starts with a clean context containing only its preset prompt and the delegated task. Workers receive an operational wrapper explaining that they report to the orchestrator, not the user, and should return concise status, artifact paths, blockers, errors, and verification notes. Workers cannot spawn their own subagents — delegation depth is exactly one level, which keeps multi-agent runs predictable on weaker models.

## `subagent` Parameters

The tool supports exactly one mode per call:

- **single** — `agent` and `task`.
- **parallel** — `tasks[]`, an array of `{agent, task}` pairs run concurrently. Capped at **4** concurrent workers, matching LM Studio's request concurrency limit (see [Proposals](proposals.md) for the reasoning).
- **chain** — `chain[]`, sequential calls where later tasks may use `{previous}` to splice in the prior worker's final reply. Prefer file handoffs for anything long; `{previous}` inlines the entire previous reply into the next task.

`agent` must be in the active preset's `workers:` list.

Each call behaves like a function invocation:

- `agent` selects the worker preset.
- `task` is the argument payload.
- Files, manifests, screenshots, and traces are side effects.
- The worker's final reply is the return value.
- Nonzero exit, blocker text, missing artifact, or failed validation is an error return.

## Trace Behavior

Each workflow run writes traces under:

```text
<cwd>/.pi/subagent-traces/<run-id>/
```

The trace directory is workflow execution state: it contains `manifest.json` (per-worker task, timing, exit code, truncated final reply, usage/cost) and worker session output. The parent session also records a `mypi.subagent-traces` custom entry whose `data.traceDir` is the canonical trace location.

## Workflow Library

Package workflow prompts live in `shared/prompts/workflow/` and are exposed by the `workflow` preset:

- `deepresearch.md` — citation-backed research: source scouting, one-source-per-collector capture, draft synthesis, editorial review, grounded validation.
- `pdf-ocr.md` — PDF acquisition/rendering/OCR workflow.
- `paper-ocr.md` — research-paper OCR plus embedded figure extraction.
- `kid-story.md` — small multi-worker handoff demonstration.
- `retro.md` — retrospective analysis of workflow traces.

## Authoring Workflow Prompts

User-authored workflow prompts should live outside the package (e.g. `~/.pi/mypi/prompts/`) and be exposed through `promptFiles` or `promptDirs` in a preset overlay.

Authoring rules:

- Name the workflow goal, expected artifacts, and stop conditions.
- Use worker presets by capability: `scout`, `code`, `write`, `web`, `chat`, `classifier`, `judge`, or more specific custom presets.
- Pass enough context to each worker. Never ask a worker without filesystem or web tools to inspect paths, URLs, commands, or runtime state — `chat`, `classifier`, and `judge` must receive all material inline.
- Prefer file artifacts for long outputs and concise worker replies for handoff.
- Use `questionnaire` only for preflight clarification or explicit human checkpoints.
- Treat the final response as program output: keep it short and point to artifacts on disk.

### Canonical Template

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

### Worker Boundaries

The parent orchestrator owns the conversation. Workers are implementation units. A worker task should include: exact objective, allowed inputs and paths, output artifact path when relevant, expected side effects, return value shape, success criteria, blocker criteria, and the next transition the return value will inform.

### Review Checklist

- The workflow can be resumed or inspected from its artifacts.
- Each worker has the tools needed for its assigned task.
- The prompt avoids hidden context assumptions.
- The final output is grounded in produced artifacts or cited evidence.
- The prompt uses presets, `subagent`, and current trace paths throughout.

!!! note "Proposed: explicit on-disk instruction pointer"
    Today the orchestrator tracks its position in the workflow graph implicitly, in context. A proposal to externalize that state to a per-run plan file — so weaker models *read* where they are instead of *remembering* where they are — is documented in [Proposals](proposals.md). Workflow authors can already approximate it by adding a "maintain a phase-checklist file" instruction to their prompts.
