# Agent Presets

## Goal

Replace the current split between `/agent-mode`, chat personas, workflow agents, and hardcoded per-agent extension behavior with preset-defined agents.

A preset is a complete agent profile. It can define:

- System prompt behavior.
- Pi built-in tools.
- Preset-aware extension activation.
- Skills, slash prompts, themes, and other resources by reference.
- Model and thinking level.
- Workflow/subagent behavior.

Agents are defined strictly in YAML. Larger resources such as skills, prompts, scripts, and assets live outside the agent definition and are referenced by path.

## Agent Definition Files

Decision: agents are defined per preset, not in one central `agent-presets.yml`.

Within any mypi agent source root, a preset is defined as:

```text
agents/<preset>.yml
```

When the source root is a project-local `.pi/mypi` directory, those become:

```text
.pi/mypi/agents/<preset>.yml
```

Preset-owned directories are intentionally not part of the v1 model. Do not define:

```text
.pi/mypi/agents/<preset>/
agents/<preset>/
```

If a preset needs skills or prompt templates, list existing resource locations in `skillDirs`, `promptFiles`, or `promptDirs`.

## Source Layers

Preset sources are loaded least-local to most-local. More-local scalar fields win, while capability-bearing lists are additive.

Target source order:

1. Package defaults from this installed package.
2. User-wide overlay under `~/.pi/mypi/`.
3. Project overlays discovered by walking from `cwd` up to `$HOME` and loading any `.pi/mypi/` source roots.

Example project walk:

```text
~/Documents/.pi/mypi/agents/scout.yml
~/Documents/project-abcd/.pi/mypi/agents/scout.yml
~/Documents/project-abcd/subject/paper/
```

If cwd is `~/Documents/project-abcd/subject/paper`, both overlays are loaded and the deeper one wins for scalar fields.

## Merge Semantics

Scalars replace:

- `description`
- `userSelectable`
- `provider`
- `model`
- `thinkingLevel`
- `includeContextFiles`
- `theme`
- scalar prompt fields

Capability-bearing lists are additive:

- `includeTools`
- `extensions`
- `skillDirs`
- `promptFiles`
- `promptDirs`
- `workers`

Do not redefine an existing preset to be more restrictive. If a user wants a smaller variant of `scout`, they should create `scout-lite` or another new preset name.

Preset files are the only agent definition files. This avoids drift between YAML and adjacent `SYSTEM.md`, `APPEND_SYSTEM.md`, `skills/`, or `prompts/` directories.

## YAML Shape

Canonical shape:

```yaml
description: Human-readable summary
userSelectable: true

thinkingLevel: high
includeContextFiles: true

environment:
  TAVILY_API_KEY: ""
  PRIVATE_URL: https://example.com

prompt:
  base: pi | templated | raw
  system: |
    Inline custom system prompt text for templated or raw prompts.
  append: |
    Inline text appended after the effective base prompt.

tools: none | include
includeTools:
  - read
  - grep
  - find
  - ls

extensions:
  - workflow-orchestrator
  - questionnaire

skillDirs:
  - shared/skills/repo-map
promptFiles:
  - shared/prompts/repo-report.md
promptDirs:
  - shared/prompts/code-review

theme: github-dark-default

workers:
  - scout
  - code
```

Model fields are optional and intentionally omitted from the canonical example. When `provider` / `model` are omitted, activation should keep the currently selected model in an interactive Pi session. For worker/subagent launches, omitted model fields should let Pi use its normal configured default.

`thinkingLevel` is also optional. When present, activating the preset sets the current thinking level when the active Pi build exposes thinking-level switching to extensions. For worker/subagent launches, the child `pi --preset <worker>` invocation applies that worker preset's default thinking level.

`environment` is optional. When present, it overrides same-name environment variables for this preset invocation. It does not wipe the whole process environment, and the preset extension restores previous values when switching away from the preset.

`userSelectable` defaults to `true`. Set `userSelectable: false` for internal worker presets such as classifiers or judges that should not appear in the interactive `/preset` menu or keyboard cycling.

Internal presets remain usable by exact name:

```text
/preset classifier
pi --preset classifier
```

They also remain visible to workflow orchestrators through `workers:` lists.

## Prompt Modes

Decision: prompt behavior is `prompt.base` plus optional append text.

- `pi`: use Pi's default generated system prompt. `prompt.append` appends preset-specific guidance.
- `templated`: use custom system text as the base, then include generated sections such as tools, guidelines, skills, date, and cwd when applicable.
- `raw`: use the custom system prompt as the whole prompt. Do not add generated sections, context files, date, cwd, tool guidance, or skills.

Defaults:

- If no prompt fields or prompt files exist, `prompt.base` is `pi`.
- If `prompt.system` exists and `prompt.base` is omitted, `prompt.base` is `templated`.
- If `prompt.base` is `raw`, `prompt.system` is required.

Deprecated:

- `SYSTEM.md`
- `APPEND_SYSTEM.md`

Prompt text belongs in the preset YAML. Long prompt resources that need standalone files should be modeled as prompt templates and referenced with `promptFiles` or `promptDirs`, not as preset-owned `SYSTEM.md` files.

## Tools And Extensions

`includeTools` names Pi built-in tools only. It is additive across overlays.

Extension-provided tools are implied by enabled extension IDs:

