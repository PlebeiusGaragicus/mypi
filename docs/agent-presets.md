# Agent Presets

## Goal

Replace the current split between `/agent-mode`, chat personas, workflow agents, and hardcoded per-agent extension behavior with preset-defined agents.

A preset is a complete agent profile. It can define:

- System prompt behavior.
- Pi built-in tools.
- Preset-aware extension activation.
- Skills, slash prompts, themes, and other resources.
- Model and thinking level.
- Workflow/subagent behavior.

Small agents should fit entirely in one YAML file. Larger agents can use a directory only when they need files.

## Agent Definition Files

Decision: agents are defined per preset, not in one central `agent-presets.yml`.

Within any mypi agent source root, a preset can be defined in either shape:

```text
agents/<preset>.yml
agents/<preset>/<preset>.yml
```

When the source root is a project-local `.pi/mypi` directory, those become:

```text
.pi/mypi/agents/<preset>.yml
.pi/mypi/agents/<preset>/<preset>.yml
```

The directory form is used when the preset also owns file resources:

```text
.pi/mypi/agents/<preset>/
  <preset>.yml
  SYSTEM.md
  APPEND_SYSTEM.md
  skills/
  prompts/
```

YAML-only presets should use `.pi/mypi/agents/<preset>.yml` to avoid an unnecessary directory.

## Source Layers

Preset sources are loaded least-local to most-local. More-local scalar fields win, while capability-bearing lists are additive.

Target source order:

1. Package defaults from this installed package.
2. User-wide overlay under `~/.pi/mypi/`.
3. Project overlays discovered by walking from `cwd` up to `$HOME` and loading any `.pi/mypi/` source roots.

Example project walk:

```text
~/Documents/.pi/mypi/agents/scout.yml
~/Documents/project-abcd/.pi/mypi/agents/scout/scout.yml
~/Documents/project-abcd/subject/paper/
```

If cwd is `~/Documents/project-abcd/subject/paper`, both overlays are loaded and the deeper one wins for scalar fields.

## Merge Semantics

Scalars replace:

- `description`
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

## YAML Shape

Canonical shape:

```yaml
description: Human-readable summary

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

`thinkingLevel` is also optional. When present, activating the preset should set the current thinking level in an interactive Pi session. For worker/subagent launches, it should act as the default thinking level for that preset invocation.

`environment` is optional. When present, it overrides same-name environment variables for this preset invocation. It does not wipe the whole process environment.

## Prompt Modes

Decision: prompt behavior is `prompt.base` plus optional append text.

- `pi`: use Pi's default generated system prompt. `prompt.append` appends preset-specific guidance.
- `templated`: use custom system text as the base, then include generated sections such as tools, guidelines, skills, date, and cwd when applicable.
- `raw`: use the custom system prompt as the whole prompt. Do not add generated sections, context files, date, cwd, tool guidance, or skills.

Defaults:

- If no prompt fields or prompt files exist, `prompt.base` is `pi`.
- If `SYSTEM.md` or `prompt.system` exists and `prompt.base` is omitted, `prompt.base` is `templated`.
- If `prompt.base` is `raw`, `prompt.system` or `SYSTEM.md` is required.

Same-layer duplicate prompt sources are invalid:

- Do not define both YAML `prompt.system` and `SYSTEM.md` in the same preset source layer.
- Do not define both YAML `prompt.append` and `APPEND_SYSTEM.md` in the same preset source layer.

Cross-layer override is allowed: a local YAML `prompt.system` may override a package `SYSTEM.md`.

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

Feedback needed during implementation: define exact extension-ID-to-tool mapping. Options include source-path mapping, extension self-declaration over the event bus, or a small registry exported by the preset extension.

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

Implementation note: Pi already supports `--no-context-files` at session creation. Preset-specific toggling may need to happen during prompt composition using `systemPromptOptions`.

## Environment

Decision: mypi environment configuration has one user-level source of truth:

```text
~/.pi/mypi/env.yml
```

The package should ship:

```text
env.yml.example
```

`env.yml.example` is the definitive list of environment variables mypi cares about across skills, scripts, and global extensions. The user's `~/.pi/mypi/env.yml` stores actual values.

There are no preset-local `env` files and no `environmentFiles` field. Preset YAML may define an inline `environment` map for identity-specific or denial/override values:

```yaml
environment:
  PRIVATE_KEY: ${AGENT_A_PRIVATE_KEY}
  PRIVATE_URL: https://example.com
  TAVILY_API_KEY: ""
```

Merge rule: same-key replacement. A preset-defined key overrides the inherited value for that preset invocation. Setting a key to an empty string intentionally denies that value to scripts that check it. Omitted keys remain inherited from the process or `~/.pi/mypi/env.yml`.

Environment values are for runtime tools and scripts. They must not be injected into system prompts. Skills can mention required variable names in `SKILL.md`, but not secret values.

Future command:

```text
/mypi-env-config
```

This command should view and modify `~/.pi/mypi/env.yml` so users do not need to hand-edit YAML.

Implementation note: scripts invoked by preset skills should receive the effective environment. The implementation may need to pass an env overlay to bash/tool execution rather than mutating global `process.env`.

## Resource Discovery

The preset extension should use `resources_discover` to expose:

- `skillPaths`
- `promptPaths`

Resources come from convention directories and additive YAML lists.

For a directory-shaped preset:

```text
agents/<preset>/skills/
agents/<preset>/prompts/
```

From YAML:

```yaml
skillDirs:
  - shared/skills/repo-map
promptFiles:
  - shared/prompts/repo-report.md
promptDirs:
  - shared/prompts/code-review
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

## Migration Decisions

- Remove `/agent-mode`.
- Remove `/persona`.
- Chat personas become normal presets.
- Workflow workers launch by preset name, not by `PI_CODING_AGENT_DIR=agents/<name>`.
- The workflow orchestrator moves to `shared/extensions/workflow-orchestrator`.

## Current Code Conflicts

- `extensions/agent-mode/agent-mode.ts` hardcodes modes, tools, prompt files, resources, and persona behavior.
- `agents/workflow/extensions/workflow-orchestrator/index.ts` hardcodes worker directories under `agents/<name>` and launches child Pi with `PI_CODING_AGENT_DIR`.
- `package.json` still loads `extensions/agent-mode/index.ts` and `agents/workflow/extensions/workflow-orchestrator/index.ts`.
- Existing docs/spec drafts referenced central `agent-presets.yml`; target is now per-agent YAML under `agents/<preset>.yml` or `agents/<preset>/<preset>.yml` within source roots.

## Open Implementation Feedback

- Confirm package-root discovery in both development and installed package contexts.
- Confirm the prompt-composition path for `includeContextFiles: false`.
- Decide the extension-ID-to-tool mapping mechanism.

## Deferred

Preset-local `agents/<preset>/extensions/` is out of scope because Pi does not currently discover extension paths via `resources_discover`.

