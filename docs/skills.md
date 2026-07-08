# Skills

Skills are prompt-visible capability packages under `shared/skills/<name>/`. A preset exposes skills by listing their directories in `skillDirs`.

## Inventory

| Skill | Purpose | CLI (path-promoted) | Wired into |
| --- | --- | --- | --- |
| `browser-control` | `$B` browser automation contract and safety rules | — (uses `$B`) | `web` |
| `tavily-search` | Tavily web search and extraction | `tavily-search`, `tavily-extract` | `web` |
| `exa-search` | Exa search, similar-links, and contents | `exa-search`, `exa-similar`, `exa-contents` | `web` |
| `arxiv-search` | arXiv search and paper fetch | `arxiv-search`, `arxiv-fetch` | `web` |
| `congress-search` | congress.gov search and fetch | `congress-search`, `congress-fetch`, `congress-api` | `web` |
| `btc-price` | CoinGecko spot price | `btc-price` | `web` |
| `humanizer` | De-AI prose editing and tone work | — | `write` |
| `how-to-debate` | Structure debate notes into evidence-based Socratic Arguments under `./arguments/` | — | `socratic` |
| `find-sources` | Delegate source-finding to `web` workers via `subagent`; citation-ready return contract | — | `socratic` |
| `workflow-builder` | Authoring conventions for workflow prompts | — | `workflow` |
| `todo` | Shared todo list | `todo` | (PATH only) |
| `ntfy` | Push notifications | `ntfy-send` | (PATH only) |
| `courtlistener` | CourtListener REST v4 via curl+jq | — | *not wired into any preset* |
| `random-number` | Bash `$RANDOM` how-to | — | *not wired into any preset; demo* |

`todo` and `ntfy` are not in any preset's `skillDirs`, but their CLIs are path-promoted, so any preset with `bash` can call them by basename. `courtlistener` and `random-number` are kept as reference; add them to a preset overlay's `skillDirs` if you want them prompt-visible.

## Structure

Each skill should have:

```text
shared/skills/<name>/SKILL.md
shared/skills/<name>/scripts/...
```

`SKILL.md` is the prompt-facing contract. Scripts are implementation details unless the skill intentionally exposes a command by basename.

`SKILL.md` should include:

- when to use the skill
- exact command names or invocation surface
- important safety boundaries
- expected outputs
- failure handling guidance when it affects agent behavior

Do not include secret setup instructions that duplicate script errors. Scripts that need runtime variables should fail clearly and name the missing variable.

## Path Promotion

Commands that should be callable by basename are listed in `scripts/path-promoted-skills.txt` (one skill folder name per line). Pi sessions and `scripts/bootstrap.sh` both use that registry to prepend the listed skills' `scripts/` directories to `PATH` — see [Runtime & Commands](runtime.md).

When a skill is path-promoted, say so in its `SKILL.md` and tell agents to use the basename, not a path into the repo. State explicitly that agents must run commands with the **bash** tool; the skill name is not a Pi tool.

## Runtime Env

Skills may depend on `~/.pi/mypi/mypi.env`, provider auth stores, or ordinary shell environment. They must not store secrets in the skill directory or inject secret values into prompts.

## Review Checklist

- The description is short and helps the agent decide whether to load the skill.
- Path-promoted skills say commands run via bash, not as a tool named after the skill.
- The body contains concrete usage instructions.
- Commands fail informatively before making network calls when required runtime values are missing.
- The skill avoids generated state, logs, caches, and credentials in the skill tree.
- Scripts use the root package's ESM convention or explicit extensions when needed.
