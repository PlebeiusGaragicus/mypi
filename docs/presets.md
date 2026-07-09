# Presets

Presets are mypi's agent definition format: named agent profiles defined as flat YAML files. A preset defines prompt behavior, tool access, extension-provided tools, resources, model preferences, theme, and runtime environment overlays.

Use them interactively with `/preset` or at process start with `pi --preset <name>`.

## Commands

```text
/preset            # choose from a menu
/preset code       # activate by name
/preset pi         # disable mypi preset state; back to vanilla Pi
pi --preset web    # activate at startup
```

## Catalog

The package ships these presets under `agents/*.yml`:

| Preset | Purpose | Tools |
| --- | --- | --- |
| `chat` | General conversation without tools. | none |
| `direct` | Direct, sharp conversation persona; anti-slop, real opinions. | none |
| `human` | Human-voice persona; warm, specific, anti-cliche. | none |
| `plato` | Socratic, truth-seeking dialogue persona. | none |
| `scout` | Read-only repository and directory discovery. | ls, find, grep, read |
| `write` | Prose and documentation edits without shell access (humanizer skill). | + write, edit |
| `socratic` | Socratic seminar: stress-test a thesis, then structure it into evidence-based Arguments under `./arguments/` (how-to-debate + find-sources skills). Delegates source-finding to `web` workers on request. | + write, edit + subagent |
| `code` | Code implementation, tests, builds, command execution. Inherits Pi's full coding prompt. | + bash |
| `web` | Web research and source extraction with Tavily and Exa search. | ls, find, grep, read, bash |
| `workflow` | Multi-agent orchestrator via `subagent` and `questionnaire`. No shell: it delegates execution to workers, which create their own artifact directories. | ls, find, grep, read, write, edit + subagent |
| `classifier` | Worker: returns only a class name. | none |
| `judge` | Worker: returns only `PASS`/`FAIL` with one sentence. | none |

`classifier` and `judge` set `userSelectable: false`: they are hidden from the `/preset` menu but remain available to explicit `/preset <name>` and as workflow workers.

## Restore Behavior

When you select a preset, mypi writes a `mypi-preset-state` custom session entry. On session start or resume, the preset extension restores the last saved preset unless a `--preset` flag is supplied. Forked sessions copy the previous preset state when possible.

Workflow presets are the exception: they are designed for clean sessions. If a workflow preset would be restored into a branch with prior user messages, mypi clears the preset state and asks you to run `/new`, then reselect it. See [Workflows](workflows.md).

By default this clean-session rule applies to any preset that declares the `workflow-orchestrator` extension plus a `workers:` list. A conversational preset that merely *delegates* (like `socratic` dispatching `web` workers mid-seminar) opts out with `cleanSession: false`; a preset can also force the rule on with `cleanSession: true`.

## YAML Shape

Package presets live at `agents/<preset>.yml`:

```yaml
description: Human-readable summary
userSelectable: true
provider: openai
model: gpt-5.5
thinkingLevel: high
includeContextFiles: true
cleanSession: false
theme: github-dark-default

prompt:
  base: templated
  system: |
    Optional preset-owned system prompt.
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

## Prompt Modes

`prompt.base` controls composition:

- `pi` — start from Pi's generated system prompt and append preset text. Reserve this for presets that intentionally inherit Pi's full coding-agent prompt, such as `code`.
- `templated` — use the preset's `system` text, then preserve Pi-generated tools, project context, available skills, date, and cwd without Pi's default prose. The default choice for mypi tool-using presets.
- `raw` — use only the preset's `system` text. Useful for strict classifiers, judges, personas, and deterministic workers that should not inherit ambient Pi instructions.

`includeContextFiles: false` removes ambient project context (AGENTS.md and friends) from prompt composition. Raw prompts enforce this strictly; non-raw prompts rely on Pi's prompt hooks and may warn if the active Pi build cannot guarantee perfect removal.

## Tools And Extensions

`tools: none` disables all tools. `tools: include` enables the listed built-in tools (`ls`, `find`, `grep`, `read`, `write`, `edit`, `bash`) plus tools implied by active extensions.

Current extension tool mapping:

- `workflow-orchestrator` provides `subagent`
- `questionnaire` provides `questionnaire`

Extension modules are loaded by the package, but their tools only work when the active preset declares the extension.

## Model, Thinking, Theme

Presets may set `provider`, `model`, `thinkingLevel`, and `theme`. When the active Pi build exposes those controls to extensions, mypi applies them on activation and warns if it cannot.

!!! note "Per-preset model routing is deliberately under-utilized"
    The machinery supports pinning a different model per preset (a small fast model for `classifier`/`judge`, the strongest model for `workflow`), but none of the shipped presets do so. On limited local inference infrastructure, model swapping is slow and costly — LM Studio has to load and unload weights — so all presets currently inherit the session's default model. The feature stays in place for when the infrastructure can afford it. See [Proposals](proposals.md) for related context-budget ideas.

## Overlays And Merge Semantics

User and project overlays use the same YAML schema and layout under mypi source roots:

```text
~/.pi/mypi/agents/<preset>.yml    # user-wide preferences
.pi/mypi/agents/<preset>.yml      # repository-specific behavior
```

Sources load from least-local to most-local: package defaults, user overlays, then project overlays discovered by walking from the current directory up to the home directory. Every `.pi/mypi` source root found along the way is loaded; deeper ones win.

**Scalar fields replace**: `description`, `userSelectable`, `provider`, `model`, `thinkingLevel`, `includeContextFiles`, `theme`, and scalar prompt fields.

**Capability lists accumulate**: `includeTools`, `extensions`, `skillDirs`, `promptFiles`, `promptDirs`, `workers`.

**`environment` is a same-key map override.** A preset value replaces the inherited process value for that key while the preset is active, and is restored when switching presets or shutting down. An empty string intentionally denies that value to tools that check for non-empty environment values.

Because lists only accumulate, you cannot subtract capabilities in an overlay. If you need a more restrictive variant of an existing preset, create a new preset name instead.

Overlay example:

```yaml
description: Code preset with project-specific prompts
promptFiles:
  - .pi/prompts/project-rules.md
environment:
  PROJECT_API_BASE: https://example.test
```

## Resources

The preset extension exposes referenced skills and prompts during Pi resource discovery:

- `skillDirs` — skill directories (each must contain `SKILL.md`)
- `promptFiles` — individual prompt templates
- `promptDirs` — directories of prompt templates

Paths resolve relative to the preset's source root, so an overlay in `.pi/mypi/` references files relative to that overlay. Missing resources are ignored rather than exposed. Resources update after preset changes by reloading the session.

Themes are package-level Pi resources; presets select an already-installed theme by name.

## Runtime Environment

Global mypi runtime values live in `~/.pi/mypi/mypi.env` (see [Runtime & Commands](runtime.md)). Preset `environment` overlays are scoped to the active preset. Runtime environment values are for tools and scripts — they are never injected into system prompts.
