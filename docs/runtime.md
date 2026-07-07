# Runtime & Commands

Everything about mypi's runtime state, environment bootstrap, slash commands, and validation scripts.

## Runtime Env (`mypi.env`)

mypi runtime values (API keys, ntfy settings, TTS speed) live in a single file:

```text
~/.pi/mypi/mypi.env
```

Set `MYPI_ENV_FILE` to use a different file. `mypi.env.example` at the repo root is the schema and default source; the file is created lazily from it on first use. Empty values are intentional and treated as unset.

Edit with `/mypi-env-config`:

```text
/mypi-env-config              # interactive editor
/mypi-env-config path         # show the active file path
/mypi-env-config list         # show known keys
/mypi-env-config get KEY
/mypi-env-config set KEY VALUE
/mypi-env-config unset KEY    # set to empty
/mypi-env-config init         # create from mypi.env.example
```

Pi model credentials remain in Pi's own auth store (`~/.pi/agent/auth.json`), never in `mypi.env`.

## Bootstrap

mypi bootstraps both Pi sessions and dev shells.

**Pi sessions** — `extensions/preset/index.ts` imports `extensions/preset/bootstrap.ts`, which on extension load:

- merges non-empty values from `mypi.env` into `process.env` (existing shell values win; file values only fill unset or empty keys)
- prepends promoted skill script directories to `PATH`
- sets `$B` to the browser runtime binary when it is built

Child shell tools inherit this environment. Pi does not run an interactive shell for the bash tool — each command is a new process — which is why PATH promotion happens at extension load rather than via shell profiles.

**Dev shells** — outside Pi, source the same setup:

```sh
source scripts/bootstrap.sh
```

**Path promotion** — `scripts/path-promoted-skills.txt` contains one skill folder name per line under `shared/skills/<name>/`. Each listed skill's `scripts/` directory is prepended to `PATH`, so its commands work by basename (`todo`, `ntfy-send`, `btc-price`, …). Later lines win for PATH precedence. Only skills listed there should tell agents to run scripts by basename.

## Slash Commands

**Presets**

- `/preset` — choose a preset from a menu.
- `/preset <name>` — activate a preset.
- `/preset pi` — disable mypi preset state; return to vanilla Pi.

**Runtime env**

- `/mypi-env-config …` — see above.

**Branding and convenience**

- `/save` — save the latest assistant reply.
- `/say`, `/stop-speaking`, `/tts-toggle`, `/tts-wpm` — local speech (speed persists as `SAY_TTS_WPM` in `mypi.env`).
- `/debug-system-prompt` (or Ctrl+Q) — show the full effective system prompt for the current preset (requires at least one turn on the branch).

## Package Scripts

```sh
npm run presets:check                  # validate agents/*.yml (fields, tools, workers, themes, resources)
npm run presets:test                   # unit tests for merge semantics, prompt composition, effective tools
npm run runtime-env:test               # mypi.env creation, parsing, and application behavior
npm run presets:debug-system-prompts   # regenerate debug/*.md system-prompt dumps for all presets
npm run browser:install                # browser runtime (in utilities/browser-runtime)
npm run browser:build
npm run browser:test
npm run browser:dev
```

## Validation

`presets:check` validates the flat `agents/*.yml` layout, preset fields, tool names, extensions, workers, themes, environment keys, and package references. `presets:test` exercises shared preset runtime behavior: merging, prompt composition per prompt mode, effective tools (including extension-implied tools), and workflow clean-session detection. `runtime-env:test` verifies lazy file creation, dotenv parsing, empty-value behavior, process env application, and shell export formatting. Browser runtime tests run inside `utilities/browser-runtime`.

## Debug System-Prompt Dumps

`npm run presets:debug-system-prompts` runs `pi --preset <name> --debug-system-prompt` for every shipped preset and writes the assembled system prompt to `debug/<name>.md`. The dumps are gitignored generated output, and they are the fastest way to answer "what does this preset actually see?" — including exact context size, which matters when budgeting prompts for small local models. Regenerate them after changing any preset YAML or shared prompt.

## Homelab Scripts

- `scripts/lmstudio-ctl` — control a self-hosted LM Studio via its v1 REST API (load/unload/list models).
- `scripts/lmstudio-models` — companion model-listing helper.

These are standalone operator tools; they are not wired into any preset.

## Docs Site

The documentation is an MkDocs site (`mkdocs.yml` at the repo root, Material theme):

```sh
pip install mkdocs-material
mkdocs serve            # local preview at http://127.0.0.1:8000
```

Pushes to `main` deploy the site to GitHub Pages via `.github/workflows/docs.yml`.
