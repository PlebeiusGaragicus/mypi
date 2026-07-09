---
name: congress-search
description: Search and fetch U.S. Congress legislation via bash using congress-search, congress-fetch, and congress-api. Use for bills, laws, amendments, members, votes, CRS summaries, and congress.gov legislative research.
disable-model-invocation: false
---

# Congress.gov API CLI

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Run **`congress-search`**, **`congress-fetch`**, and **`congress-api`** by basename only (do not call `python3` with paths into this skill).

These commands are **bash** programs, not Pi tools. Use the **bash** tool with the basename only.

Scripts use only the Python standard library. They print readable text by default, support `--json` where useful, and print specific `Error:` lines to stderr on failure.

## Congress.gov API vs scraping

Prefer this skill and the **Congress.gov API** for legislative data on congress.gov. Automated browsing of congress.gov often fails (bot protection).

The API has **no full-text search**. Use `--keyword` on `congress-search` for best-effort filtering over listed results, or narrow with `--congress`, `--type`, and date filters.

## Commands

```bash
congress-search bills --congress 118 --keyword postal --limit 10
congress-search summaries --congress 118 --type hr --keyword climate
congress-search members --state CA --congress 118
congress-fetch 118 hr 3076
congress-api /congress/current
congress-api /bill/118/hr/3076/summaries --limit 5
```

### `congress-search`

Subcommands:

- **`bills`** — list bills; `--type hr|s|...`; `--from` / `--to` (YYYY-MM-DD); `--keyword` filters titles
- **`summaries`** — CRS summaries; good for topic discovery; `--keyword` filters summary text
- **`members`** — `--state` + optional `--district`, or members in `--congress`

Shared flags: `--congress` (default: current), `--limit` (default 20, max 250 per page), `--max-pages` (default 3), `--json`.

### `congress-fetch`

```bash
congress-fetch 118 hr 3076
congress-fetch 118-HR-3076 --sections summaries,actions,cosponsors
congress-fetch 118 hr 3076 --output ./bill-report.txt
```

Default sections: summaries, actions, cosponsors. Use `--max-chars` only for a short stdout preview.

### `congress-api`

Low-level GET for any v3 path:

```bash
congress-api /bill/118 --limit 5 --from 2024-01-01
congress-api /member/M000087 --json
```

`--max-pages` follows `pagination.next` (default 1). Rate limit: 5,000 requests/hour — keep `--max-pages` small.

## Workflow

1. Use **`congress-search`** to find candidates (5–15 results unless broader coverage is needed).
2. Answer the user’s question from search output when possible; do not return only a list unless they asked for one.
3. Run **`congress-fetch`** on one bill when detail (CRS summary, actions, cosponsors) is needed.
4. Cite bills as **`118 HR 3076`** and include congress.gov URLs from script output.
5. Run at most one equivalent search per user message unless the query changes.

## Failure handling

- If a script exits nonzero, read stderr before retrying.
- Missing API key: scripts exit 1; read stderr (setup URL, config path, and agent guidance). A push notification may also fire if ntfy is configured.
- HTTP 403: check the API key.
- No results: broaden `--keyword`, drop `--type`, or widen date filters.

## More detail

See [REFERENCE.md](REFERENCE.md) for endpoint notes and bill type codes.
