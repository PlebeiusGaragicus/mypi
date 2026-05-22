
## What I've added to `pi` for my personal use

**the pitch**

1. agent presets
1. differentiated UI
1. multi-agent workflows

Agent presets are used as subagents by a multi-agent system which follows custom user-defined workflows to accomplish computer work tasks.  A differentiated UI adds features and helps ease-of-use

---

### Ease of use

 - 

































 Here’s what the repo actually ships on top of vanilla `pi`, organized so you can drop it into **“What I've added to `pi` for my personal use”** (the top of `README.md` already summarizes four bullets; this is the expanded version).

---

## Package model

- **Pi git package** (`pi install` from GitHub or local clone) — extensions, themes, and preset machinery load through `package.json` → `pi.extensions`, without replacing your core `pi` install.
- **Escape hatch**: `/preset pi` disables mypi preset state and returns to vanilla Pi behavior.
- **Docs** under `docs/` as the living spec (presets, workflows, runtime env, browser, branding, validation).

---

## Agent presets (`agents/*.yml`)

Flat YAML presets replace older agent-mode/persona routing. Each preset defines prompt mode, tools, optional extensions, skills, prompts, model/thinking, theme, and env overlays.

| Preset | Role |
|--------|------|
| `chat` | Tool-free conversation |
| `direct` | Sharp, opinionated chat (no tools) |
| `human` | Warm, human-voice chat (no tools) |
| `plato` | Socratic / truth-seeking chat (no tools) |
| `scout` | Read-only repo discovery (`ls`, `find`, `grep`, `read`) |
| `write` | Prose/docs edits without shell (`humanizer` skill) |
| `code` | Full coding agent (Pi base prompt + install guardrails + dev prompt library) |
| `web` | Web research + browser + search APIs (skills below) |
| `workflow` | Multi-agent orchestrator (see workflows) |
| `classifier` | Worker: class name only (`userSelectable: false`) |
| `judge` | Worker: `PASS`/`FAIL` only |
| `human`, `classifier`, `judge` | Used as workflow workers, not all in the default `/preset` menu |

**Preset machinery** (`extensions/preset/`):

- `/preset` and `/preset <name>`; `pi --preset <name>` at startup.
- Session restore of last preset (`mypi-preset-state`).
- **Overlays**: `~/.pi/mypi/agents/` and `.pi/mypi/agents/` merge on top of package presets (scalars replace, capability lists accumulate).
- **Prompt modes**: `pi` (inherit Pi coding prompt), `templated` (custom system + Pi tool/context/skills block), `raw` (preset-only).
- Applies **model**, **thinking level**, **theme**, **scoped env**, and optional **context-file exclusion** when the Pi build supports it.
- **Clean-session rule** for workflow presets (forces `/new` if restored into a dirty branch).

---

## Extensions and tools

Registered in `package.json` → `pi.extensions`:

1. **`extensions/preset/`** — preset activation, bootstrap, `/mypi-env-config`.
2. **`extensions/tools/workflow-orchestrator.ts`** — `subagent` tool (single, parallel, chain modes); launches workers via `pi --preset <worker>`; traces under `.pi/subagent-traces/<run-id>/`.
3. **`extensions/tools/questionnaire.ts`** — interactive multi-question UI tool (preset-gated); tabbed options + “type your own”; terminal bell.
4. **`extensions/mypi-branding/`** — always-on UI/QoL (not preset-gated).

**Branding / convenience** (from `docs/branding.md` and `docs/commands.md`):

- Preset-gated MYPI session header (`preset · dir` subtitle); window title.
- Theme hotkey: **Ctrl+Option+R** cycles package themes (skips built-in dark/light).
- **`/debug-system-prompt`** / **Ctrl+Q**: full effective system prompt in a notification (debug; requires at least one user or assistant message on the branch).
- Run timer, **TPS** in status bar, desktop/terminal **finish notifications** on agent end.
- `/save` — save latest assistant reply.
- **TTS**: `/say`, `/stop-speaking`, `/tts-toggle`, `/tts-wpm` (speed in `mypi.env` as `SAY_TTS_WPM`).
- Terminal color-depth handling for branding (256 vs truecolor; Intel Mac + Terminal.app special case documented in README).

---

## Runtime environment

