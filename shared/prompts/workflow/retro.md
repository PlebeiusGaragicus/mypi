# Retro — workflow session retrospective

Review a completed or partial mypi workflow run from durable traces. Focus on failures, weak handoffs, bad worker selection, tool errors, missing validation, and instruction-following issues.

## Program Contract

- Inputs: trace directory, trace run id, session name, session id, or description of the workflow run plus optional focus.
- Outputs: concise retrospective findings grounded in traces and parent-session evidence.
- State: trace bundle, `manifest.json`, parent session JSONL path when found, worker outputs, and analysis notes.
- Invariants: analysis is evidence-backed; workers do not modify the project; final response is the retrospective artifact unless the user asks for a file.
- Stop conditions: missing run identifier after clarification, no trace bundle, unavailable `code`, or insufficient evidence.

## Execution Graph

1. Preflight parses the run identifier and focus.
2. `scout` locates trace and parent-session evidence.
3. `code` analyzes manifest, worker outputs, and parent session logs read-only.
4. Final output reports findings, evidence paths, and recommended changes.

## Trace Model

The workflow orchestrator writes worker traces under:

```text
<session cwd>/.pi/subagent-traces/<run-id>/
```

On the first `subagent` delegation, the parent session receives a custom entry:

```text
customType: mypi.subagent-traces
data.traceRunId
data.traceDir
data.cwdSessionKey
```

Use `data.traceDir` directly when available. The trace directory contains `manifest.json` plus worker session output created by `pi --preset <worker>`.

## Goal

Produce a concise, evidence-backed analysis of one named workflow session. Prefer grounded references (paths, excerpts, `manifest.json` fields) over speculation. The user may provide a session name, session id, trace run id, trace directory, or a general description of the run.

## Required Trajectory

Follow these phases in order. Use `questionnaire` only when this workflow explicitly asks for user input.

### 1. Preflight

Parse the user request at the end of this prompt for:

- a trace directory, trace run id, session name, or session id
- optional focus, such as tool failures only, orchestrator reasoning, or a specific worker

If the request does not identify a run clearly enough, use `questionnaire` once to ask for the missing trace path, run id, or session name before delegating workers.

### 2. Locate Session And Trace Bundle (`scout`)

Call `subagent` with `agent: scout` exactly once. The scout should locate the trace bundle and, if possible, the parent session JSONL that contains the `mypi.subagent-traces` entry.

Use this task shape:

```text
Find the mypi workflow trace bundle for this retrospective request:

[SESSION_OR_TRACE_MATCH]

Search strategy:
1. If the input is an existing trace directory, inspect it directly.
2. If the input is a run id, look under the current cwd at .pi/subagent-traces/<run-id>/.
3. If the input is a session name or id, search available Pi session JSONL files for session_info lines matching it, then look in the same session for customType mypi.subagent-traces.
4. Report the parent session JSONL path if found, the traceRunId, the absolute traceDir, whether manifest.json exists, and the worker files or manifest workers present.

Use only read-only discovery commands and file reads. Do not modify files.
```

If scout cannot identify a trace bundle, use `questionnaire` to widen the run identifier or cancel.

### 3. Analysis (`code`)

Call `subagent` with `agent: code` once for read-only analysis.

The `code` task must:

- Read `manifest.json` and available worker outputs under the trace directory.
- Read the parent session JSONL if scout found one.
- Summarize non-zero `exitCode`, `stderr`, `errorMessage`, `stopReason`, failed tool results, and suspicious orchestration patterns.
- Identify wrong worker choice, skipped validation, vague task handoffs, repeated retries, or evidence-free final claims.
- Add prioritized recommendations with bounded excerpts only.

Do not edit the user's project repo. Do not paste entire JSONL files unless the user explicitly asks.

### 4. Final Output

The final response is the program output for this retrospective. Reply briefly with:

- parent session path, if found
- trace directory reviewed
- top findings with severity
- recommended prompt or orchestration changes

## Stop Conditions

- Missing run identifier after one `questionnaire` clarification.
- No trace bundle found.
- `code` unavailable or blocked.
- Evidence is insufficient to support a finding.

## User Request

Treat the text below as the retrospective request.

**User prompt:**
`$@`
