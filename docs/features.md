# Features

**the pitch**

1. agent presets
1. multi-agent workflows
1. differentiated UI

Agent presets are customized agent profiles (prompt, tools, skills, theme) switched with `/preset`. A workflow orchestrator preset uses them as subagents, following user-defined natural-language workflow programs to accomplish computer-work tasks. A differentiated UI adds ease-of-use features on top.

## Feature summary

- **Presets** (`agents/*.yml`) — 12 shipped profiles: tool-less chat personas (`chat`, `direct`, `human`, `plato`), capability workers (`scout`, `write`, `socratic`, `code`, `web`, `classifier`, `judge`), and the `workflow` orchestrator. User/project overlays merge on top. → [Presets](presets.md)
- **Workflows** — the `subagent` tool (single / parallel / chain), per-run trace manifests under `.pi/subagent-traces/`, a workflow prompt library (deep research, PDF/paper OCR, retro), and a workflow-builder skill. → [Workflows](workflows.md)
- **Skills** (`shared/skills/`) — path-promoted CLIs for Tavily, Exa, arXiv, congress.gov, BTC price, ntfy, todo; browser automation via `$B`; humanizer prose editing; how-to-debate Socratic argumentation. → [Skills](skills.md)
- **Runtime** — one config file (`~/.pi/mypi/mypi.env`), `/mypi-env-config`, PATH bootstrap for skill CLIs, validation scripts, and per-preset system-prompt debug dumps. → [Runtime & Commands](runtime.md)
- **Branding & UX** — MYPI session header, themes with cycling hotkey, TTS (`/say`, `/tts-wpm`), run timer, TPS status, finish notifications, `/save`, `/debug-system-prompt`. → [Branding](branding.md)
- **Homelab scripts** — `lmstudio-ctl` / `lmstudio-models` for controlling self-hosted LM Studio.
