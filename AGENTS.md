Several reference repos are cloned locally and .gitignore'd - they are for reference only.  Review .gitignore for the definitive list.  NEVER modify them.

## Session PATH bootstrap (skill scripts)

Pi does not run an interactive shell for the agent **bash** tool; each command is a new process. To expose pick-and-choose skill utilities (e.g. bare `todo`) without full paths or `source` on every command:

- **`extensions/agent-mode/bootstrap-path.ts`** — On extension load (via `extensions/agent-mode/index.ts`), prepends an allowlist of **repo-relative** script directories to `process.env.PATH` (idempotent). Child shells inherit this via pi’s `getShellEnv()`. Listed first inside the agent-mode bundle in `package.json` under `pi.extensions`.
- **`scripts/bootstrap.sh`** — For normal shells outside pi (e.g. local dev): `source scripts/bootstrap.sh` from repo intent prepends the same curated dirs to `PATH`.

When adding a new skill’s `scripts/` directory, update **both** the `SCRIPT_PATH_ALLOWLIST` array in `extensions/agent-mode/bootstrap-path.ts` and the `export PATH=...` line(s) in `bootstrap.sh` so Pi and non-Pi shells stay aligned. (A single shared allowlist file read by both would remove that duplication if we introduce it later.)
