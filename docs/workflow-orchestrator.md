# Workflow Orchestrator

The workflow orchestrator is the preset-gated extension that provides the `subagent` tool. It lets the workflow preset execute natural-language workflow programs by delegating graph nodes to worker presets and tracking their returns, side effects, and traces.

## Activation

The extension module is package-loaded, but the tool only works when the active preset declares:

```yaml
extensions:
  - workflow-orchestrator
workers:
  - scout
  - code
```

The active preset's `workers:` list is the allowed worker catalog. The orchestrator does not infer workers from every installed preset.

## Worker Launching

Workers are launched from the parent's current working directory:

```text
pi --preset <worker>
```

Each worker receives an operational wrapper prompt explaining that it reports to the orchestrator, not directly to the user. Workers should return concise status, artifact paths, blockers, errors, and verification notes.

## Execution Model

The workflow prompt is the program. The workflow preset is the interpreter and scheduler. `subagent` is the function-call primitive.

Each call has:

- `agent`: worker preset to run
- `task`: argument payload
- side effects: files, manifests, screenshots, traces, or other artifacts
- return value: worker final reply
- error return: nonzero exit, blocker text, missing artifact, or failed validation

The orchestrator uses worker returns and artifact state to advance the workflow graph.

## `subagent` Parameters

The tool supports exactly one mode per call:

- single: `agent` and `task`
- parallel: `tasks[]`
- chain: `chain[]`, where later tasks can use `{previous}`

`agent` must be in the active preset's `workers:` list. Every worker is a preset, and the orchestrator launches it directly with `pi --preset <agent>`.

## Trace Behavior

Each workflow run writes traces under:

```text
<cwd>/.pi/subagent-traces/<run-id>/
```

The trace directory is workflow execution state. It contains `manifest.json` and worker session output. The parent session also gets a custom entry:

```text
customType: mypi.subagent-traces
data.traceRunId
data.traceDir
data.cwdSessionKey
```

Use `data.traceDir` as the canonical trace location.

## Clean Sessions

Workflow presets are intended to start from fresh context. If a workflow preset is restored into an active branch with existing user messages, mypi clears that preset state and asks the user to run `/new`, then select the workflow preset again.

## Worker Catalog Prompt

Before the agent starts, the extension appends a generated catalog of allowed worker presets to the system prompt. The catalog is derived from the active preset's `workers:` list.
