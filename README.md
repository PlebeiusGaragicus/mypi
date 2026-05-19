# mypi

My personal `pi` extension package.

It provides:

1. a multi-agent system orchestrator mode with example workflow library and `/workflow-builder` skill
1. agent "modes" with differentiated: (SYSTEM.md, tools, skills, themes, etc)
1. my personal skills library
1. scripts for controlling a self-hosted LM Studio or Ollama homelab
1. leaves your "vanilla" `pi` installation alone

User settings (API keys, ntfy, TTS speed) are stored in **`~/.pi/mypi.json`**. Copy [`mypi.json.example`](mypi.json.example) as a starting point or let extensions create keys on first use. See [`shared/mypi-config/CONFIG.md`](shared/mypi-config/CONFIG.md).

## Install and Run

Install as a Pi package:

```sh
pi install https://github.com/PlebeiusGaragicus/mypi.git
```

Session header branding: **256-color** on **Intel Mac + Terminal.app** only (`darwin`, `x64`, Terminal session). **Apple Silicon macOS** always uses **truecolor** for branding (Node often reports low `getColorDepth()` in Terminal.app; we do not downgrade). On **other** systems, truecolor is used when `getColorDepth() >= 24`, else 256. Overrides: `MYPI_BRANDING_TRUECOLOR=0` forces 256, `=1` forces 24-bit.

## Local Development

For development, run `git clone` and install from the directory:

1. `git clone https://github.com/PlebeiusGaragicus/mypi`
1. `cd mypi`
1. `pi install .`