```yaml
tools: include
includeTools: [read, grep, find, ls]
extensions:
  - questionnaire
```

The effective tools are the included Pi built-ins plus tools registered by the active preset-aware extensions.

Preset `extensions` are activation IDs for already-loaded extension modules. They do not cause Pi to discover or import extension files. Global/project Pi extensions remain loaded by Pi's normal rules and may ignore presets unless they explicitly integrate with mypi preset activation.

Decision: use Pi's shared event bus as the low-coupling runtime mechanism for active preset state. Session custom state is for persistence.

Implementation: extension-ID-to-tool mapping is centralized in `shared/presets/runtime.mjs`. Current mappings are `workflow-orchestrator -> subagent` and `questionnaire -> questionnaire`.

## Context Files

Presets control ambient project context files:

```yaml
includeContextFiles: true
```

Default: `true`.

Strict agents such as classifiers, judges, or deterministic workflow workers should set:

```yaml
includeContextFiles: false
```

Implementation note: Pi already supports `--no-context-files` at session creation. The preset extension enforces strict context exclusion for `prompt.base: raw` by replacing the generated prompt. For non-raw prompts with `includeContextFiles: false`, it also removes context file text from `systemPromptOptions.contextFiles` when Pi provides those entries, and warns when the active Pi build cannot guarantee a perfect runtime removal.

## Environment

Decision: mypi environment configuration has one user-level source of truth:

```text
~/.pi/mypi/mypi.env
```

The package should ship:

```text
mypi.env.example
```

`mypi.env.example` is the definitive list of environment variables mypi cares about across skills, scripts, and global extensions. The user's `~/.pi/mypi/mypi.env` stores actual values and is lazily created on first runtime-env use.

There are no preset-local `env` files and no `environmentFiles` field. Preset YAML may define an inline `environment` map for identity-specific or denial/override values:

```yaml
environment:
  PRIVATE_KEY: ${AGENT_A_PRIVATE_KEY}
  PRIVATE_URL: https://example.com
  TAVILY_API_KEY: ""
```

Merge rule: same-key replacement. A preset-defined key overrides the inherited value for that preset invocation. Setting a key to an empty string intentionally denies that value to scripts that check it. Omitted keys remain inherited from the process or `~/.pi/mypi/mypi.env`.

Environment values are for runtime tools and scripts. They must not be injected into system prompts. Skills can mention required variable names in `SKILL.md`, but not secret values.

Runtime env command:

```text
/mypi-env-config
```

This command views and modifies `~/.pi/mypi/mypi.env` so users do not need to hand-edit dotenv values.

Implementation note: the preset extension applies inline `environment` keys to `process.env` for the active preset and restores previous values when switching presets or shutting down. Child tools inherit the effective process environment.

## Resource Discovery

The preset extension should use `resources_discover` to expose:

- `skillPaths`
- `promptPaths`

Resources come from additive YAML lists:

```yaml
skillDirs:
  - shared/skills/repo-map
  - .pi/skills/my-project-skill
promptFiles:
  - shared/prompts/repo-report.md
promptDirs:
  - shared/prompts/code-review
  - .pi/prompts
```

Same-name prompt or skill resources follow normal precedence: more-local definitions win. Otherwise resources accumulate.

Theme availability is package/global/project Pi configuration, not preset resource discovery. The package should install shared themes at the package level. Presets only select an already available theme by name:

```yaml
theme: github-dark-default
```

## Workflow Presets

Any preset can become a multi-agent orchestrator by declaring both:

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

The orchestrator launches workers with:

```text
pi --preset <worker>
```

from the same cwd so user and project overlays apply to workers as well as the parent orchestrator.

Any preset that can call subagents is a workflow preset and requires a clean session. This is implied by `extensions: [workflow-orchestrator]` and a non-empty `workers:` list.

Selecting a workflow preset through `/preset <name>` or the `/preset` menu should warn that the preset will start from a fresh context, ask for confirmation, switch to the selected preset, reload, clear conversation history by starting a new session, and notify the user to run the appropriate workflow prompt template, for example `/deepresearch ...`.

## Migration Decisions

- Remove `/agent-mode`.
- Remove `/persona`.
- Chat personas become normal presets.
- Workflow workers launch by preset name, not by `PI_CODING_AGENT_DIR=agents/<name>`.
- The workflow orchestrator lives at `extensions/tools/workflow-orchestrator.ts`.
- Deprecate preset-owned `SYSTEM.md`, `APPEND_SYSTEM.md`, `skills/`, and `prompts/` directories.
- Remove `~/.pi/mypi.json`; `~/.pi/mypi/mypi.env` is the only mypi user config file.

## Implementation Status

- `extensions/preset/index.ts` loads flat preset YAML files, exposes `/preset`, applies tools/resources, and publishes active preset state.
- `extensions/tools/workflow-orchestrator.ts` reads worker names from the active preset state and launches child workers with `pi --preset <worker>`.
- `package.json` loads the preset extension, shared workflow orchestrator, and questionnaire extension.
- Existing package presets live as one YAML file per preset at `agents/<preset>.yml`.

## Open Implementation Feedback

- Confirm package-root discovery in both development and installed package contexts.

## Deferred

Preset-local `agents/<preset>/extensions/`, `agents/<preset>/skills/`, and `agents/<preset>/prompts/` are out of scope. Presets reference external resources instead of owning directories.

