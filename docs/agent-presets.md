# Agent Presets

Presets are mypi's agent definition format. A preset is a YAML file that defines prompt behavior, tool access, extension-provided tools, resources, model preferences, theme, and runtime environment overlays.

## Files And Overlays

Package presets live at:

```text
agents/<preset>.yml
```

User and project overlays use the same layout under mypi source roots:

```text
~/.pi/mypi/agents/<preset>.yml
.pi/mypi/agents/<preset>.yml
```

Sources load from least-local to most-local: package defaults, user overlays, then project overlays discovered by walking from the current directory upward. More-local scalar fields replace less-local values. Lists that add capabilities accumulate.

Preset-owned directories are not part of the model. Skills, prompts, and themes live in shared locations and are referenced by path.

## YAML Shape

```yaml
description: Human-readable summary
userSelectable: true
provider: openai
model: gpt-5.5
thinkingLevel: high
includeContextFiles: true
theme: github-dark-default

prompt:
  base: pi
  system: |
    Optional full system prompt for raw or templated presets.
  append: |
    Optional text appended to the effective base prompt.

tools: include
includeTools:
  - read
  - grep
  - find
  - ls

extensions:
  - questionnaire

workers:
  - scout
  - code

environment:
  TAVILY_API_KEY: ""

skillDirs:
  - shared/skills/todo
promptFiles:
  - shared/prompts/introduction.md
promptDirs:
  - shared/prompts/code
```

## Merge Semantics

Scalar fields replace:

- `description`
- `userSelectable`
- `provider`
- `model`
- `thinkingLevel`
- `includeContextFiles`
- `theme`
- scalar prompt fields

Capability lists accumulate:

- `includeTools`
- `extensions`
- `skillDirs`
- `promptFiles`
- `promptDirs`
- `workers`

`environment` is a same-key map override. A preset value replaces the inherited process value for that key while the preset is active. An empty string intentionally denies that value to tools that check for non-empty environment values.

## Prompt Modes

`prompt.base` controls composition:

- `pi`: start from Pi's generated system prompt and append preset text.
- `templated`: use preset `system`, then Pi's generated prompt, then preset `append`.
- `raw`: use only preset `system` plus `append`.

`prompt.base: raw` is useful for strict classifiers, judges, or deterministic workers that should not inherit ambient Pi instructions.

## Tools And Extensions

`tools: none` disables tools. `tools: include` enables the listed built-in tools plus tools implied by active extensions.

Current extension tool mapping:

- `workflow-orchestrator` provides `subagent`
- `questionnaire` provides `questionnaire`

Extension modules are loaded by the package, but their tools only work when the active preset declares the extension.

## Context Files

`includeContextFiles: false` tells the preset extension to remove ambient project context from prompt composition. Raw prompts can enforce this strictly. Non-raw prompts use Pi's available prompt hooks and may warn if the active Pi build cannot guarantee perfect removal.

## Runtime Environment

Global mypi runtime values live in `~/.pi/mypi/mypi.env`. Preset `environment` overlays are scoped to the active preset and restored when switching presets or shutting down.

Runtime environment values are for tools and scripts. They are never injected into system prompts.

## Resources

The preset extension exposes referenced skills and prompts during Pi resource discovery:

- `skillDirs`
- `promptFiles`
- `promptDirs`

Paths are resolved relative to the preset source root. Missing resources are ignored rather than exposed.

Themes are package-level Pi resources. Presets select an already installed theme by name using `theme`.

## Workflow Presets

A workflow preset declares both:

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

Workers launch with:

```text
pi --preset <worker>
```

Workflow presets are designed for clean sessions. If a workflow preset is restored into a non-clean branch, mypi clears that preset state and asks the user to start a new session before reselecting it.

## Restore Behavior

When a user selects a preset, mypi writes a `mypi-preset-state` custom session entry. On session start or resume, the preset extension restores the last saved preset unless a `--preset` flag is supplied. Forked sessions copy the previous preset state when possible.
