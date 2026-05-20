---
name: tavily-search
description: Search and extract live web content with Tavily using scripts. Use for current web research, source discovery, news, vendor docs, and citation-backed synthesis.
disable-model-invocation: false
---

# Tavily CLI

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Run **`tavily-search`** and **`tavily-extract`** by basename only (do not call `node` with paths into this skill).

The scripts are intentionally verbose on failure: missing keys, unknown options, missing option values, rate limits, plan limits, and Tavily HTTP errors print a specific `Error:` line to stderr and exit nonzero.

## Commands

```bash
tavily-search "query" --num 8
tavily-search "latest AI regulation" --topic news --time-range week
tavily-extract https://example.com/article --max-chars 4000
```

Add `--json` to either command when raw machine-readable output is more useful than the default readable text.

## Search

Use **`tavily-search`** first to find candidate sources:

```bash
tavily-search "recent AI search APIs" --num 5
tavily-search "NVIDIA earnings guidance" --topic finance --time-range month
tavily-search "California AI safety law update" --topic news --time-range week
```

Options:

- `--num N`: result count, default 10, max 20.
- `--topic TYPE`: `general`, `news`, or `finance`.
- `--time-range RANGE`: `day`, `week`, `month`, or `year`.
- `--search-depth DEPTH`: `basic` or `advanced`; default `basic`. Use `advanced` only when basic results are clearly insufficient because it can cost more credits.
- `--max-raw-chars N`: max raw excerpt characters per result, default 2000.
- `--json`: print the raw Tavily API response.

The search script always requests raw page content, disables Tavily's generated answer, and requests usage data. Do the synthesis yourself from the returned sources.

## Extract

Use **`tavily-extract`** after search when one or more URLs are worth reading more deeply:

```bash
tavily-extract https://url1.example https://url2.example
tavily-extract https://example.com/report --depth advanced --max-chars 8000
```

Options:

- `--depth DEPTH`: `basic` or `advanced`; default `basic`.
- `--max-chars N`: max content characters per URL in readable output, default 6000.
- `--json`: print the raw Tavily API response.

## Workflow

1. Search with 5-10 results unless the task clearly needs broader coverage.
2. Add `--topic news` and `--time-range` when freshness matters.
3. Extract only the URLs that look authoritative or unusually relevant.
4. Cite URLs from the script output in the final answer.
5. Stop when results converge; repeated Tavily calls cost credits.

## Failure Handling

- If a script exits nonzero, read stderr before retrying.
- If Tavily returns HTTP 429, report the retry guidance and avoid immediate repeated calls.
- If Tavily returns a plan or credit limit error, tell the user and stop searching.
- If output is too verbose, retry with fewer results or a lower character cap.
