# Retro — MAS session retrospective

Review a completed or partial **`mas`** run from durable traces: orchestrator JSONL under the overlay plus worker JSONL under **`subagent-traces/`**. Focus on failures, bad trajectories, weak instruction following, tool errors, and multi-agent handoff issues (especially with smaller open-source models).

## Goal

Produce a concise, evidence-backed analysis of one named **`mas`** session. Prefer grounded references (paths, line excerpts, **`manifest.json`** fields) over speculation. The primary user input is the **session display name** set via **`/name`** in `mas`, which is stored in orchestrator JSONL as a **`session_info`** record with **`name`** (and **`id`**). That name may hint at what went wrong or what to emphasize.

**Correlation rule:** after you identify the orchestrator **`*.jsonl`** for that session, read a **`type: "custom"`** session line in **that same file** with **`customType`** **`dotpi.subagent-traces`** (written by **`top-level-agent-orchestrator`** on the first **`subagent`** delegation). Its **`data`** object includes **`traceRunId`** and **`traceDirRelativeToDotPiOverlay`**. Resolve the worker bundle directory as the **`DOT_PI_OVERLAY`** environment value concatenated with **`/`** and **`data.traceDirRelativeToDotPiOverlay`**, using forward slashes only. There is no symlink join key and no legacy fallback.

## Orchestrator constraints

- **`DOT_PI_OVERLAY`** is set by **`dispatch-agent`**. It is the **only** allowed filesystem root for **`mas`** overlay state in this workflow. Compose every overlay path as the value of **`DOT_PI_OVERLAY`** followed by the literal **`/`** segments this prompt names. Do **not** substitute **`~/.dotpi`**, **`~/.pi/agent`**, or any path not built from **`DOT_PI_OVERLAY`** plus those segments.
- After preflight yields a usable session **`name`** or **`id`**, your **next** action must be **exactly one** **`subagent`** invocation with **`agent`** **`scout`**. Until **`scout`** returns, do **not** call **`read`**, **`ls`**, **`find`**, or **`grep`** yourself on overlay paths, session JSONL, or trace directories.

## Required Trajectory

Follow these phases in order. Do not skip user checkpoints when this workflow says to use **`questionnaire`**.

### 1. Preflight

- Parse the user request at the end of this prompt for:
  - the **session name** string to match against **`session_info.name`**, or an explicit **`session_info.id`** if the user pasted one
  - optional focus (e.g. “tool failures only”, “orchestrator reasoning”, “worker X”)
- If the session name or id is missing or unusably vague, use **`questionnaire`** once to obtain it before delegating workers.
- After workers have been invoked, do not use **`questionnaire`** except where this workflow explicitly requires a user decision.

### 2. Cwd-key for this project

Compute **`cwd-key`** the same way **`dispatch-agent`** does:

1. Take **`ctx.cwd`** (the directory where **`mas`** is running).
2. Strip leading **`/`** characters from the normalized path.
3. Replace **every remaining path separator `/` with a single `-`**.
4. Wrap the result as **`--`** + encoded string + **`--`**. That literal is **`cwd-key`**.
5. Do **not** change spaces or other characters inside path segments; only replace **`/`**.

Use **`cwd-key`** only inside paths formed as: value of **`DOT_PI_OVERLAY`** + **`/mas/sessions/`** + **`cwd-key`** + **`/`**.

### 3. Locate session and trace bundle (`scout`) — single delegation

Call **`subagent`** with **`scout`** exactly **once**. The worker may use only **`ls`**, **`find`**, **`grep`**, and **`read`** — no shell pipelines, no **`jq`**.

Copy the following task text into the **`task`** argument. Replace the two bracketed placeholders with the exact strings from §1 and §2 (no surrounding spaces inside the brackets).

