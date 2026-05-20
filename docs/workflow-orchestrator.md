# Workflow Orchestrator

## Purpose

The workflow orchestrator provides multi-agent system behavior through a preset-aware extension and a `subagent` tool.

It delegates bounded tasks to worker presets, collects their outputs, and returns concise operational results to the parent orchestrator.

## Target Behavior

Any preset can become an orchestrator by declaring:

```yaml
extensions:
  - workflow-orchestrator
workers:
  - chat
  - scout
  - write
  - code
  - web
```

The `workflow-orchestrator` extension is loaded by the package but inactive unless the active preset opts into it.

Every preset that can call subagents is a workflow preset and requires a clean session. This is implied by:

```yaml
extensions:
  - workflow-orchestrator
workers:
  - scout
```

## Workflow Preset Activation

Workflow presets are activated through normal preset mechanisms:

```text
/preset <workflow-preset>
/preset
pi --preset <workflow-preset>
```

Behavior:

1. Warn that multi-agent workflows are designed to start from a fresh context, strictly follow a workflow prompt, and call subagents to keep the orchestrator context clean.
2. Ask for confirmation before clearing the active conversation.
3. On confirm, start a new session, switch to the selected workflow preset, reload resources/extensions, and show workflow branding.
4. Notify the user to run the proper workflow prompt template, for example `/deepresearch ...`.

## Worker Launching

Workers should launch by preset name:

```text
pi --preset <worker>
```

The child process should run from the same cwd as the parent so user and project overlays apply consistently.

The worker prompt should still include operational instructions:

- The worker is answering the orchestrator, not the user.
- Return concise results, artifact paths, blockers, and verification notes.
- Do not ask the user questions.
- Make safe assumptions or return a blocker.
- When necessary, and defined in the workflow, subagent issues can be addressed by the orchestrator via HITL questionaire and/or notifications to the user.

## Worker Catalog

Decision: worker catalog is explicit in the orchestrator preset's `workers:` list.

Do not infer worker presets from all installed presets, tags, or directories in v1.

Worker presets may set:

```yaml
userSelectable: false
```

This hides them from the interactive `/preset` menu and preset cycling while still allowing the orchestrator to launch them by name. Users may also explicitly activate them with `/preset <name>` or `pi --preset <name>` when debugging.

## Trace Behavior

The orchestrator should keep trace behavior, but path names should move away from legacy `mas` or hardcoded agent directory assumptions.

Desired trace properties:

- Per-run trace directory under a durable project/user location.
- Worker JSONL/session data grouped by run id.
- Manifest listing worker tasks, outputs, exit state, model, and usage.
- Parent session custom entry pointing to the trace bundle.

## Implementation Status

- `extensions/tools/workflow-orchestrator.ts` is the preset-aware orchestrator extension.
- It reads worker names from the active preset's `workers:` list.
- It launches workers with `pi --preset <worker>`.
- It appends workflow capability catalog text from preset worker names instead of `CAPABILITY.md` files.
- Current trace paths use `.pi/subagent-traces/...`.

## Decisions

- Keep the extension under `extensions/tools/workflow-orchestrator.ts`.
- Gate behavior by active preset extension ID.
- Use `workers:` from the active preset.
- Spawn workers with `pi --preset <worker>`.
- Keep `subagent` as an extension-provided tool implied by `workflow-orchestrator`.
- Use normal preset activation for workflow presets.

## Open Implementation Feedback

- Decide whether worker capability text should stay generated from preset names or grow a richer YAML field.
