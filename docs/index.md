# mypi

My personal `pi` extension package.

> the computer is all you need

mypi layers three things on top of a vanilla Pi install, without replacing it:

1. **Agent presets** — named agent profiles (`agents/*.yml`) with differentiated prompts, tools, skills, model preferences, and themes. Switch with `/preset`.
2. **Multi-agent workflows** — a `workflow` preset that interprets natural-language workflow programs (markdown files) and delegates bounded tasks to worker presets through the `subagent` tool.
3. **A personal skills library and UI polish** — path-promoted skill CLIs (search providers, ntfy, todo, browser control) plus branding, TTS, and quality-of-life extensions.

Everything is designed to run against **open-source models on limited local inference infrastructure** (an LM Studio / Ollama homelab). That constraint shapes the architecture: workers run as fresh processes with clean contexts, capability boundaries are structural (a tool-less preset *cannot* touch files, regardless of what the model tries), and workflow prompts favor file handoffs over long in-context state.

## Install

```sh
pi install https://github.com/PlebeiusGaragicus/mypi.git
```

For local development:

```sh
git clone https://github.com/PlebeiusGaragicus/mypi
cd mypi
pi install .
```

Runtime settings (API keys, ntfy, TTS speed) live in `~/.pi/mypi/mypi.env` — see [Runtime & Commands](runtime.md).

## Quick Start

```text
/preset            # pick a preset from a menu
/preset code       # activate the coding preset
/preset pi         # back to vanilla Pi

/new               # workflows want a clean session
/preset workflow
/deepresearch <topic>
```

## Where To Go

- [Features](features.md) — the short pitch and feature summary.
- [Presets](presets.md) — the catalog, the YAML schema, overlays, and merge semantics.
- [Workflows](workflows.md) — the orchestrator, the `subagent` tool, the workflow library, and authoring conventions.
- [Skills](skills.md) — the skill inventory and conventions for building new ones.
- [Runtime & Commands](runtime.md) — `mypi.env`, PATH bootstrap, slash commands, and validation scripts.
- [Proposals](proposals.md) — design changes under consideration, not yet implemented.

## Runtime State

mypi-owned runtime values live in `~/.pi/mypi/mypi.env`. Pi model credentials remain in Pi's own auth store (`~/.pi/agent/auth.json`), never in mypi config or docs.