```text
All filesystem paths must be built from the host environment variable DOT_PI_OVERLAY only (this worker process inherits it). Concatenate its value with the literal path segments below. Do not restrict search to the current git project tree.

Placeholders for the orchestrator to replace before sending this task:
[CWD_KEY] = the exact cwd-key string from the parent workflow §2.
[SESSION_MATCH] = the exact session_info name or id string from the parent workflow §1.

Steps:
1. Let O equal the value of environment variable DOT_PI_OVERLAY. The sessions directory is O + /mas/sessions/ + [CWD_KEY] + /
   Under that directory only, use grep on *.jsonl files for lines that include type session_info and include [SESSION_MATCH] as the name or id field, so random prose lines are not matches. Report the absolute path to the chosen .jsonl and a short matching line excerpt.
2. On that same .jsonl path, grep for a line containing type custom and customType dotpi.subagent-traces (allow minor JSON spacing variants). Report an excerpt that includes data.traceRunId and data.traceDirRelativeToDotPiOverlay.
3. Trace directory: O + / + the data.traceDirRelativeToDotPiOverlay value from step 2 (forward slashes only). Use ls or read to confirm manifest.json exists there. Report traceRunId, absolute path to manifest.json, and the list of worker *.jsonl files in that directory.
```

If step 2 finds **no** **`dotpi.subagent-traces`** custom entry, **`scout`** must report a blocker: that session never recorded a trace pointer (no **`subagent`** delegation with a **`mas`** build that writes this entry).

If **`scout`** finds no **`session_info`** match under the **`cwd-key`** sessions directory, use **`questionnaire`** to widen the name, try a different id, or cancel.

If multiple **`session_info`** rows still tie-break badly, use **`questionnaire`**.

### 4. Analysis (`coder`)

Call **`coder`** once for **read-only** work (no edits to the user’s project repo, no new files unless the user explicitly asked for a saved report path).

The **`coder`** task must:

- Use the orchestrator **`*.jsonl`** path and the **`subagent-traces/<run-id>/`** tree from §3. Read the orchestrator log at the canonical path from §3 step 1.
- Use **`jq`**, **`grep`**, **`head`**, **`tail`**, **`wc`** as needed. Do **not** run destructive commands.
- Summarize: non-zero **`exitCode`** on **`manifest.json`** workers, **`stderr`**, **`errorMessage`**, **`stopReason`**, failed tool / **`isError`** patterns in worker JSONL, and orchestration issues (wrong worker choice, skipped validation, vague handoffs).
- Add **prioritized recommendations** and brief instruction-following / model-quality notes (bounded excerpts only — not full file dumps).

This **`coder`** pass replaces a separate **`ask`/judge** step: the analysis and critique are delivered here.

### 5. Final Response (orchestrator)

Reply briefly in chat:

- Orchestrator **`*.jsonl`** path and **`subagent-traces/<run-id>/`** reviewed.
- Top findings with severity.
- Optional next step (e.g. adjust a workflow prompt, change model).

Do not paste entire JSONL files unless the user explicitly asked.

## Artifact Conventions

- **Orchestrator sessions:** value of **`DOT_PI_OVERLAY`** + **`/mas/sessions/<cwd-key>/*.jsonl`**
- **Trace pointer:** in-session **`custom`** entry **`dotpi.subagent-traces`** (not shown to the LLM) with **`data.traceRunId`** and **`data.traceDirRelativeToDotPiOverlay`**.
- **Worker traces:** value of **`DOT_PI_OVERLAY`** + **`/`** + **`data.traceDirRelativeToDotPiOverlay`** + **`/manifest.json`** and worker **`*.jsonl`** alongside it.
- Optional saved report: only if the user asked for a file path; otherwise **`writer`** is not required.

## Stop Conditions

- Missing session name/id after **`questionnaire`**.
- No **`session_info`** match under the **`cwd-key`** **`sessions/`** directory.
- No **`dotpi.subagent-traces`** custom entry in the matched orchestrator JSONL (stop with blocker).
- **`coder`** unavailable or blocked — report blocker; do not invent analysis.

## Final Response

Keep the final response short. Prefer a one-paragraph summary plus bullets for the worst issues with evidence pointers (path + hint).

## User Request

Treat the text below as the retrospective request: session **`/name`** (or **`session_info.id`**), optional focus, and any scope limits.

**User prompt:**
`$@`
