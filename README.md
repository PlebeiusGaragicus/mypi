# mypi

My personal `pi` extension package.

> the computer is all you need

It provides:

1. a preset-based multi-agent workflow orchestrator with an example workflow library and workflow-builder skill
1. agent presets with differentiated prompts, tools, skills, themes, and extension-provided tools
1. my personal skills library
1. scripts for controlling a self-hosted LM Studio or Ollama homelab
1. leaves your "vanilla" `pi` installation alone — `/preset pi` returns to stock behavior at any time

**Documentation:** [plebeiusgaragicus.github.io/mypi](https://plebeiusgaragicus.github.io/mypi/) — built with MkDocs from [`docs/`](docs/). Start with the [feature summary](docs/features.md).

## Install and Run

Install as a Pi package:

```sh
pi install https://github.com/PlebeiusGaragicus/mypi.git
```

Then switch presets with `/preset`. Runtime settings (API keys, ntfy, TTS speed) live in `~/.pi/mypi/mypi.env`, edited with `/mypi-env-config` — see [Runtime & Commands](docs/runtime.md).

## Local Development

```sh
git clone https://github.com/PlebeiusGaragicus/mypi
cd mypi
pi install .
```

Validation: `npm run presets:check`, `npm run presets:test`, `npm run runtime-env:test`. Docs preview: `pip install mkdocs-material && mkdocs serve`.

See [AGENTS.md](AGENTS.md) for repo conventions and [Development Process](docs/development-process.md) for the issue-to-release workflow.
