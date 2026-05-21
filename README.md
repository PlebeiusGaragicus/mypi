# mypi

My personal `pi` extension package.

It provides:

1. a preset-based multi-agent workflow orchestrator with an example workflow library and workflow-builder skill
1. agent presets with differentiated prompts, tools, skills, themes, and extension-provided tools
1. my personal skills library
1. scripts for controlling a self-hosted LM Studio or Ollama homelab
1. leaves your "vanilla" `pi` installation alone

Runtime settings (API keys, ntfy, TTS speed) are stored in **`~/.pi/mypi/mypi.env`**. The file is created from [`mypi.env.example`](mypi.env.example) on first runtime-env use and can be edited with `/mypi-env-config`. See [`shared/runtime-env/README.md`](shared/runtime-env/README.md).

See [`docs/`](docs/) for the current package specs and operator guides.

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

## What I've added to `pi` for my personal use

**the pitch**

1. agent presets
1. differentiated UI
1. multi-agent workflows

Agent presets are used as subagents by a multi-agent system which follows custom user-defined workflows to accomplish computer work tasks.  A differentiated UI adds features and helps ease-of-use

---

