# mypi user config (`~/.pi/mypi.json`)

Single file for mypi-owned settings (API keys, service URLs, TTS). Pi’s LLM credentials stay in `~/.pi/agent/auth.json`.

## Path

- Default: `~/.pi/mypi.json`
- Override: `MYPI_CONFIG_FILE`

`~/.pi` is created by Pi; mypi does not `mkdir` it. New files are written mode `0600`.

## Schema (v1)

```json
{
  "tts": { "wpm": 300 },
  "env": {
    "NTFY_BASE_URL": "",
    "NTFY_USER": "",
    "NTFY_PASSWORD": "",
    "CONGRESS_GOV_API_KEY": ""
  }
}
```

## Per-consumer defaults

Each consumer calls `ensure*` on first use and persists missing keys:

| Consumer | Keys | Default |
|----------|------|---------|
| `say.ts` / `/tts-wpm` | `tts.wpm` | `300` |
| `ntfy-send` | `NTFY_BASE_URL`, `NTFY_USER`, `NTFY_PASSWORD` | `""` |
| `congress-search` | `CONGRESS_GOV_API_KEY` | `""` |

## Precedence

1. Non-empty shell / `process.env` wins (never overwritten by file).
2. `mypi.json` fills gaps.
3. `applyConfigEnv` (Pi load, `scripts/bootstrap.sh`) exports only **non-empty** file values for unset env keys.

## Pi command

- **`/mypi-config`** — notify-only stub: shows config path and manual setup instructions. Full interactive editor is deferred (see GitHub issue).

## Modules

- TypeScript/Node: `shared/mypi-config/*.js`
- Python skills: `shared/mypi-config/read_config.py`
- Dev shell: `node shared/mypi-config/apply-shell-env.mjs` (via `scripts/bootstrap.sh`)
