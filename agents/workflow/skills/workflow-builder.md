---
name: workflow-builder
description: Build a project-level workflow prompt meant for a multi-agent orchestrator to follow step-by-step, calling subagents for each phase.
disable-model-invocation: true
---

# Workflow Builder

Help the user create, troubleshoot, enhance, or revise a `mas` workflow prompt stored in a **durable** location. Do **not** write or modify files under the bundled dot-pi git tree (`$DOT_PI_DIR/agents/mas/prompts/` or any path inside `$DOT_PI_DIR` that ships with the package): those files are wiped or reset on **`pi update`**. Contributing bundled prompts is out of scope for this workflow (use a normal maintainer PR).

## Goal

Turn a workflow idea, bug report, rough draft, or existing workflow into a coherent prompt-template file that `mas` can run. The result should be a durable artifact on disk, not just advice in chat.

**Default storage:** `$DOT_PI_OVERLAY/mas/prompts/<slug>.md` (when `$DOT_PI_OVERLAY` is unset, this is typically `~/.pi/dot-pi/mas/prompts/<slug>.md`). These prompts apply whenever `mas` runs, regardless of current working directory.

**Optional storage:** `.pi/prompts/<slug>.md` under the current working directory—project-only, useful when the workflow should live in the repo with the project.

## Required Trajectory

Follow these phases in order. Do not skip the review checkpoint before writing unless the user explicitly supplied a complete approved spec and asked you to write it directly.

### 1. Preflight

- Parse the user request at the end of this prompt for:
  - create vs modify mode
  - desired workflow name or existing workflow path
  - **storage tier**: durable `mas` overlay vs project-local `.pi/prompts/`, unless already explicit in the user text
  - workflow goal, expected user inputs, artifact outputs, quality gates, stop conditions, and known pain points
  - whether the workflow should read local files, edit files, run commands, browse the web, write reports, or ask for user choices
- Derive `<slug>` as lowercase kebab-case from the workflow name. Resolve the **target path** from storage tier:
  - **Overlay (default):** `$DOT_PI_OVERLAY/mas/prompts/<slug>.md`
  - **Project-local:** `.pi/prompts/<slug>.md` (relative to current working directory)
- If the user did **not** clearly specify overlay vs project-local, use `questionnaire` before invoking workers. Offer: durable overlay (survives `pi update`, available in every project with `mas`), project-only under `.pi/prompts/` (stays in the repo/cwd), or cancel. Skip this questionnaire when the user already stated their choice.
- If the user points at an existing file to modify: if that path is under `$DOT_PI_DIR/agents/mas/prompts/` (bundled), **do not** write there. Use `questionnaire` to choose overlay or project destination; you may read the bundled file as a read-only source and copy its intent into the new durable path.
- If the request does not identify whether to create or modify, or lacks enough intent to design the workflow responsibly, use `questionnaire` before invoking workers.
- If the requested filename already exists at the chosen target and the user did not ask to modify it, use `questionnaire` to choose overwrite, revise existing, pick a new name, or stop.
- After worker delegation begins, do not use `questionnaire` except at the explicit review checkpoints in this workflow.

### 2. Load Workflow Guidance

Before drafting the workflow spec, use your own tools to read:

- `$DOT_PI_DIR/docs/workflow-writing-guide.md`

If the guide is missing or insufficient for the request, also consult only the needed parts of:

- `$DOT_PI_DIR/docs/reference/multi-agent-systems.md`
- `$DOT_PI_DIR/docs/design/top-level-agent-mas.md`
- `$DOT_PI_DIR/agents/mas/prompts/deepresearch.md`
- `$DOT_PI_DIR/agents/mas/prompts/pdf-ocr.md`

Reading example files under `$DOT_PI_DIR/agents/mas/prompts/` is allowed for reference only. Do not use `writer` or `coder` to change those paths.

Use these references to enforce capability boundaries, artifact handoffs, validation phases, stop conditions, and final user request handling.

### 3. Inspect Existing Context

Use your own `ls` / `find` / `grep` / `read` tools, or call `scout` for read-only exploration, to inspect relevant context:

- `.pi/prompts/` for existing project-local workflows
- `$DOT_PI_OVERLAY/mas/prompts/` for existing overlay workflows (resolve `$DOT_PI_OVERLAY` from the environment)
- the existing workflow file when modifying (path from the approved spec)
- nearby project docs or artifacts mentioned by the user

If using `scout`, ask it only to locate and summarize local files. Do not ask it to edit, run commands, or browse the web.

For modify mode, read the current workflow before proposing changes. Preserve useful existing behavior unless the user asks to replace it.

### 4. Draft Review Spec

Present a concise workflow spec to the user before writing files. Include:

- workflow name, storage tier, and **full target path**
- create or modify mode
- user input expected in the final user request section
- phases and delegation plan
- worker capability mapping (`ask`, `scout`, `writer`, `coder`, `web`)
- artifact conventions and ownership
- validation and repair passes
- stop conditions and final response shape
- assumptions, risks, and open choices