- Single config file: **`~/.pi/mypi/mypi.env`** (template: `mypi.env.example`; override with `MYPI_ENV_FILE`).
- Keys: `NTFY_*`, `CONGRESS_GOV_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `SAY_TTS_WPM`.
- **`/mypi-env-config`** — view/edit/init/list/get/set/unset.
- Bootstrap merges non-empty values into `process.env` (unset keys only); dev shells use `scripts/bootstrap.sh`.

---

## Skills library (`shared/skills/`)

Exposed per preset via `skillDirs`. Several skills have **PATH-promoted** CLIs (`scripts/path-promoted-skills.txt` → bare commands in agent bash):

| Skill | What it adds |
|-------|----------------|
| `todo` | Shared task list CLI (`todo`) |
| `ntfy` | Push notifications (`ntfy-send`) |
| `tavily-search` | Tavily search/extract scripts |
| `exa-search` | Exa search/similar/contents scripts |
| `arxiv-search` | `arxiv-search`, `arxiv-fetch` |
| `congress-search` | Congress.gov API scripts |
| `btc-price` | CoinGecko spot quote (`btc-price`) |
| `browser-control` | `$B` browser automation skill + safety rules |
| `workflow-builder` | Conventions for authoring workflow prompts |
| `humanizer` | Prose/tone rewriting (wired into `write`) |

**Present but not PATH-promoted / not wired into a preset YAML** (still usable if you add `skillDirs` or invoke manually): `courtlistener`, `random-number`.

---

## Workflow system

- **`workflow` preset** + **`subagent`** + **`questionnaire`** + worker catalog (`chat`, `classifier`, `judge`, `scout`, `write`, `code`, `web`).
- **Workflow prompt library** (`shared/prompts/workflow/`):
  - `deepresearch.md` — citation-backed research pipeline
  - `pdf-ocr.md`, `paper-ocr.md` — OCR pipelines (with optional ntfy completion)
  - `kid-story.md` — small multi-worker demo
  - `retro.md` — retrospective on workflow traces
- **`workflow-builder` skill** for authoring new workflow templates.

---

## Code-session prompt library (`shared/prompts/code/`)

Development lifecycle templates (also mirrored under `.cursor/prompts/` for Cursor):

- `is.md` — issue/spec
- `pl.md` — planning
- `im.md` — implementation
- `wr.md` — wrap-up
- `pr.md` — PR merge-readiness review
- `re.md` — (exists in tree; check purpose if you document it)
- `cl.md` — changelog audit (per development-process doc)

Plus `shared/prompts/introduction.md`, scout `repo-report.md`, chat `20-questions.md`.

---

## Browser automation

- **`utilities/browser-runtime`** — compiled to `dist/browse`, exposed as **`$B`** when built.
- `web` preset + `browser-control` skill: navigation, snapshots, screenshots, challenge handoff (no curl bypass of bot walls).
- npm scripts: `browser:install`, `browser:build`, `browser:test`, `browser:dev`.

---

## Themes (`shared/themes/`)

Seven JSON themes installed at package level; presets pick by name (`github-dark-default`, `midnight-ocean`, `nightowl`, `ocean-breeze`, `rose-pine`, `synthwave`, `tokyo-night`).

---

## Homelab / local model scripts (`scripts/`)

- **`lmstudio-ctl`** — LM Studio v1 REST control using `~/.pi/agent/models.json` for base URL.
- **`lmstudio-models`** — model listing helper (companion script).
- **`bootstrap.sh`** — PATH promotion + runtime env for non-Pi shells.
- **Validation**: `presets:check`, `presets:test`, `runtime-env:test`, `presets:debug-system-prompts`.

---

## What’s in the tree but not part of the shipped Pi package

- **`examples/`** — large untracked experiments (pi-mcp, ephemeral UI, etc.); **not** listed in `package.json` `pi.extensions` / skills. Treat as local reference, not user-facing package features unless you wire them in later.
- **`.cursor/prompts/`** — Cursor-side copies of dev prompts, not loaded by Pi automatically.

---

## Suggested README outline

You could structure section 35+ like:

1. **Presets & overlays** (table + `/preset` + `pi --preset`)
2. **Multi-agent workflows** (`subagent`, traces, workflow library)
3. **Skills & PATH CLIs** (table)
4. **Browser runtime (`$B`)**
5. **Runtime config (`mypi.env`, `/mypi-env-config`)**
6. **Branding & session UX** (TTS, notifications, TPS, themes, debug prompt)
7. **Dev workflow prompts** (issue → PR lifecycle)
8. **Homelab scripts** (LM Studio)
9. **Operator docs & checks** (`docs/`, npm scripts)

The existing bullets at lines 7–11 in `README.md` are accurate but high-level; the list above is what you’d flesh out for a “comprehensive” section. I’m in **Ask mode**, so I can’t edit the file — switch to Agent mode if you want this drafted directly into `README.md`.