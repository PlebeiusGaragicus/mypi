Several reference repos are cloned locally and .gitignore'd - they are for reference only.  Review .gitignore for the definitive list.  NEVER modify them.

## Session PATH bootstrap (skill scripts)

Pi does not run an interactive shell for the agent **bash** tool; each command is a new process. To expose pick-and-choose skill utilities (e.g. bare `todo`) without full paths or `source` on every command:

- **`scripts/path-promoted-skills.txt`** — One **skill folder name** per line under `shared/skills/<name>/` (comments `#` and blank lines allowed). Each promoted skill’s `scripts/` directory is prepended to `PATH` for agents and for humans who `source scripts/bootstrap.sh`. **Later lines win** if order matters for PATH precedence.
- **`extensions/agent-mode/bootstrap-path.ts`** — On extension load (via `extensions/agent-mode/index.ts`), reads `path-promoted-skills.txt` and prepends those dirs to `process.env.PATH` (idempotent). Child shells inherit this via pi’s `getShellEnv()`. Listed first inside the agent-mode bundle in `package.json` under `pi.extensions`.
- **`scripts/bootstrap.sh`** — For normal shells outside pi (e.g. local dev): `source scripts/bootstrap.sh` from repo root reads the same file and prepends the same dirs to `PATH`.

When a skill’s scripts should be invocable by **basename**, add its folder name to **`scripts/path-promoted-skills.txt`** and note in that skill’s **`SKILL.md`** that its `scripts/` dir is on `PATH` (so the agent uses bare commands, not `node …/scripts/…` paths).

## Root `package.json` and Node in skill `scripts/`

The repo root **`package.json`** sets **`"type": "module"`** so Node resolves extensionless (or `.js`) CLIs under **`shared/skills/*/scripts/`** as **ESM** when it walks up to this manifest—no per-skill `package.json` needed, and no `MODULE_TYPELESS_PACKAGE_JSON` noise for extensionless shebang scripts like `ntfy-send`.

**Convention:** treat **`shared/skills/*/scripts/`** as the only place this package is expected to grow new **`.js`** files. The rest of the package is primarily **TypeScript** extensions plus shell helpers; if you ever add CommonJS elsewhere, use an explicit **`.cjs`** extension or a separate `package.json` boundary so it does not inherit root `"type": "module"`.