Then use `questionnaire` to ask whether the user approves the spec, wants revisions, wants to rename the workflow, or wants to cancel. If the user requests revisions, update the spec and ask again. Keep iterating until the user approves or cancels.

Stop if the user cancels. Do not write a workflow from an unapproved spec.

### 5. Prepare Prompt Directory

Prepare the parent directory for the **approved target path** only.

**If the target is project-local** (`.pi/prompts/<slug>.md`): confirm `.pi/prompts/` exists under the current working directory. If it does not exist, call `coder` once with a tightly scoped task equivalent to:

```text
Create the project prompt directory `.pi/prompts/` in the current working directory if it does not already exist.

Constraints:
- Do not create or modify any other files.
- Do not initialize config, install packages, or run unrelated commands.

Reply with the directory path and whether it was created or already existed.
```

**If the target is overlay** (`$DOT_PI_OVERLAY/mas/prompts/<slug>.md`): confirm `$DOT_PI_OVERLAY/mas/prompts/` exists. It is usually created by install/relink. If it is missing, call `coder` once with a tightly scoped task equivalent to:

```text
Create the directory `$DOT_PI_OVERLAY/mas/prompts/` if it does not already exist (use the actual expanded value of `$DOT_PI_OVERLAY` from the environment).

Constraints:
- Do not create or modify any other files or directories.
- Do not write under `$DOT_PI_DIR/agents/mas/prompts/` or any other bundled package path.
- Do not initialize config, install packages, or run unrelated commands.

Reply with the directory path and whether it was created or already existed.
```

If directory creation fails, stop and report the blocker.

### 6. Write Or Revise Workflow

Call `writer` once to create or revise the workflow file. The writer task must include the **approved absolute or workspace-relative target path** (expand `$DOT_PI_OVERLAY` for overlay so `writer` receives a concrete path). The writer task must include:

```text
You are writing a `mas` workflow prompt template.

Target path: <approved-target-path>
Mode: create new | revise existing

Use the approved spec below and write a coherent markdown workflow prompt.

Requirements:
- Follow dot-pi workflow conventions.
- Make the workflow orchestration policy, not capability grants.
- Include explicit phases, worker delegation contracts, artifact conventions, validation, stop conditions, and final response guidance.
- End with a `## User Request` section that contains the standard user input block. The placeholder line must be the dollar-at token, written as a dollar sign immediately followed by an at sign, and it should appear only in that final block.
- For modify mode, preserve useful existing behavior and improve only what the approved spec requires.
- Do not edit any file other than the single target path above.
- Return a concise confirmation with the written path, major changes, and any unresolved caveats.

Approved spec:
<paste approved spec>

Existing workflow, if modifying:
<paste relevant existing content or summary>
```

If the workflow needs command execution or generated non-prose assets during writing, stop and explain why the requested workflow is outside `writer`'s scope instead of silently switching workers.

### 7. Validate Written Workflow

After `writer` returns, use your own `read` tool to inspect the **approved target path**.

Validate that it has:

- a clear title and goal
- a required trajectory or equivalent phase structure
- explicit worker delegation matched to structural capabilities
- artifact conventions when files are produced
- stop conditions
- validation or review guidance
- final response guidance
- `## User Request`
- the dollar-at placeholder appearing only in the final user request block

If validation fails, run one repair pass with `writer`, then read the file again. If it still fails, stop with the file path and remaining issues.

If you use `ask` with persona `judge` for an additional semantic check, pass the workflow excerpt and checklist inline. Never ask `ask` to inspect the file path.

## Artifact Conventions

- **Bundled** (`$DOT_PI_DIR/agents/mas/prompts/`): shipped with dot-pi; **never** write or modify via this workflow.
- **Overlay (default for new workflows):** `$DOT_PI_OVERLAY/mas/prompts/<workflow-name>.md` — durable, survives `pi update`, loaded for every `mas` session.
- **Project-local (opt-in):** `.pi/prompts/<workflow-name>.md` — scoped to the current project directory.
- Workflow names should be lowercase kebab-case.
- Do not create project-local subagents, skills, or config files unless the user explicitly expands the scope.

## Stop Conditions

- The user cancels at a questionnaire checkpoint.
- The workflow idea is too ambiguous and the user declines to clarify.
- The target file collision cannot be resolved.
- The required parent directory for the chosen target cannot be created.
- The requested workflow requires structural capabilities not available to the `mas` worker catalog.
- Validation fails after one repair pass.

## Final Response

Keep the final response short. Prefer one of:

- Overlay: `Workflow written to $DOT_PI_OVERLAY/mas/prompts/<workflow-name>.md` (or the expanded path). Run it with `/<workflow-name> ...` from `mas`.
- Project-local: `Workflow written to ./.pi/prompts/<workflow-name>.md. Run it with /<workflow-name> ... from mas in this project.`

If the workflow was modified, mention the path and the most important change. If the workflow stopped early, state the blocker and any partial artifact path.

## User Request

Treat the text below as the user's instructions for creating, troubleshooting, enhancing, or revising a `mas` workflow prompt (overlay or project-local per this template).

**User prompt:**
`$@`
